import {
  Body, Controller, Delete, Get, Param, Post, Query, UseGuards
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { JwtPayload } from 'src/auth/strategies/jwt.strategy';
import { CreateReceiptDto } from './dto/create-receipt.dto';
import { ReceiptService } from './receipt.service';

@UseGuards(JwtAuthGuard)
@Controller('receipts')
export class ReceiptController {
  constructor(private readonly receiptService: ReceiptService) {}

  @Post()
  createReceipt(@GetUser() user: JwtPayload, @Body() dto: CreateReceiptDto) {
    return this.receiptService.createReceipt(dto, user.sub, user.businessId);
  }

  @Get()
  getReceipts(
    @GetUser() user: JwtPayload,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.receiptService.getReceipts(user.businessId, +page, +limit);
  }

  @Get(':id')
  getReceipt(@GetUser() user: JwtPayload, @Param('id') id: string) {
    return this.receiptService.getReceiptById(id, user.businessId);
  }

  @Delete(':id')
  deleteReceipt(@GetUser() user: JwtPayload, @Param('id') id: string) {
    return this.receiptService.softDeleteReceipt(id, user.businessId);
  }
}
