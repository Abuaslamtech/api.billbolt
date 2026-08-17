import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { CreateProductDto, CreateRestockDto, UpdateProductDto } from './dto/inventory.dto';

/** Billing cycle: 14th–13th of the following month */
function cycleKey(date: Date): string {
  const d = date.getDate();
  const m = date.getMonth(); // 0-indexed
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

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Products ────────────────────────────────────────────────────────────────

  async getProducts(businessId: string) {
    return this.prisma.product.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getProductsWithStock(businessId: string) {
    const [products, restocks, sales] = await Promise.all([
      this.prisma.product.findMany({ where: { businessId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.restock.findMany({ where: { businessId } }),
      this.prisma.sale.findMany({ where: { businessId } }),
    ]);

    return products.map((p) => {
      const totalRestocked = restocks
        .filter((r) => r.productId === p.id)
        .reduce((sum, r) => sum + r.qty, 0);

      const totalSold = sales
        .filter((s) => s.productId === p.id)
        .reduce((sum, s) => sum + s.qty, 0);

      const currentStock = p.openingStock + totalRestocked - totalSold;

      let status: 'In Stock' | 'Low Stock' | 'Out of Stock' = 'In Stock';
      if (currentStock <= 0) status = 'Out of Stock';
      else if (currentStock <= p.reorderLevel) status = 'Low Stock';

      return { ...p, totalRestocked, totalSold, currentStock, status };
    });
  }

  async createProduct(businessId: string, dto: CreateProductDto) {
    return this.prisma.product.create({
      data: { ...dto, businessId },
    });
  }

  async updateProduct(productId: string, businessId: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, businessId },
    });
    if (!product) throw new NotFoundException('Product not found');

    return this.prisma.product.update({
      where: { id: productId },
      data: dto,
    });
  }

  // ─── Restocks ────────────────────────────────────────────────────────────────

  async getRestocks(businessId: string) {
    return this.prisma.restock.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createRestock(businessId: string, dto: CreateRestockDto) {
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, businessId },
    });
    if (!product) throw new BadRequestException('Product not found in this business');

    const restockDate = dto.date ? new Date(dto.date) : new Date();
    const dateStr = restockDate.toISOString().split('T')[0];

    return this.prisma.restock.create({
      data: {
        businessId,
        productId: product.id,
        productName: product.name,
        date: dateStr,
        cycle: cycleKey(restockDate),
        qty: dto.qty,
        costPerUnit: dto.costPerUnit,
        totalCost: dto.qty * dto.costPerUnit,
        notes: dto.notes,
      },
    });
  }
}
