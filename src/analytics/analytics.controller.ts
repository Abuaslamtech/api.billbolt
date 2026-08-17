import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { JwtPayload } from 'src/auth/strategies/jwt.strategy';
import { AnalyticsService } from './analytics.service';

@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  getDashboard(@GetUser() user: JwtPayload) {
    return this.analyticsService.getDashboardMetrics(user.businessId);
  }

  @Get('top-products')
  getTopProducts(@GetUser() user: JwtPayload) {
    return this.analyticsService.getTopProducts(user.businessId);
  }

  @Get('cycles')
  getCycles(@GetUser() user: JwtPayload) {
    return this.analyticsService.getCycleSummaries(user.businessId);
  }
}
