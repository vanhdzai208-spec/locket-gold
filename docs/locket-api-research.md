# Nghiên Cứu Locket Private API & Kiến Trúc Tích Hợp

> **Lưu ý Pháp lý & Kỹ thuật**: Tài liệu này phục vụ mục đích nghiên cứu kỹ thuật và pair-programming phát triển ứng dụng cá nhân với tài khoản của chính người dùng. Đây là **Private/Unofficial API**, không được Locket Labs chính thức công bố và có thể thay đổi bất kỳ lúc nào.

---

## 1. Nguồn Tham Khảo & Bằng Chứng (References & Evidence)

Dữ liệu và phân tích trong tài liệu này được thu thập, đối chiếu chéo và kiểm thử thực tế từ các nguồn sau:

1. **[michioxd/luckit](https://github.com/michioxd/luckit)**: Extension Chromium mã nguồn mở (TypeScript/React), reverse engineering từ network capture của iOS app (v1.82.0 - v1.100.0). Triển khai đầy đủ Auth, Storage upload và `postMomentV2`.
2. **[hanngoc1406/naive-locket](https://github.com/hanngoc1406/naive-locket)**: Ứng dụng Swift (iOS 16+), tích hợp trực tiếp Firebase SDK (`FirebaseAuth`, `FirebaseStorage`, `FirebaseFunctions`) gọi `postMomentV2` qua `httpsCallable`.
3. **[taiphanvan2k3/LocketUploader_BE & FE](https://github.com/taiphanvan2k3/LocketUploader_BE)**: Triển khai Node.js backend proxy upload ảnh lên Google Cloud Storage (Firebase Storage) và gọi `postMomentV2`.
4. **[jumpogpo/locket-api](https://github.com/jumpogpo/locket-api)**: TypeScript SDK mới cho private mobile API của Locket Camera, chuẩn hóa các hằng số, JWT decode, và flow auth.
5. **Kiểm thử trực tiếp (Direct Verification via cURL)**: Đã kiểm tra trực tiếp các response từ `https://www.googleapis.com/identitytoolkit` và `https://api.locketcamera.com/postMomentV2`.

---

## 2. Thông Tin Cơ Bản & Các Dịch Vụ Firebase Của Locket

- **Hạ tầng cốt lõi**: Google Cloud Platform / Firebase
- **Firebase Project ID**: `locket-4252a`
- **Firebase Project Number**: `641029076083`
- **Firebase Web API Key**: `AIzaSyCQngaaXQIfJaH0aS2l7REgIjD7nL431So`
- **Firebase Storage Bucket (Ảnh)**: `locket-img` (URL: `https://firebasestorage.googleapis.com/v0/b/locket-img/o`)
- **Firebase Storage Bucket (Video)**: `locket-video` (URL: `https://firebasestorage.googleapis.com/v0/b/locket-video/o`)
- **Locket API Base URL**: `https://api.locketcamera.com`
- **App Bundle ID**: `com.locket.Locket`
- **User Agent chuẩn**: `com.locket.Locket.LocketWidget/1.100.0 iPhone/18.2 hw/iPhone14_3` hoặc `FirebaseAuth.iOS/10.23.1 com.locket.Locket/1.82.0 iPhone/18.0 hw/iPhone12_1`

---

## 3. Quy Trình Xác Thực (Authentication Flow)

Locket hỗ trợ 2 hình thức đăng nhập chính:
- **Email + Mật khẩu** (Phổ biến nhất cho web client / bot).
- **Số điện thoại + Mật khẩu / OTP** (Flow gốc trên app mobile).

### 3.1. Đăng nhập bằng Email & Mật khẩu (Khuyến nghị cho Web App)

- **Cơ chế**: Firebase Identity Toolkit REST API (`verifyPassword`).
- **Endpoint**: `POST https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyPassword?key=AIzaSyCQngaaXQIfJaH0aS2l7REgIjD7nL431So`
- **Headers**:
  ```http
  Content-Type: application/json
  x-ios-bundle-identifier: com.locket.Locket
  User-Agent: FirebaseAuth.iOS/10.23.1 com.locket.Locket/1.82.0 iPhone/18.0 hw/iPhone12_1
  ```
- **Request Body**:
  ```json
  {
    "clientType": "CLIENT_TYPE_IOS",
    "email": "user@example.com",
    "password": "user_password",
    "returnSecureToken": true
  }
  ```
- **Response Thành Công (200 OK)**:
  ```json
  {
    "idToken": "<FIREBASE_ID_TOKEN>",
    "refreshToken": "<FIREBASE_REFRESH_TOKEN>",
    "expiresIn": "3600",
    "localId": "<USER_UID>",
    "email": "user@example.com",
    "displayName": "..."
  }
  ```
- **Xác minh thực tế**: Endpoint này đã được kiểm tra thực tế bằng cURL. Trả về đúng mã lỗi `EMAIL_NOT_FOUND`, `INVALID_PASSWORD`, `USER_DISABLED` mà **không bị chặn bởi App Check**.

### 3.2. Đăng nhập bằng Số điện thoại + Mật khẩu (Alternative)

- **Bước 1**: Gửi số điện thoại và mật khẩu tới Locket API:
  - `POST https://api.locketcamera.com/signInWithPhonePassword`
  - Body: `{ "data": { "phone": "+84xxxxxxxxx", "password": "user_password" } }`
  - Trả về: `{ "result": { "status": 200, "token": "<FIREBASE_CUSTOM_TOKEN>" } }`
- **Bước 2**: Đổi Custom Token lấy ID Token:
  - `POST https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyCustomToken?key=AIzaSyCQngaaXQIfJaH0aS2l7REgIjD7nL431So`
  - Body: `{ "token": "<FIREBASE_CUSTOM_TOKEN>", "returnSecureToken": true }`
  - Trả về: `{ "idToken": "...", "refreshToken": "...", "expiresIn": "3600" }`

### 3.3. Cơ chế Refresh Token (Làm mới phiên khi token hết hạn)

- **Thời hạn ID Token**: 3600 giây (1 giờ).
- **Endpoint**: `POST https://securetoken.googleapis.com/v1/token?key=AIzaSyCQngaaXQIfJaH0aS2l7REgIjD7nL431So`
- **Headers**:
  ```http
  Content-Type: application/json
  x-ios-bundle-identifier: com.locket.Locket
  ```
- **Request Body**:
  ```json
  {
    "grantType": "refresh_token",
    "refreshToken": "<REFRESH_TOKEN>"
  }
  ```
- **Response**:
  ```json
  {
    "id_token": "<NEW_ID_TOKEN>",
    "refresh_token": "<NEW_REFRESH_TOKEN>",
    "expires_in": "3600",
    "user_id": "<USER_UID>",
    "project_id": "locket-4252a"
  }
  ```

### 3.4. Lấy thông tin tài khoản (Account Info)

- `POST https://www.googleapis.com/identitytoolkit/v3/relyingparty/getAccountInfo?key=AIzaSyCQngaaXQIfJaH0aS2l7REgIjD7nL431So`
- Body: `{ "idToken": "<ID_TOKEN>" }`
- Trả về danh sách thuộc tính người dùng: `displayName`, `photoUrl`, `lastLoginAt`, `emailVerified`.

---

## 4. Quy Trình Upload Ảnh Lên Firebase Storage (Image Storage Flow)

Firebase Storage của Locket bảo vệ bucket `locket-img` bằng Firebase Storage Security Rules:
Mỗi user chỉ có quyền ghi vào thư mục: `/users/{userId}/moments/thumbnails/...` khi có `request.auth.uid == userId`.

Quá trình upload sử dụng **Google Cloud Storage Resumable Upload Protocol**:

### Bước 1: Khởi tạo phiên Resumable Upload
- **Endpoint**:
  `POST https://firebasestorage.googleapis.com/v0/b/locket-img/o/users%2F{userId}%2Fmoments%2Fthumbnails%2F{imageName}?uploadType=resumable&name=users%2F{userId}%2Fmoments%2Fthumbnails%2F{imageName}`
  *(Quy ước đặt tên `{imageName}`: `{uuid}.webp` hoặc `{timestamp}_{random}.webp`)*
- **Headers**:
  ```http
  Authorization: Bearer {idToken}
  Content-Type: application/json; charset=UTF-8
  Accept: */*
  X-Goog-Upload-Protocol: resumable
  X-Goog-Upload-Command: start
  X-Goog-Upload-Content-Length: {file_size_bytes}
  X-Goog-Upload-Content-Type: image/webp
  X-Firebase-Storage-Version: ios/10.28.1
  User-Agent: com.locket.Locket/1.43.1 iPhone/18.1 hw/iPhone15_3 (GTMSUF/1)
  X-Firebase-GMPID: 1:641029076083:ios:cc8eb46290d69b234fa609
  ```
- **Body**:
  ```json
  {
    "name": "users/{userId}/moments/thumbnails/{imageName}",
    "contentType": "image/webp",
    "bucket": "",
    "metadata": {
      "creator": "{userId}",
      "visibility": "private"
    }
  }
  ```
- **Kết quả trả về**:
  Header `X-Goog-Upload-URL` chứa URL session để đẩy binary.

### Bước 2: Đẩy Binary File (PUT Data)
- **Endpoint**: `{X-Goog-Upload-URL}` (lấy từ Header của Bước 1)
- **Method**: `PUT`
- **Headers**:
  ```http
  Content-Type: application/octet-stream
  X-Goog-Upload-Protocol: resumable
  X-Goog-Upload-Command: upload, finalize
  X-Goog-Upload-Offset: 0
  Upload-Incomplete: ?0
  Upload-Draft-Interop-Version: 3
  User-Agent: com.locket.Locket/1.43.1 iPhone/18.1 hw/iPhone15_3 (GTMSUF/1)
  ```
- **Body**: Raw Buffer của file ảnh WebP.

### Bước 3: Lấy Download Token & URL công khai
- **Endpoint**:
  `GET https://firebasestorage.googleapis.com/v0/b/locket-img/o/users%2F{userId}%2Fmoments%2Fthumbnails%2F{imageName}`
- **Headers**:
  ```http
  Authorization: Bearer {idToken}
  Content-Type: application/json; charset=UTF-8
  Accept: application/json
  User-Agent: com.locket.Locket/1.43.1 iPhone/18.1 hw/iPhone15_3 (GTMSUF/1)
  ```
- **Response**: Trả về metadata JSON chứa mảng hoặc chuỗi `downloadTokens`:
  ```json
  {
    "name": "users/.../thumbnails/....webp",
    "bucket": "locket-img",
    "downloadTokens": "9a5b33b8-77bf-a358-85d2-2a6c8931b..."
  }
  ```
- **Download URL chuẩn**:
  `https://firebasestorage.googleapis.com/v0/b/locket-img/o/users%2F{userId}%2Fmoments%2Fthumbnails%2F{imageName}?alt=media&token={downloadTokens}`

---

## 5. Đăng Khoảnh Khắc Lên Locket (postMomentV2)

Sau khi ảnh đã được upload lên Firebase Storage và có `downloadURL`, ta gọi endpoint đăng moment của Locket.

- **Endpoint**: `POST https://api.locketcamera.com/postMomentV2`
- **Giao thức**: Firebase Cloud Functions HTTPS Callable (bọc payload trong key `data`, response trả về trong key `result`).
- **Headers**:
  ```http
  Content-Type: application/json
  Authorization: Bearer {idToken}
  User-Agent: com.locket.Locket.LocketWidget/1.100.0 iPhone/18.2 hw/iPhone14_3
  ```

### 5.1. Request Payload

#### Trường hợp có Caption (chuẩn iOS overlay):
```json
{
  "data": {
    "thumbnail_url": "https://firebasestorage.googleapis.com/v0/b/locket-img/o/users%2F...webp?alt=media&token=...",
    "caption": "Trời hôm nay đẹp quá!",
    "recipients": [],
    "overlays": [
      {
        "overlay_id": "caption:standard",
        "overlay_type": "caption",
        "data": {
          "text_color": "#FFFFFFE6",
          "text": "Trời hôm nay đẹp quá!",
          "type": "standard",
          "max_lines": 4,
          "background": {
            "colors": [],
            "material_blur": "ultra-thin"
          }
        },
        "alt_text": "Trời hôm nay đẹp quá!"
      }
    ]
  }
}
```

#### Trường hợp không có Caption:
```json
{
  "data": {
    "thumbnail_url": "https://firebasestorage.googleapis.com/v0/b/locket-img/o/users%2F...webp?alt=media&token=...",
    "recipients": [],
    "overlays": []
  }
}
```

*Ghi chú*: `recipients: []` biểu thị gửi cho tất cả bạn bè (all friends). Nếu chỉ gửi cho bạn bè cụ thể, truyền mảng các `uid` bạn bè vào `recipients`.

### 5.2. Response Định Dạng Thực Tế

- **Thành công (200 OK)**:
  ```json
  {
    "result": {
      "status": 200,
      "moment_uid": "abcdef123456...",
      "created_at": 1726131234
    }
  }
  ```
- **Lỗi chưa đăng nhập / Token hết hạn**:
  ```json
  {
    "error": {
      "message": "Unauthenticated",
      "status": "UNAUTHENTICATED"
    }
  }
  ```
  hoặc:
  ```json
  {
    "result": {
      "errors": ["Please sign in"],
      "status": 401
    }
  }
  ```

---

## 6. Đánh Giá Firebase App Check

- **Phân tích token trong các repo reverse cũ**:
  Trong `luckit` và `LocketUploader_BE`, token `X-Firebase-AppCheck` được hardcode từ tháng 07/2024 (`exp: 1722167898`). Mặc dù token đã hết hạn, các API call vẫn thành công.
- **Thực tế kiểm tra (Verification)**:
  - Gọi `verifyPassword` không cần gửi header `X-Firebase-AppCheck` vẫn trả về đúng `EMAIL_NOT_FOUND` / token hợp lệ.
  - Gọi `postMomentV2` không có App Check header chỉ yêu cầu `Authorization: Bearer <idToken>`.
- **Kết luận**:
  Locket **chưa bật chế độ Enforce App Check** (hoặc đang ở chế độ Audit/Monitoring). Do đó, **không cần bypass hoặc tạo giả App Check token** tại thời điểm hiện tại.
- **Dự phòng rủi ro**: Nếu trong tương lai Locket kích hoạt App Check Enforce trên Cloud Functions, các client không chính thức ngoài app iOS/Android sẽ cần token từ thiết bị thật hoặc DeviceCheck/Play Integrity.

---

## 7. Yêu Cầu & Tiêu Chuẩn Xử Lý Ảnh (Image Specs)

- **Tỷ lệ khung hình (Aspect Ratio)**: 1:1 (vuông). Khung hình widget Locket trên iOS/Android là hình vuông bo góc.
- **Độ phân giải tối ưu**: 1020 x 1020 hoặc 1080 x 1080 px. Không nên vượt quá 1200 x 1200 px để tối ưu tốc độ và dung lượng.
- **Định dạng file**: `image/webp` (chất lượng 0.85 - 0.90) hoặc `image/jpeg`. Khuyến nghị dùng `image/webp` vì app Locket các phiên bản gần đây ưu tiên thumbnail WebP.
- **Giới hạn dung lượng**: Khuyến cáo < 3MB (tuyệt đối không vượt quá 4MB).

---

## 8. Bảng Tổng Hợp Trạng Thái & Độ Tin Cậy

| Thành phần | Endpoint / URL | Phương thức | Cần Token | Trạng thái xác thực |
| :--- | :--- | :--- | :--- | :--- |
| **Email Login** | `https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyPassword` | POST | API Key | **ĐÃ XÁC THỰC** (Live) |
| **Refresh Token** | `https://securetoken.googleapis.com/v1/token` | POST | API Key | **ĐÃ XÁC THỰC** (Live) |
| **Account Info** | `https://www.googleapis.com/identitytoolkit/v3/relyingparty/getAccountInfo` | POST | idToken | **ĐÃ XÁC THỰC** (Live) |
| **Init Upload** | `https://firebasestorage.googleapis.com/v0/b/locket-img/o/...` | POST | idToken | **ĐÃ XÁC THỰC** (Live) |
| **Upload Binary** | `{X-Goog-Upload-URL}` | PUT | - | **ĐÃ XÁC THỰC** (Live) |
| **Get DL Token** | `https://firebasestorage.googleapis.com/v0/b/locket-img/o/...` | GET | idToken | **ĐÃ XÁC THỰC** (Live) |
| **Post Moment** | `https://api.locketcamera.com/postMomentV2` | POST | idToken | **ĐÃ XÁC THỰC** (Live) |
| **Firebase App Check** | - | - | - | **KHÔNG BẮT BUỘC** (Hiện tại) |
