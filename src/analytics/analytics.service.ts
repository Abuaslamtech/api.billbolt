import { Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';

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

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardMetrics(businessId: string) {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const currentCycle = cycleKey(now);

    const [
      products,
      restocks,
      allSales,
      receipts,
    ] = await Promise.all([
      this.prisma.product.findMany({ where: { businessId } }),
      this.prisma.restock.findMany({ where: { businessId } }),
      this.prisma.sale.findMany({ where: { businessId } }),
      this.prisma.receipt.findMany({ where: { businessId, isDeleted: false } }),
    ]);

    // Today's sales
    const todaySales = allSales
      .filter((s) => s.date === todayStr)
      .reduce((sum, s) => sum + s.revenue, 0);

    // Yesterday's sales (for growth calc)
    const yesterdaySales = allSales
      .filter((s) => s.date === yesterdayStr)
      .reduce((sum, s) => sum + s.revenue, 0);

    const todaySalesGrowth =
      yesterdaySales === 0
        ? 100
        : Math.round(((todaySales - yesterdaySales) / yesterdaySales) * 100);

    // This cycle revenue
    const thisMonthRevenue = allSales
      .filter((s) => s.cycle === currentCycle)
      .reduce((sum, s) => sum + s.revenue, 0);

    // Receipts count
    const totalReceiptsCount = receipts.length;

    // Unique customers
    const customerSet = new Set(receipts.map((r) => r.customerName.toLowerCase().trim()));
    const totalCustomersCount = customerSet.size;

    // Stock alerts — compute per product
    let needReorderCount = 0;
    let outOfStockCount = 0;

    for (const p of products) {
      const totalRestocked = restocks
        .filter((r) => r.productId === p.id)
        .reduce((sum, r) => sum + r.qty, 0);
      const totalSold = allSales
        .filter((s) => s.productId === p.id)
        .reduce((sum, s) => sum + s.qty, 0);
      const currentStock = p.openingStock + totalRestocked - totalSold;

      if (currentStock <= 0) outOfStockCount++;
      else if (currentStock <= p.reorderLevel) needReorderCount++;
    }

    return {
      todaySales,
      todaySalesGrowth,
      thisMonthRevenue,
      totalReceiptsCount,
      totalCustomersCount,
      needReorderCount,
      outOfStockCount,
      currentCycle,
    };
  }

  async getTopProducts(businessId: string) {
    const sales = await this.prisma.sale.findMany({
      where: { businessId },
    });

    const productMap = new Map<string, { productId: string; productName: string; totalQty: number; totalRevenue: number; totalProfit: number }>();

    for (const s of sales) {
      const existing = productMap.get(s.productId) ?? {
        productId: s.productId,
        productName: s.productName,
        totalQty: 0,
        totalRevenue: 0,
        totalProfit: 0,
      };
      existing.totalQty += s.qty;
      existing.totalRevenue += s.revenue;
      existing.totalProfit += s.profit;
      productMap.set(s.productId, existing);
    }

    return Array.from(productMap.values())
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 10);
  }

  async getCycleSummaries(businessId: string) {
    const sales = await this.prisma.sale.findMany({ where: { businessId } });
    const restocks = await this.prisma.restock.findMany({ where: { businessId } });

    const cycleMap = new Map<string, { cycle: string; revenue: number; cost: number; profit: number; restockCost: number }>();

    for (const s of sales) {
      const existing = cycleMap.get(s.cycle) ?? { cycle: s.cycle, revenue: 0, cost: 0, profit: 0, restockCost: 0 };
      existing.revenue += s.revenue;
      existing.cost += s.cost;
      existing.profit += s.profit;
      cycleMap.set(s.cycle, existing);
    }

    for (const r of restocks) {
      const existing = cycleMap.get(r.cycle) ?? { cycle: r.cycle, revenue: 0, cost: 0, profit: 0, restockCost: 0 };
      existing.restockCost += r.totalCost;
      cycleMap.set(r.cycle, existing);
    }

    return Array.from(cycleMap.values()).sort((a, b) => a.cycle.localeCompare(b.cycle));
  }
}
