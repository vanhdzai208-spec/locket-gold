import {
  LocketFeedResponse,
  LocketFriend,
  MomentDetailsResponse,
} from '../types/feed';
import {
  LocketConversation,
  MessagesResponse,
  LocketMessage,
  DeletedFriend,
  SendMessagePayload,
  ActiveFriend,
} from '../types/chat';

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || '/api/backend';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoUrl?: string;
}

export interface PostMomentResponse {
  momentUid: string;
  downloadUrl: string;
  videoUrl?: string;
  createdAt: number;
}

let cachedCsrfToken: string | null = null;

export function getCsrfTokenFromCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export async function ensureCsrfToken(): Promise<string | null> {
  let token = getCsrfTokenFromCookie();
  if (token) {
    cachedCsrfToken = token;
    return token;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/auth/locket/csrf-token`, {
      credentials: 'include',
    });
    if (res.ok) {
      const json = await res.json();
      token = json?.data?.csrfToken || json?.csrfToken || getCsrfTokenFromCookie();
      if (token) {
        cachedCsrfToken = token;
        return token;
      }
    }
  } catch (e) {
    console.debug('Failed to fetch CSRF token:', e);
  }

  return cachedCsrfToken;
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = new Headers(options.headers || {});

  if (!(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const method = (options.method || 'GET').toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const csrfToken =
      getCsrfTokenFromCookie() || cachedCsrfToken || (await ensureCsrfToken());
    if (csrfToken) {
      headers.set('X-CSRF-Token', csrfToken);
    }
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include', // Crucial for HttpOnly session cookie transmission
  });

  const json: ApiResponse<T> = await response.json();

  if (!response.ok || !json.success) {
    const errorMsg =
      json.error?.message ||
      `Request failed with status ${response.status}`;
    const error = new Error(errorMsg);
    (error as any).code = json.error?.code || 'REQUEST_FAILED';
    throw error;
  }

  return json.data as T;
}

const request = apiRequest;

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request<{ user: UserProfile }>('/auth/locket/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    logout: () =>
      request<{ message: string }>('/auth/locket/logout', {
        method: 'POST',
      }),
    getMe: () => request<UserProfile>('/auth/locket/me', { method: 'GET' }),
  },
  locket: {
    postMoment: (
      imageBlob: Blob,
      caption?: string,
      recipients?: string[],
      videoBlob?: Blob,
    ) => {
      const formData = new FormData();
      if (videoBlob) {
        formData.append('video', videoBlob, 'moment.mp4');
        formData.append('thumbnail', imageBlob, 'thumbnail.webp');
      } else {
        formData.append('image', imageBlob, 'moment.webp');
      }
      if (caption && caption.trim().length > 0) {
        formData.append('caption', caption.trim());
      }
      if (recipients && recipients.length > 0) {
        formData.append('recipients', JSON.stringify(recipients));
      }

      return request<PostMomentResponse>('/locket/post', {
        method: 'POST',
        body: formData,
      });
    },
    getFriends: () =>
      request<LocketFriend[]>('/locket/friends', {
        method: 'GET',
      }),
    getMomentDetails: (momentId: string) =>
      request<MomentDetailsResponse>(
        `/locket/moments/${encodeURIComponent(momentId)}/details`,
        {
          method: 'GET',
        },
      ),
    deleteMoment: (momentId: string) =>
      request<{
        success: boolean;
        momentUid: string;
        deletedCount?: number;
        deletedUids?: string[];
      }>(
        `/locket/moments/${encodeURIComponent(momentId)}`,
        {
          method: 'DELETE',
        },
      ),
    getFeed: (params?: { since?: number; full?: boolean; quick?: boolean }) => {
      const query = new URLSearchParams();
      if (params?.since) query.set('since', String(params.since));
      if (params?.full) query.set('full', 'true');
      if (params?.quick) query.set('quick', 'true');
      const qs = query.toString();
      return request<LocketFeedResponse>(`/locket/feed${qs ? `?${qs}` : ''}`, {
        method: 'GET',
      });
    },
    getConversations: () =>
      request<LocketConversation[]>('/locket/conversations', {
        method: 'GET',
      }),
    getMessages: (convId: string) =>
      request<MessagesResponse>(
        `/locket/conversations/${encodeURIComponent(convId)}/messages`,
        {
          method: 'GET',
        },
      ),
    sendMessage: (convId: string, payload: SendMessagePayload) =>
      request<LocketMessage>(
        `/locket/conversations/${encodeURIComponent(convId)}/messages`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      ),
    getDeletedFriends: () =>
      request<DeletedFriend[]>('/locket/friends/deleted', {
        method: 'GET',
      }),
    getActiveFriends: () =>
      request<ActiveFriend[]>('/locket/friends/active', {
        method: 'GET',
      }),
  },
};
