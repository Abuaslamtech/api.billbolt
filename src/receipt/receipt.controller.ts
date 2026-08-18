import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { JwtPayload } from 'src/auth/strategies/jwt.strategy';
import { PrismaService } from 'prisma/prisma.service';
import { CreateReceiptDto } from './dto/create-receipt.dto';
import { ReceiptService } from './receipt.service';

@UseGuards(JwtAuthGuard)
@Controller('receipts')
export class ReceiptController {
  constructor(
    private readonly receiptService: ReceiptService,
    private readonly prisma: PrismaService,
  ) {}

  private async resolveBusinessId(user: JwtPayload): Promise<string> {
    if (user.businessId) return user.businessId;
    const b = await this.prisma.business.findUnique({ where: { ownerId: user.sub } });
    return b?.id ?? '';
  }

  @Post()
  async createReceipt(@GetUser() user: JwtPayload, @Body() dto: CreateReceiptDto) {
    const businessId = await this.resolveBusinessId(user);
    return this.receiptService.createReceipt(dto, user.sub, businessId);
  }

  @Get()
  async getReceipts(
    @GetUser() user: JwtPayload,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    const businessId = await this.resolveBusinessId(user);
    return this.receiptService.getReceipts(businessId, +page, +limit);
  }

  @Get('sales')
  async getSales(@GetUser() user: JwtPayload) {
    const businessId = await this.resolveBusinessId(user);
    return this.receiptService.getSales(businessId);
  }

  @Get(':id')
  async getReceipt(@GetUser() user: JwtPayload, @Param('id') id: string) {
    const businessId = await this.resolveBusinessId(user);
    return this.receiptService.getReceiptById(id, businessId);
  }

  @Delete(':id')
  async deleteReceipt(@GetUser() user: JwtPayload, @Param('id') id: string) {
    const businessId = await this.resolveBusinessId(user);
    return this.receiptService.softDeleteReceipt(id, businessId);
  }
}
