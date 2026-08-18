import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { CreateReceiptDto } from './dto/create-receipt.dto';

function cycleKey(date: Date): string {
  const d = date.getDate();
  const m = date.getMonth();
  const y = date.getFullYear();
  if (d >= 14) {
    const start = new Date(y, m, 14);
    const end = new Date(y, m + 1, 13);
    return `${start.toISOString().split('T')[0]}_${end.toISOString().split('T')[0]}`;
  } else {
    const start = new Date(y, m - 1, 14);
    const end = new Date(y, m, 13);
    return `${start.toISOString().split('T')[0]}_${end.toISOString().split('T')[0]}`;
  }
}

function generateReceiptNumber(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

@Injectable()
export class ReceiptService {
  constructor(private prisma: PrismaService) {}

  async createReceipt(dto: CreateReceiptDto, ownerId: string, businessId: string) {
    const products = await this.prisma.product.findMany({
      where: { businessId },
    });

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const cycle = cycleKey(now);
    const soldBy = dto.soldBy ?? 'Staff';

    const receiptItems: Array<{
      productId: string;
      productName: string;
      quantity: number;
      unitPrice: number;
      total: number;
    }> = [];

    const salesToCreate: Array<{
      businessId: string;
      productId: string;
      productName: string;
      date: string;
      cycle: string;
      qty: number;
      soldBy: string;
      unitPrice: number;
      unitCost: number;
      revenue: number;
      cost: number;
      profit: number;
      customerName: string;
    }> = [];

    let subtotal = 0;

    for (const item of dto.items) {
      const product = products.find((p) => p.id === item.productId);
      if (!product) throw new BadRequestException(`Product ${item.productId} not found`);

      const lineTotal = item.qty * product.sellingPrice;
      const lineCost = item.qty * product.costPrice;
      subtotal += lineTotal;

      receiptItems.push({
        productId: product.id,
        productName: product.name,
        quantity: item.qty,
        unitPrice: product.sellingPrice,
        total: lineTotal,
      });

      salesToCreate.push({
        businessId,
        productId: product.id,
        productName: product.name,
        date: dateStr,
        cycle,
        qty: item.qty,
        soldBy,
        unitPrice: product.sellingPrice,
        unitCost: product.costPrice,
        revenue: lineTotal,
        cost: lineCost,
        profit: lineTotal - lineCost,
        customerName: dto.customerName,
      });
    }

    // Create receipt + items + sales in a single transaction
    const receipt = await this.prisma.$transaction(async (tx) => {
      const receipt = await tx.receipt.create({
        data: {
          receiptNumber: generateReceiptNumber(),
          customerName: dto.customerName,
          customerPhone: dto.customerPhone,
          subtotal,
          total: subtotal,
          paymentMethod: (dto.paymentMethod ?? 'Cash') as any,
          soldBy,
          cycle,
          date: dateStr,
          notes: dto.notes,
          ownerId,
          businessId,
          items: {
            create: receiptItems,
          },
        },
        include: { items: true },
      });

      // Create sale records and link to receipt
      await tx.sale.createMany({
        data: salesToCreate.map((s) => ({ ...s, receiptId: receipt.id })),
      });

      return receipt;
    });

    return receipt;
  }

  async getSales(businessId: string) {
    if (!businessId) return [];
    return this.prisma.sale.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getReceipts(businessId: string, page = 1, limit = 20) {
    if (!businessId) return { receipts: [], total: 0, page, limit };
    const skip = (page - 1) * limit;
    const [receipts, total] = await Promise.all([
      this.prisma.receipt.findMany({
        where: { businessId, isDeleted: false },
        include: { items: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.receipt.count({ where: { businessId, isDeleted: false } }),
    ]);
    return { receipts, total, page, limit };
  }

  async getReceiptById(receiptId: string, businessId: string) {
    const receipt = await this.prisma.receipt.findFirst({
      where: { id: receiptId, businessId, isDeleted: false },
      include: { items: true },
    });
    if (!receipt) throw new NotFoundException('Receipt not found');
    return receipt;
  }

  async softDeleteReceipt(receiptId: string, businessId: string) {
    const receipt = await this.prisma.receipt.findFirst({
      where: { id: receiptId, businessId },
    });
    if (!receipt) throw new NotFoundException('Receipt not found');
    await this.prisma.receipt.update({
      where: { id: receiptId },
      data: { isDeleted: true },
    });
    return { message: 'Receipt deleted' };
  }
}
