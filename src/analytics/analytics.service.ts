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
    const [sales, products] = await Promise.all([
      this.prisma.sale.findMany({ where: { businessId } }),
      this.prisma.product.findMany({ where: { businessId } }),
      this.prisma.restock.findMany({ where: { businessId } }),
    ]);

    const restocks = await this.prisma.restock.findMany({ where: { businessId } });

    // Build restock totals per product for currentStock calc
    const restockMap = new Map<string, number>();
    for (const r of restocks) {
      restockMap.set(r.productId, (restockMap.get(r.productId) ?? 0) + r.qty);
    }

    const productMap = new Map<string, {
      productId: string;
      productName: string;
      category: string | null;
      totalUnitsSold: number;
      totalRevenue: number;
      totalCost: number;
      totalProfit: number;
      currentStock: number;
      status: string;
    }>();

    for (const s of sales) {
      const existing = productMap.get(s.productId) ?? {
        productId: s.productId,
        productName: s.productName,
        category: null,
        totalUnitsSold: 0,
        totalRevenue: 0,
        totalCost: 0,
        totalProfit: 0,
        currentStock: 0,
        status: 'In Stock',
      };
      existing.totalUnitsSold += s.qty;
      existing.totalRevenue += s.revenue;
      existing.totalCost += s.cost;
      existing.totalProfit += s.profit;
      productMap.set(s.productId, existing);
    }

    // Enrich with product metadata + stock
    for (const p of products) {
      const totalRestocked = restockMap.get(p.id) ?? 0;
      const totalSold = productMap.get(p.id)?.totalUnitsSold ?? 0;
      const currentStock = p.openingStock + totalRestocked - totalSold;
      const status = currentStock <= 0 ? 'Out of Stock' : currentStock <= p.reorderLevel ? 'Low Stock' : 'In Stock';

      const entry = productMap.get(p.id);
      if (entry) {
        entry.category = p.category ?? null;
        entry.currentStock = currentStock;
        entry.status = status;
      }
    }

    return Array.from(productMap.values())
      .map((p) => ({
        ...p,
        margin: p.totalRevenue > 0 ? Math.round((p.totalProfit / p.totalRevenue) * 100) : null,
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 20);
  }

  async getCycleSummaries(businessId: string) {
    const sales = await this.prisma.sale.findMany({ where: { businessId } });
    const restocks = await this.prisma.restock.findMany({ where: { businessId } });

    const cycleMap = new Map<string, {
      cycle: string;
      revenue: number;
      cost: number;
      profit: number;
      restockCost: number;
      unitsSold: number;
    }>();

    for (const s of sales) {
      const existing = cycleMap.get(s.cycle) ?? { cycle: s.cycle, revenue: 0, cost: 0, profit: 0, restockCost: 0, unitsSold: 0 };
      existing.revenue += s.revenue;
      existing.cost += s.cost;
      existing.profit += s.profit;
      existing.unitsSold += s.qty;
      cycleMap.set(s.cycle, existing);
    }

    for (const r of restocks) {
      const existing = cycleMap.get(r.cycle) ?? { cycle: r.cycle, revenue: 0, cost: 0, profit: 0, restockCost: 0, unitsSold: 0 };
      existing.restockCost += r.totalCost;
      cycleMap.set(r.cycle, existing);
    }

    // Format cycle key ("YYYY-MM-DD_YYYY-MM-DD") into a readable label
    const fmtDate = (s: string) => {
      const d = new Date(s);
      if (isNaN(d.getTime())) return s;
      return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
    };

    return Array.from(cycleMap.values())
      .sort((a, b) => b.cycle.localeCompare(a.cycle)) // newest first
      .map((c) => {
        const parts = c.cycle.split('_');
        const label = parts.length === 2
          ? `${fmtDate(parts[0])} – ${fmtDate(parts[1])}, ${new Date(parts[1]).getFullYear()}`
          : c.cycle;
        const margin = c.revenue > 0 ? Math.round((c.profit / c.revenue) * 100) : null;
        return {
          cycle: c.cycle,
          label,
          revenue: c.revenue,
          cost: c.cost,
          profit: c.profit,
          restockSpend: c.restockCost,
          unitsSold: c.unitsSold,
          margin,
        };
      });
  }
}
