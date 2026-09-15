import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SkipCsrf } from '../common/decorators/skip-csrf.decorator';
import { CurrentSession } from '../common/decorators/current-session.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import { SessionData } from '../session/session.service';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { GoldPackageType } from './gold.constants';
import { GoldService } from './gold.service';

export class PreviewUserDto {
  @IsString({ message: 'Username phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Username không được để trống' })
  username!: string;
}

export class PublicSubmitDto {
  @IsString({ message: 'Username phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Username không được để trống' })
  username!: string;

  @IsOptional()
  @IsIn(['1m', '1y'], { message: 'Gói chỉ chấp nhận 1m hoặc 1y' })
  packageType?: GoldPackageType;

  @IsOptional()
  @IsString({ message: 'masterUid phải là chuỗi ký tự' })
  masterUid?: string;
}

export class UpgradeSelfDto {
  @IsOptional()
  @IsIn(['1m', '1y'], { message: 'Gói chỉ chấp nhận 1m hoặc 1y' })
  packageType?: GoldPackageType;
}

export class UpgradeFriendDto {
  @IsOptional()
  @IsString()
  targetUid?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  masterUid?: string;

  @IsOptional()
  @IsIn(['1m', '1y'], { message: 'Gói chỉ chấp nhận 1m hoặc 1y' })
  packageType?: GoldPackageType;
}

@Controller('gold')
@SkipCsrf()
export class GoldController {
  constructor(private readonly goldService: GoldService) {}

  // ============================================================================
  // Public Endpoints (Khách vãng lai, không cần đăng nhập session)
  // ============================================================================

  @Post('public/preview-user')
  @HttpCode(HttpStatus.OK)
  @SkipCsrf()
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // Tối đa 10 lần tra cứu / phút / IP
  async publicPreviewUser(@Body() body: PreviewUserDto) {
    if (!body?.username) {
      throw new BadRequestException('Vui lòng nhập Username');
    }
    return this.goldService.previewUserByUsername(body.username);
  }

  @Post('public/submit')
  @HttpCode(HttpStatus.OK)
  @SkipCsrf()
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // Tối đa 5 lượt submit / phút / IP chống spam
  async publicSubmit(@Body() body: PublicSubmitDto) {
    if (!body?.username) {
      throw new BadRequestException('Vui lòng nhập Username');
    }
    const packageType = body.packageType === '1m' ? '1m' : '1y';
    return this.goldService.addToQueue(
      body.username,
      packageType,
      undefined,
      body.masterUid,
    );
  }

  @Get('public/master-status')
  @SkipCsrf()
  async publicGetMasterStatus(@Query('masterUid') customMasterUid?: string) {
    return this.goldService.checkMasterStatus(customMasterUid);
  }

  @Get('public/status/:ticketId')
  @SkipCsrf()
  async publicGetStatus(@Param('ticketId') ticketId: string) {
    if (!ticketId) {
      throw new BadRequestException('Vui lòng cung cấp ticketId');
    }
    return this.goldService.getQueueStatus(ticketId);
  }

  // ============================================================================
  // Authenticated Endpoints (Dành cho người dùng đã đăng nhập trên Web)
  // ============================================================================

  @Post('upgrade-self')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async upgradeSelf(
    @CurrentSession() session: SessionData,
    @Body() body: UpgradeSelfDto,
  ) {
    const packageType = body?.packageType === '1m' ? '1m' : '1y';
    return this.goldService.restorePurchase(session.userId, packageType);
  }

  @Post('upgrade-friend')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async upgradeFriend(
    @CurrentSession() session: SessionData,
    @Body() body: UpgradeFriendDto,
  ) {
    const packageType = body?.packageType === '1m' ? '1m' : '1y';

    let targetUid = body?.targetUid;
    if (!targetUid && body?.username) {
      const preview = await this.goldService.previewUserByUsername(body.username);
      targetUid = preview.uid;
    }

    if (!targetUid) {
      throw new BadRequestException(
        'Cần cung cấp targetUid hoặc username của bạn bè.',
      );
    }

    return this.goldService.restorePurchase(
      targetUid,
      packageType,
      body?.masterUid,
    );
  }
}
