import { Controller, Get, UseGuards } from '@nestjs/common';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { JwtPayload } from 'src/auth/strategies/jwt.strategy';
import { PrismaService } from 'prisma/prisma.service';
import { ReceiptService } from './receipt.service';

@UseGuards(JwtAuthGuard)
@Controller('sales')
export class SalesController {
  constructor(
    private readonly receiptService: ReceiptService,
    private readonly prisma: PrismaService,
  ) {}

  private async resolveBusinessId(user: JwtPayload): Promise<string> {
    if (user.businessId) return user.businessId;
    const b = await this.prisma.business.findUnique({ where: { ownerId: user.sub } });
    return b?.id ?? '';
  }

  @Get()
  async getSales(@GetUser() user: JwtPayload) {
    const businessId = await this.resolveBusinessId(user);
    return this.receiptService.getSales(businessId);
  }
}
