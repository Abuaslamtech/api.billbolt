import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { JwtPayload } from 'src/auth/strategies/jwt.strategy';
import { PrismaService } from 'prisma/prisma.service';
import { CreateProductDto, CreateRestockDto, UpdateProductDto } from './dto/inventory.dto';
import { InventoryService } from './inventory.service';

@UseGuards(JwtAuthGuard)
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly prisma: PrismaService,
  ) {}

  private async resolveBusinessId(user: JwtPayload): Promise<string> {
    if (user.businessId) return user.businessId;
    const b = await this.prisma.business.findUnique({ where: { ownerId: user.sub } });
    return b?.id ?? '';
  }

  // ─── Products ────────────────────────────────────────────────────────────────

  /** All products with computed stock levels for the authenticated business */
  @Get('products')
  async getProductsWithStock(@GetUser() user: JwtPayload) {
    const businessId = await this.resolveBusinessId(user);
    return this.inventoryService.getProductsWithStock(businessId);
  }

  /** Create a new product */
  @Post('products')
  async createProduct(@GetUser() user: JwtPayload, @Body() dto: CreateProductDto) {
    const businessId = await this.resolveBusinessId(user);
    return this.inventoryService.createProduct(businessId, dto);
  }

  /** Update product details (pricing, reorder level, etc.) */
  @Patch('products/:id')
  async updateProduct(
    @GetUser() user: JwtPayload,
    @Param('id') productId: string,
    @Body() dto: UpdateProductDto,
  ) {
    const businessId = await this.resolveBusinessId(user);
    return this.inventoryService.updateProduct(productId, businessId, dto);
  }

  // ─── Restocks ────────────────────────────────────────────────────────────────

  /** All restock records for the authenticated business */
  @Get('restocks')
  async getRestocks(@GetUser() user: JwtPayload) {
    const businessId = await this.resolveBusinessId(user);
    return this.inventoryService.getRestocks(businessId);
  }

  /** Log a new restock for a product */
  @Post('restocks')
  async createRestock(@GetUser() user: JwtPayload, @Body() dto: CreateRestockDto) {
    const businessId = await this.resolveBusinessId(user);
    return this.inventoryService.createRestock(businessId, dto);
  }
}
