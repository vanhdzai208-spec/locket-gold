# Locket Web — Complete Full-Stack Client & Image Editor

> ⚠️ **Disclaimer & Educational Purpose**: This project is developed for technical research and pair-programming with the user's personal Locket account. It integrates with **unofficial / private Locket APIs** powered by Firebase. These APIs may change without prior notice from Locket Labs, Inc. This project is not affiliated with, endorsed by, or sponsored by Locket Labs, Inc.

---

## 1. Project Overview

**Locket Web** is a full-featured web application allowing users to authenticate with their personal Locket account, upload and perform rich client-side edits on photos (crop 1:1, rotate, flip, adjust brightness/contrast/saturation, apply filters), and seamlessly post moments directly to their friends' Locket widgets.

### Key Highlights
- **Real End-to-End Integration**: Authenticates via Google Identity Toolkit (Firebase Auth), uploads optimized WebP thumbnails via Google Cloud Storage (GCS) Resumable Upload protocol to `locket-img`, and broadcasts moments via Locket's Cloud Functions (`postMomentV2`).
- **Client-Side Image Editor Engine**: HTML5 Canvas engine with 1:1 square crop (identical to Locket's phone widget), pan/zoom controls, -90°/+90° rotation, horizontal/vertical flipping, fine-grained lighting adjustments, and 7 color presets (Golden Hour, Noir, Film 90s, Vivid Pop, etc.).
- **Live Widget Preview**: See your edited photo inside a simulated iPhone widget container with time badge, avatar badge, and live caption overlay.
- **Enterprise-Grade Security**: Passwords are never logged or stored. Session tokens are encrypted using **AES-256-GCM** and transmitted via secure `HttpOnly`, `SameSite: Lax` cookies. Includes magic number byte-sniffing to prevent MIME spoofing and malicious file uploads.
- **Self-Healing Token Refresh**: Automatically detects when Firebase ID tokens are expiring (< 60s) and transparently refreshes them using Firebase Secure Token API without disrupting the user.

---

## 2. System Architecture

```text
┌─────────────────────────────────────────────────────────┐
│                    Browser Client                       │
│  Next.js 15 + React 19 + TypeScript + Tailwind CSS      │
│  - Canvas Image Editor (Crop 1:1, Rotate, Filters)      │
│  - Real-time Widget & Caption Overlay Preview           │
└────────────────────────────┬────────────────────────────┘
                             │ 1. Credentials (Login)
                             │ 2. WebP Blob + Caption (Post)
                             ▼
┌─────────────────────────────────────────────────────────┐
│                   NestJS Backend                        │
│  - Auth Module: Firebase Identity Toolkit proxy         │
│  - Session Manager: AES-256-GCM Encrypted HttpOnly Cookie│
│  - Storage Service: GCS Resumable Upload to locket-img  │
│  - Post Service: Calls https://api.locketcamera.com     │
│  - Security: Rate Limiting, Magic Bytes MIME validation │
└─────────────┬───────────────────────────┬───────────────┘
              │                           │
  3. Auth & Token Refresh                 │ 4. Resumable Upload (WebP)
              ▼                           ▼
┌───────────────────────────┐   ┌─────────────────────────┐
│ Google Identity Toolkit   │   │ Firebase Storage Bucket │
│ & Secure Token API        │   │ (gs://locket-img)       │
└───────────────────────────┘   └─────────────┬───────────┘
                                              │ 5. Download URL
                                              ▼
                                ┌─────────────────────────┐
                                │ Locket API Gateway      │
                                │ POST /postMomentV2      │
                                └─────────────────────────┘
```

---

## 3. Monorepo Structure

```text
D:\Locket
├── apps/
│   ├── backend/                     # NestJS 10 Application
│   │   ├── src/
│   │   │   ├── auth/                # Login, Logout, Profile routes
│   │   │   ├── locket/              # Storage upload, Locket client, Post service
│   │   │   ├── session/             # AES-256-GCM encrypted cookie manager
│   │   │   ├── common/              # Guards, Filters, Interceptors, Decorators
│   │   │   ├── app.module.ts
│   │   │   └── main.ts
│   │   ├── .env                     # Backend environment configuration
│   │   └── package.json
│   │
│   └── frontend/                    # Next.js 15 Application (App Router)
│       ├── src/
│       │   ├── app/                 # Layout, globals.css, HomePage
│       │   ├── components/          # LoginScreen, UploadDropzone, ImageEditor, PostScreen, Header
│       │   ├── context/             # AuthContext (global state)
│       │   └── lib/                 # Typed API client with credentials
│       ├── .env.local               # Frontend environment configuration
│       └── package.json
│
├── docs/
│   └── locket-api-research.md       # Full reverse-engineering documentation & API proofs
├── package.json                     # Monorepo root scripts
├── pnpm-workspace.yaml
└── README.md
```

---

## 4. Requirements & Installation

### Requirements
- **Node.js**: `v18.0.0` or higher (tested on `v22.20.0`)
- **pnpm**: `v9.0.0` or higher (recommended) or `npm`

### 1. Clone & Install Dependencies
```bash
cd D:\Locket
pnpm install
```

### 2. Configure Environment Variables
Create `.env` file in `apps/backend/.env`:

**Backend (`apps/backend/.env`)**:
```env
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# 32+ character random string for AES-256-GCM session cookie encryption
SESSION_SECRET=your_super_secret_session_key_32bytes_long

# Locket Firebase Configuration
LOCKET_API_BASE_URL=https://api.locketcamera.com
FIREBASE_API_KEY=your_firebase_api_key
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_STORAGE_BUCKET=your_storage_bucket

THROTTLE_TTL=60
THROTTLE_LIMIT=60
```

**Frontend (`apps/frontend/.env.local`)**:
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

---

## 5. Running the Application

### Option A: Run Both Services Concurrently
From root directory:
```bash
pnpm dev
```
- **Frontend**: [http://localhost:3000](http://localhost:3000)
- **Backend API**: [http://localhost:3001](http://localhost:3001)

### Option B: Run Services Individually
```bash
# Terminal 1: Backend
pnpm dev:backend

# Terminal 2: Frontend
pnpm dev:frontend
```

---

## 6. Testing & Quality Verification

Run unit tests covering crypto integrity, magic byte verification, token refresh logic, and payload generation:
```bash
pnpm test:backend
```

Build production artifacts for both apps:
```bash
pnpm build
```

---

## 7. Backend API Specification

| Method | Endpoint | Protection | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/auth/locket/login` | Throttled (5/min) | Authenticates with Locket email/password and sets encrypted session cookie. |
| `POST` | `/auth/locket/logout` | None | Clears the session cookie. |
| `GET` | `/auth/locket/me` | `AuthGuard` | Returns current user profile (UID, email, display name, photo URL). |
| `POST` | `/locket/post` | `AuthGuard`, Throttled (5/min) | Accepts `multipart/form-data` with `image` (max 4MB) and optional `caption`. |

### Standard API Response Formats

**Success**:
```json
{
  "success": true,
  "data": {
    "momentUid": "abc123456",
    "downloadUrl": "https://firebasestorage.googleapis.com/...",
    "createdAt": 1726131234
  },
  "timestamp": "2026-09-12T10:00:00.000Z"
}
```

**Error**:
```json
{
  "success": false,
  "error": {
    "code": "INVALID_PASSWORD",
    "message": "Incorrect password. Please verify your Locket credentials."
  },
  "timestamp": "2026-09-12T10:00:00.000Z"
}
```

---

## 8. Security & Error Handling Safeguards

1. **Zero Credential Retention**: Locket passwords only exist in memory during the initial `verifyPassword` call. They are never written to disk, database, or logs.
2. **Encrypted Refresh Tokens**: The Firebase `refreshToken` is encrypted with AES-256-GCM using `SESSION_SECRET` before being stored in an `HttpOnly` cookie. The client JavaScript cannot access it directly (XSS protection).
3. **Magic Byte MIME Sniffing**: The backend inspects the initial bytes of uploaded files (`RIFF....WEBP`, `FF D8 FF`, `89 50 4E 47`) to guarantee valid image payloads, defeating MIME spoofing.
4. **Rate Limiting**: Throttler guards prevent brute-force attacks on login and spamming the Locket API.
5. **Sanitized Logs**: Logging interceptor suppresses request bodies, cookies, and authorization headers to guarantee no tokens or sensitive information leak to stdout.

---

## 9. Known Limitations

- **Private API Dependency**: Uses Locket's internal Google Cloud Function `postMomentV2`. If Locket Labs modifies the payload schema or enforces Firebase App Check in blocking mode, updates will be required.
- **Square Aspect Ratio**: Moments are tailored for the 1:1 square Locket widget format. Non-square photos are automatically cropped/fitted in the editor.
- **Photo Scope**: This project is optimized for photo/image moments. Video moments require transcoded MP4 uploads to `locket-video` with thumbnail generation.
