import { apiRequest } from './api';

export function parseLocketUsername(input: string): string {
  if (!input) return '';
  let clean = input.trim();

  // Check if input is an invite link or storage link containing UID (28 chars)
  const directUidMatch = clean.match(
    /(?:invites?|users)(?:%2F|\/)([a-zA-Z0-9]{28})/i,
  );
  if (directUidMatch) {
    return directUidMatch[1];
  }

  clean = clean.replace(/^https?:\/\//i, '');
  clean = clean.replace(
    /^(?:www\.)?(?:locket\.cam|locket\.camera|locket\.page\.link)\//i,
    '',
  );
  clean = clean.replace(/^[@/]+/, '');
  clean = clean.split('?')[0].split('#')[0].split('/')[0].trim();
  return clean;
}

export interface GoldUserPreview {
  uid: string;
  username: string;
  firstName?: string;
  lastName?: string;
  displayName: string;
  profilePictureUrl?: string;
  goldInfo?: {
    hasGold: boolean;
    expiresDate?: string;
    productId?: string;
    isYearly?: boolean;
    durationLabel?: string;
    isAliasLimited?: boolean;
    canShareGold?: boolean;
  };
}

export interface GoldQueueStatus {
  ticketId: string;
  status: 'waiting' | 'processing' | 'completed' | 'error';
  position: number;
  totalQueue: number;
  estimatedSeconds: number;
  result?: {
    success: boolean;
    productId: string;
    expiresDate?: string;
    msg: string;
  };
  error?: string;
}

export interface GoldUpgradeResult {
  success: boolean;
  productId: string;
  expiresDate?: string;
  msg: string;
}

export interface MasterStatusResult {
  masterUid: string;
  hasGold: boolean;
  expiresDate?: string;
  productId?: string;
  isStillValid: boolean;
  isYearly?: boolean;
  durationLabel?: string;
  isAliasLimited?: boolean;
  canShareGold?: boolean;
  message: string;
}

export const goldApi = {
  // 1. Tra cứu thông tin người dùng từ Username (Công khai)
  previewUser: (username: string): Promise<GoldUserPreview> =>
    apiRequest<GoldUserPreview>('/gold/public/preview-user', {
      method: 'POST',
      body: JSON.stringify({ username }),
    }),

  // Kiểm tra trạng thái Master UUID (Công khai)
  getMasterStatus: (masterUid?: string): Promise<MasterStatusResult> =>
    apiRequest<MasterStatusResult>(
      `/gold/public/master-status${masterUid ? `?masterUid=${encodeURIComponent(masterUid)}` : ''}`,
      { method: 'GET' },
    ),

  // 2. Gửi yêu cầu up Gold vào hàng đợi (Công khai)
  submitPublicUpgrade: (
    username: string,
    packageType: '1m' | '1y' = '1y',
    masterUid?: string,
  ): Promise<GoldQueueStatus> =>
    apiRequest<GoldQueueStatus>('/gold/public/submit', {
      method: 'POST',
      body: JSON.stringify({ username, packageType, masterUid }),
    }),

  // 3. Kiểm tra trạng thái hàng đợi theo ticketId (Polling)
  getQueueStatus: (ticketId: string): Promise<GoldQueueStatus> =>
    apiRequest<GoldQueueStatus>(`/gold/public/status/${ticketId}`, {
      method: 'GET',
    }),

  // 4. Người dùng đã đăng nhập tự up cho chính mình (Authenticated)
  upgradeSelf: (packageType: '1m' | '1y' = '1y'): Promise<GoldUpgradeResult> =>
    apiRequest<GoldUpgradeResult>('/gold/upgrade-self', {
      method: 'POST',
      body: JSON.stringify({ packageType }),
    }),

  // 5. Người dùng đã đăng nhập tặng cho bạn bè (Authenticated)
  upgradeFriend: (
    options: {
      targetUid?: string;
      username?: string;
      packageType?: '1m' | '1y';
      masterUid?: string;
    },
  ): Promise<GoldUpgradeResult> =>
    apiRequest<GoldUpgradeResult>('/gold/upgrade-friend', {
      method: 'POST',
      body: JSON.stringify({
        targetUid: options.targetUid,
        username: options.username,
        packageType: options.packageType || '1y',
        masterUid: options.masterUid,
      }),
    }),
};
