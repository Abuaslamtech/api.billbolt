import { Controller, Get, UseGuards } from '@nestjs/common';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { JwtPayload } from 'src/auth/strategies/jwt.strategy';
import { PrismaService } from 'prisma/prisma.service';
import { AnalyticsService } from './analytics.service';

@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly prisma: PrismaService,
  ) {}

  private async resolveBusinessId(user: JwtPayload): Promise<string> {
    if (user.businessId) return user.businessId;
    const b = await this.prisma.business.findUnique({ where: { ownerId: user.sub } });
    return b?.id ?? '';
  }

  @Get('dashboard')
  async getDashboard(@GetUser() user: JwtPayload) {
    const businessId = await this.resolveBusinessId(user);
    return this.analyticsService.getDashboardMetrics(businessId);
  }

  @Get('top-products')
  async getTopProducts(@GetUser() user: JwtPayload) {
    const businessId = await this.resolveBusinessId(user);
    return this.analyticsService.getTopProducts(businessId);
  }

  @Get('cycles')
  async getCycles(@GetUser() user: JwtPayload) {
    const businessId = await this.resolveBusinessId(user);
    return this.analyticsService.getCycleSummaries(businessId);
  }
}
