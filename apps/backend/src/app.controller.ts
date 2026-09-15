import { Controller, Get, HttpCode, HttpStatus, Req } from '@nestjs/common';
import { Request } from 'express';

@Controller()
export class AppController {
  @Get()
  @HttpCode(HttpStatus.OK)
  getRoot(@Req() req: Request) {
    return {
      status: 'ok',
      message: 'Locket Backend API is running on Vercel',
      url: req.url,
      originalUrl: (req as any).originalUrl,
      matchedPath: req.headers['x-matched-path'] || null,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health')
  @HttpCode(HttpStatus.OK)
  getHealth(@Req() req: Request) {
    return {
      status: 'healthy',
      uptime: process.uptime(),
      url: req.url,
      timestamp: new Date().toISOString(),
    };
  }
}
