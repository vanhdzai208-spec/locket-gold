import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { LocketApiClient } from '../locket/locket-api.client';
import {
  DEFAULT_MASTER_UID,
  GOLD_PACKAGES,
  GoldPackageType,
  REVENUECAT_AUTH_KEY,
  REVENUECAT_BASE_URL,
  REVENUECAT_COMMON_HEADERS,
} from './gold.constants';

export interface UserPreviewResult {
  uid: string;
  username: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
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

export interface QueueItem {
  ticketId: string;
  username: string;
  targetUid?: string;
  masterUid?: string;
  packageType: GoldPackageType;
  status: 'waiting' | 'processing' | 'completed' | 'error';
  result?: any;
  error?: string;
  addedAt: number;
  startedAt?: number;
  completedAt?: number;
}

export interface QueueStatusResponse {
  ticketId: string;
  status: 'waiting' | 'processing' | 'completed' | 'error';
  position: number;
  totalQueue: number;
  estimatedSeconds: number;
  result?: any;
  error?: string;
}

@Injectable()
export class GoldService implements OnModuleDestroy {
  private readonly logger = new Logger(GoldService.name);

  // Bot Credentials & Cached Tokens
  private readonly botEmail?: string;
  private readonly botPassword?: string;
  private botIdToken: string | null = null;
  private botRefreshToken: string | null = null;
  private botTokenExpiry = 0;
  private botUid: string | null = null;

  // In-Memory Queue State
  private queue: string[] = []; // ticketIds waiting in line
  private items = new Map<string, QueueItem>();
  private currentProcessingTicketId: string | null = null;
  private processingDurations: number[] = [4000]; // initial avg 4s
  private isWorkerActive = false;
  private shouldStopWorker = false;
  private workerTimeout: NodeJS.Timeout | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly locketApiClient: LocketApiClient,
  ) {
    this.botEmail = this.configService.get<string>('LOCKET_BOT_EMAIL')?.trim();
    this.botPassword = this.configService
      .get<string>('LOCKET_BOT_PASSWORD')
      ?.trim();

    if (!this.botEmail || !this.botPassword) {
      this.logger.warn(
        '[CONFIG] LOCKET_BOT_EMAIL hoặc LOCKET_BOT_PASSWORD chưa được cấu hình. Tính năng tra cứu Username công khai sẽ cần thông tin bot.',
      );
    }

    this.startWorker();
  }

  onModuleDestroy() {
    this.shouldStopWorker = true;
    if (this.workerTimeout) {
      clearTimeout(this.workerTimeout);
    }
  }

  // ============================================================================
  // 1. Master Bot & User Lookup
  // ============================================================================

  getMasterUid(customUid?: string): string {
    if (customUid) {
      const clean = customUid.replace(/\s+/g, '');
      if (/^[a-zA-Z0-9]{28}$/.test(clean)) {
        return clean;
      }
    }
    const envMasterUid = this.configService
      .get<string>('LOCKET_MASTER_GOLD_UID')
      ?.trim();
    if (envMasterUid && /^[a-zA-Z0-9]{28}$/.test(envMasterUid.replace(/\s+/g, ''))) {
      return envMasterUid.replace(/\s+/g, '');
    }
    if (this.botUid) {
      return this.botUid;
    }
    return DEFAULT_MASTER_UID;
  }

  detectIsYearly(productId?: string, expiresDate?: string): boolean {
    const pid = (productId || '').toLowerCase();
    if (
      pid.includes('1y') ||
      pid.includes('3600') ||
      pid.includes('year') ||
      pid.includes('annual') ||
      pid.includes('p1y') ||
      pid.includes('12m')
    ) {
      return true;
    }
    if (expiresDate) {
      const expTime = new Date(expiresDate).getTime();
      // If expiry date is more than 45 days in the future, it's a yearly/multi-month subscription
      if (expTime - Date.now() > 45 * 86400000) {
        return true;
      }
    }
    return false;
  }

  async checkMasterStatus(customUid?: string): Promise<{
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
  }> {
    const masterUid = this.getMasterUid(customUid);
    try {
      const rcRes = await axios.get(
        `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(masterUid)}`,
        {
          headers: {
            Authorization: REVENUECAT_AUTH_KEY,
            'X-Platform': 'iOS',
          },
          timeout: 6000,
        },
      );
      const gold = rcRes?.data?.subscriber?.entitlements?.Gold;
      if (gold) {
        const expiresDate = gold.expires_date;
        const isStillValid =
          !expiresDate || new Date(expiresDate).getTime() > Date.now();
        const isYearly = this.detectIsYearly(gold.product_identifier, expiresDate);
        const durationLabel = isYearly ? '1 Năm' : '1 Tháng';
        const formattedDate = expiresDate
          ? new Date(expiresDate).toLocaleDateString('vi-VN')
          : 'vĩnh viễn';

        // Check if master account has reached RevenueCat's 50 alias limit
        let isAliasLimited = false;
        try {
          await axios.post(
            `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(masterUid)}/alias`,
            { new_app_user_id: masterUid },
            {
              headers: {
                Authorization: REVENUECAT_AUTH_KEY,
                'Content-Type': 'application/json',
              },
              timeout: 3000,
            },
          );
        } catch (aliasErr: any) {
          if (aliasErr.response?.data?.code === 7255) {
            isAliasLimited = true;
          }
        }

        let message = isStillValid
          ? `Master UID hoạt động (Gói ${durationLabel}, Hạn: ${formattedDate})`
          : 'Gói Gold của Master UID này đã hết hạn';

        if (isStillValid && isAliasLimited) {
          message = `Tài khoản có Gold (${durationLabel}) nhưng ĐÃ HẾT LƯỢT CHIA SẺ (Đã đạt giới hạn 50/50 Alias của RevenueCat)`;
        }

        return {
          masterUid,
          hasGold: isStillValid,
          expiresDate: expiresDate || undefined,
          productId: gold.product_identifier,
          isStillValid: isStillValid && !isAliasLimited,
          isYearly,
          durationLabel,
          isAliasLimited,
          canShareGold: isStillValid && !isAliasLimited,
          message,
        };
      }
      return {
        masterUid,
        hasGold: false,
        isStillValid: false,
        isAliasLimited: false,
        canShareGold: false,
        message: 'Tài khoản Master này chưa kích hoạt Locket Gold',
      };
    } catch (err: any) {
      return {
        masterUid,
        hasGold: false,
        isStillValid: false,
        isAliasLimited: false,
        canShareGold: false,
        message: `Không thể kết nối RevenueCat kiểm tra: ${err.message}`,
      };
    }
  }

  private async getValidBotToken(): Promise<string | null> {
    if (!this.botEmail || !this.botPassword) {
      return null;
    }

    const now = Date.now();
    if (this.botIdToken && this.botTokenExpiry > now + 60000) {
      return this.botIdToken;
    }

    if (this.botRefreshToken) {
      try {
        const refreshRes = await this.locketApiClient.refreshToken(
          this.botRefreshToken,
        );
        this.botIdToken = refreshRes.id_token;
        this.botRefreshToken = refreshRes.refresh_token;
        this.botTokenExpiry =
          now + parseInt(refreshRes.expires_in, 10) * 1000 - 60000;
        return this.botIdToken;
      } catch (err: any) {
        this.logger.warn(`Failed to refresh Bot token: ${err.message}`);
      }
    }

    try {
      this.logger.log('Bot authenticating with Locket/Firebase...');
      const authRes = await this.locketApiClient.signInWithPassword(
        this.botEmail,
        this.botPassword,
      );
      this.botIdToken = authRes.idToken;
      this.botRefreshToken = authRes.refreshToken;
      this.botUid = authRes.localId;
      this.botTokenExpiry =
        now + parseInt(authRes.expiresIn, 10) * 1000 - 60000;
      return this.botIdToken;
    } catch (err: any) {
      this.logger.warn(`Bot sign in skipped or failed: ${err.message}`);
      return null;
    }
  }

  /**
   * Helper to normalize link / username
   * Supports:
   * - locket.cam/username
   * - https://locket.cam/username
   * - @username
   * - username
   */
  parseUsernameInput(rawInput: string): string {
    if (!rawInput) return '';
    let clean = rawInput.trim();

    // Check if input is an invite link containing UID (28 chars)
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

  async checkGoldStatus(uid: string): Promise<{
    hasGold: boolean;
    expiresDate?: string;
    productId?: string;
    isYearly?: boolean;
    durationLabel?: string;
    isAliasLimited?: boolean;
    canShareGold?: boolean;
  }> {
    try {
      const cleanUid = uid.trim().replace(/\s+/g, '');
      const rcRes = await axios.get(
        `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(cleanUid)}`,
        {
          headers: {
            Authorization: REVENUECAT_AUTH_KEY,
            'X-Platform': 'iOS',
          },
          timeout: 4000,
        },
      );
      const ent = rcRes?.data?.subscriber?.entitlements?.Gold;
      if (ent) {
        const expiresDate = ent.expires_date;
        const isStillValid =
          !expiresDate || new Date(expiresDate).getTime() > Date.now();

        // Check if account has reached RevenueCat's 50 alias limit
        let isAliasLimited = false;
        try {
          await axios.post(
            `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(cleanUid)}/alias`,
            { new_app_user_id: cleanUid },
            {
              headers: {
                Authorization: REVENUECAT_AUTH_KEY,
                'Content-Type': 'application/json',
              },
              timeout: 3000,
            },
          );
        } catch (aliasErr: any) {
          if (aliasErr.response?.data?.code === 7255) {
            isAliasLimited = true;
          }
        }

        if (isStillValid) {
          const isYearly = this.detectIsYearly(ent.product_identifier, expiresDate);
          return {
            hasGold: true,
            expiresDate: expiresDate || undefined,
            productId: ent.product_identifier,
            isYearly,
            durationLabel: isYearly ? '1 Năm' : '1 Tháng',
            isAliasLimited,
            canShareGold: !isAliasLimited,
          };
        } else {
          return {
            hasGold: false,
            expiresDate: expiresDate || undefined,
            productId: ent.product_identifier,
            isAliasLimited,
            canShareGold: false,
          };
        }
      }
      return { hasGold: false, isAliasLimited: false, canShareGold: false };
    } catch {
      return { hasGold: false, isAliasLimited: false, canShareGold: false };
    }
  }

  async previewUserByUsername(rawUsername: string): Promise<UserPreviewResult> {
    const cleanUsername = this.parseUsernameInput(rawUsername);
    if (!cleanUsername) {
      throw new BadRequestException('Vui lòng nhập link hoặc username hợp lệ');
    }

    const botToken = await this.getValidBotToken();

    // 0. Direct 28-character Firebase UID check
    if (/^[a-zA-Z0-9]{28}$/.test(cleanUsername)) {
      this.logger.log(`Direct UID input detected: ${cleanUsername}`);
      let userData: any = null;
      if (botToken) {
        try {
          const userRes = await this.locketApiClient.fetchUserV2(
            botToken,
            cleanUsername,
          );
          userData = userRes?.result?.data;
        } catch {}
      }
      const goldInfo = await this.checkGoldStatus(cleanUsername);
      return {
        uid: cleanUsername,
        username: userData?.username || cleanUsername.slice(0, 10),
        firstName: userData?.first_name || '',
        lastName: userData?.last_name || '',
        displayName:
          `${userData?.first_name || ''} ${userData?.last_name || ''}`.trim() ||
          userData?.username ||
          `Người dùng (${cleanUsername.slice(0, 8)})`,
        profilePictureUrl: userData?.profile_picture_url || '',
        goldInfo,
      };
    }

    // 1. Primary Method: Fetch public invite page https://locket.cam/<username>
    try {
      this.logger.log(
        `Resolving user via public invite page: https://locket.cam/${cleanUsername}...`,
      );
      const pageRes = await axios
        .get(`https://locket.cam/${encodeURIComponent(cleanUsername)}`, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
          },
          timeout: 10000,
        })
        .catch(() => null);

      if (pageRes?.data && typeof pageRes.data === 'string') {
        const html = pageRes.data;
        const inviteMatch = html.match(/invites(?:%2F|\/)([a-zA-Z0-9]{28})/i);
        const userPicMatch = html.match(/users(?:%2F|\/)([a-zA-Z0-9]{28})/i);
        const uid = inviteMatch
          ? inviteMatch[1]
          : userPicMatch
            ? userPicMatch[1]
            : null;

        if (uid) {
          this.logger.log(
            `Found UID ${uid} from public page for ${cleanUsername}.`,
          );
          let userData: any = null;
          if (botToken) {
            try {
              const userRes = await this.locketApiClient.fetchUserV2(
                botToken,
                uid,
              );
              userData = userRes?.result?.data;
            } catch {}
          }
          const firstName = userData?.first_name || '';
          const lastName = userData?.last_name || '';
          let displayName = `${firstName} ${lastName}`.trim();

          if (!displayName) {
            const titleMatch = html.match(/<h2 class=["']title["']>([^<]+)<\/h2>/);
            if (titleMatch && !titleMatch[1].toLowerCase().includes('add me')) {
              displayName = titleMatch[1].trim();
            } else {
              displayName = cleanUsername;
            }
          }

          let profilePic = userData?.profile_picture_url || '';
          if (!profilePic) {
            const picMatch = html.match(
              /class=["']profile-pic-img["']\s+src=([^\s>]+)/,
            );
            if (picMatch) profilePic = picMatch[1].replace(/['"]/g, '');
          }

          const goldInfo = await this.checkGoldStatus(uid);
          return {
            uid,
            username: userData?.username || cleanUsername,
            firstName,
            lastName,
            displayName,
            profilePictureUrl: profilePic,
            goldInfo,
          };
        }
      }
    } catch (scrapeErr: any) {
      this.logger.warn(
        `Public scrape notice for ${cleanUsername}: ${scrapeErr.message}`,
      );
    }

    // 2. Fallback Method: getUserByUsername endpoint
    if (botToken) {
      try {
        const response = await this.locketApiClient.callLocketEndpoint(
          botToken,
          'getUserByUsername',
          { username: cleanUsername },
        );

        const user = response?.result?.data;
        if (user && user.uid) {
          const firstName = user.first_name || '';
          const lastName = user.last_name || '';
          const displayName = `${firstName} ${lastName}`.trim() || cleanUsername;
          const goldInfo = await this.checkGoldStatus(user.uid);

          return {
            uid: user.uid,
            username: user.username || cleanUsername,
            firstName,
            lastName,
            displayName,
            profilePictureUrl: user.profile_picture_url || '',
            goldInfo,
          };
        }
      } catch (apiErr: any) {
        this.logger.warn(`getUserByUsername endpoint failed: ${apiErr.message}`);
      }
    }

    throw new NotFoundException(
      `Không tìm thấy tài khoản Locket với link/username: ${cleanUsername}`,
    );
  }

  // ============================================================================
  // 2. RevenueCat Sandbox Restore Purchase
  // ============================================================================

  async restorePurchase(
    uid: string,
    packageType: GoldPackageType = '1y',
    customMasterUid?: string,
  ): Promise<{
    success: boolean;
    productId: string;
    expiresDate?: string;
    msg: string;
  }> {
    if (!uid) {
      throw new BadRequestException('Target UID is required');
    }

    // 1. Direct High-Speed Master Bot Aliasing (< 1s)
    const masterUid = this.getMasterUid(customMasterUid);
    if (masterUid && masterUid !== uid) {
      try {
        this.logger.log(
          `[Fast-Track] Aliasing UID ${uid} to Gold Master ${masterUid}...`,
        );
        await axios.post(
          `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(masterUid)}/alias`,
          { new_app_user_id: uid },
          {
            headers: {
              Authorization: REVENUECAT_AUTH_KEY,
              'Content-Type': 'application/json',
            },
            timeout: 8000,
          },
        );

        // Fetch subscriber status immediately
        const rcCheck = await axios.get(
          `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`,
          {
            headers: {
              Authorization: REVENUECAT_AUTH_KEY,
              'X-Platform': 'iOS',
            },
            timeout: 8000,
          },
        );

        const subscriber = rcCheck?.data?.subscriber;
        const goldEntitlement = subscriber?.entitlements?.Gold;

        if (goldEntitlement) {
          const expiresDate = goldEntitlement.expires_date;
          const isStillValid =
            !expiresDate || new Date(expiresDate).getTime() > Date.now();

          if (isStillValid) {
            const formattedDate = expiresDate
              ? new Date(expiresDate).toLocaleDateString('vi-VN')
              : 'vĩnh viễn';
            const isYearly = this.detectIsYearly(
              goldEntitlement.product_identifier,
              expiresDate,
            );
            const durationLabel = isYearly ? '1 Năm' : '1 Tháng';

            this.logger.log(
              `[Fast-Track] Successfully confirmed Gold for UID ${uid} (${goldEntitlement.product_identifier}, Gói ${durationLabel}, HSD: ${formattedDate}) in <1s`,
            );

            return {
              success: true,
              productId: goldEntitlement.product_identifier,
              expiresDate: goldEntitlement.expires_date,
              msg: `Kích hoạt gói Gold (${durationLabel}) thành công! Hạn dùng đến: ${formattedDate}`,
            };
          }
        }
      } catch (aliasErr: any) {
        const rcCode = aliasErr.response?.data?.code;
        const rcMsg = aliasErr.response?.data?.message || aliasErr.message;
        this.logger.warn(
          `Master Bot alias notice for UID ${uid}: [Code ${rcCode}] ${rcMsg}`,
        );

        if (rcCode === 7255) {
          throw new BadRequestException(
            'Tài khoản Master này đã đạt giới hạn tối đa 50 lượt chia sẻ của RevenueCat (Error 7255: Alias limit reached). Vui lòng sử dụng một tài khoản Master có Gold khác!',
          );
        }
      }
    }

    // 2. Fallback: StoreKit 2 restore payload (for sandbox environments without master bot)
    const pkg = GOLD_PACKAGES[packageType] || GOLD_PACKAGES['1y'];

    const payload = {
      price: pkg.price,
      offers: [],
      fetch_token: pkg.fetchToken,
      normal_duration: pkg.normalDuration,
      store_country: 'VNM',
      observer_mode: pkg.observerMode,
      initiation_source: 'restore',
      is_restore: true,
      app_transaction: pkg.appTransaction,
      attributes: {
        $attConsentStatus: {
          updated_at_ms: Date.now(),
          value: 'denied',
        },
      },
      app_user_id: uid,
      subscription_group_id: pkg.subscriptionGroupId,
      product_id: pkg.productId,
      currency: pkg.currency,
    };

    try {
      this.logger.log(
        `Sending fallback restore request to RevenueCat for UID: ${uid}...`,
      );
      let subscriber: any = null;
      const res = await axios
        .post(REVENUECAT_BASE_URL, payload, {
          headers: REVENUECAT_COMMON_HEADERS,
          timeout: 10000,
        })
        .catch((err) => {
          this.logger.warn(`StoreKit restore payload notice: ${err.message}`);
          return null;
        });

      if (res?.data?.subscriber) {
        subscriber = res.data.subscriber;
      } else {
        const rcCheck = await axios
          .get(
            `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`,
            {
              headers: {
                Authorization: REVENUECAT_AUTH_KEY,
                'X-Platform': 'iOS',
              },
              timeout: 10000,
            },
          )
          .catch(() => null);
        subscriber = rcCheck?.data?.subscriber;
      }

      const entitlements = subscriber?.entitlements;
      const goldEntitlement = entitlements?.Gold;

      if (goldEntitlement) {
        const expiresDate = goldEntitlement.expires_date;
        const isStillValid =
          !expiresDate || new Date(expiresDate).getTime() > Date.now();
        const formattedDate = expiresDate
          ? new Date(expiresDate).toLocaleDateString('vi-VN')
          : 'vĩnh viễn';

        if (isStillValid) {
          const isYearly = this.detectIsYearly(
            goldEntitlement.product_identifier,
            expiresDate,
          );
          const durationLabel = isYearly ? '1 Năm' : '1 Tháng';

          return {
            success: true,
            productId: goldEntitlement.product_identifier || pkg.productId,
            expiresDate: goldEntitlement.expires_date,
            msg: `Kích hoạt gói Gold (${durationLabel}) thành công! Hạn dùng đến: ${formattedDate}`,
          };
        }
      }

      if (subscriber) {
        return {
          success: true,
          productId: pkg.productId,
          msg: `Kích hoạt Locket Gold thành công!`,
        };
      }

      throw new InternalServerErrorException(
        'RevenueCat không cấp quyền Gold cho tài khoản này.',
      );
    } catch (error: any) {
      const errDetail =
        error.response?.data?.message ||
        error.response?.data ||
        error.message;
      this.logger.error(
        `RevenueCat Restore Failed for UID ${uid}: ${JSON.stringify(errDetail)}`,
      );
      throw new InternalServerErrorException(
        `Kích hoạt Locket Gold thất bại: ${error.response?.data?.message || error.message}`,
      );
    }
  }

  // ============================================================================
  // 3. In-Memory Sequential Queue Manager
  // ============================================================================

  addToQueue(
    username: string,
    packageType: GoldPackageType = '1y',
    targetUid?: string,
    masterUid?: string,
  ): QueueStatusResponse {
    const cleanUsername = this.parseUsernameInput(username);
    const ticketId = randomUUID();

    const item: QueueItem = {
      ticketId,
      username: cleanUsername,
      targetUid,
      masterUid: this.getMasterUid(masterUid),
      packageType,
      status: 'waiting',
      addedAt: Date.now(),
    };

    this.items.set(ticketId, item);
    this.queue.push(ticketId);

    this.logger.log(
      `Added [${cleanUsername}] to queue (Ticket: ${ticketId}). Total in queue: ${this.queue.length}`,
    );

    return this.getQueueStatus(ticketId);
  }

  getQueueStatus(ticketId: string): QueueStatusResponse {
    const item = this.items.get(ticketId);
    if (!item) {
      throw new NotFoundException('Không tìm thấy vé hàng đợi.');
    }

    const position = this.calculatePosition(ticketId);
    let totalQueue = this.queue.length;
    if (
      this.currentProcessingTicketId &&
      this.currentProcessingTicketId !== ticketId
    ) {
      totalQueue += 1;
    }

    const estimatedSeconds = this.calculateEstimatedSeconds(position);

    return {
      ticketId,
      status: item.status,
      position,
      totalQueue,
      estimatedSeconds,
      result: item.result,
      error: item.error,
    };
  }

  private calculatePosition(ticketId: string): number {
    if (this.currentProcessingTicketId === ticketId) {
      return 0; // Đang xử lý
    }
    const idx = this.queue.indexOf(ticketId);
    return idx === -1 ? 0 : idx + 1;
  }

  private calculateEstimatedSeconds(position: number): number {
    if (position === 0) return 0;
    const avg =
      this.processingDurations.reduce((a, b) => a + b, 0) /
      this.processingDurations.length;
    return Math.max(1, Math.round((position * avg) / 1000));
  }

  private startWorker() {
    if (this.isWorkerActive) return;
    this.isWorkerActive = true;

    const processNext = async () => {
      if (this.shouldStopWorker) return;

      if (this.queue.length > 0) {
        const ticketId = this.queue.shift();
        if (ticketId && this.items.has(ticketId)) {
          const item = this.items.get(ticketId)!;
          this.currentProcessingTicketId = ticketId;
          item.status = 'processing';
          item.startedAt = Date.now();

          try {
            this.logger.log(
              `Processing ticket ${ticketId} for user @${item.username}...`,
            );

            // Step 1: Lookup UID if not already provided
            let uid = item.targetUid;
            if (!uid) {
              const preview = await this.previewUserByUsername(item.username);
              uid = preview.uid;
              item.targetUid = uid;
            }

            // Step 2: Call RevenueCat Restore
            const result = await this.restorePurchase(
              uid,
              item.packageType,
              item.masterUid,
            );
            item.status = 'completed';
            item.result = result;
          } catch (err: any) {
            this.logger.error(
              `Failed processing ticket ${ticketId}: ${err.message}`,
            );
            item.status = 'error';
            item.error = err.message || 'Xử lý thất bại';
          } finally {
            item.completedAt = Date.now();
            const duration = (item.completedAt - (item.startedAt || item.completedAt));
            this.processingDurations.push(duration);
            if (this.processingDurations.length > 15) {
              this.processingDurations.shift();
            }
            this.currentProcessingTicketId = null;

            // Wait 3.5s before taking next request to avoid RevenueCat rate limiting
            this.workerTimeout = setTimeout(processNext, 3500);
            return;
          }
        }
      }

      // Check again after 1s if queue is empty
      this.workerTimeout = setTimeout(processNext, 1000);
    };

    this.workerTimeout = setTimeout(processNext, 1000);
  }
}
