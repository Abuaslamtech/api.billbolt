import { Module } from '@nestjs/common';
import { PrismaModule } from 'prisma/prisma.module';
import { ReceiptController } from './receipt.controller';
import { ReceiptService } from './receipt.service';
import { SalesController } from './sales.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ReceiptController, SalesController],
  providers: [ReceiptService],
})
export class ReceiptModule {}
