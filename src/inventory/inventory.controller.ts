import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { JwtPayload } from 'src/auth/strategies/jwt.strategy';
import { CreateProductDto, CreateRestockDto, UpdateProductDto } from './dto/inventory.dto';
import { InventoryService } from './inventory.service';

@UseGuards(JwtAuthGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // ─── Products ────────────────────────────────────────────────────────────────

  /** All products with computed stock levels for the authenticated business */
  @Get('products')
  getProductsWithStock(@GetUser() user: JwtPayload) {
    return this.inventoryService.getProductsWithStock(user.businessId);
  }

  /** Create a new product */
  @Post('products')
  createProduct(@GetUser() user: JwtPayload, @Body() dto: CreateProductDto) {
    return this.inventoryService.createProduct(user.businessId, dto);
  }

  /** Update product details (pricing, reorder level, etc.) */
  @Patch('products/:id')
  updateProduct(
    @GetUser() user: JwtPayload,
    @Param('id') productId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.inventoryService.updateProduct(productId, user.businessId, dto);
  }

  // ─── Restocks ────────────────────────────────────────────────────────────────

  /** All restock records for the authenticated business */
  @Get('restocks')
  getRestocks(@GetUser() user: JwtPayload) {
    return this.inventoryService.getRestocks(user.businessId);
  }

  /** Log a new restock for a product */
  @Post('restocks')
  createRestock(@GetUser() user: JwtPayload, @Body() dto: CreateRestockDto) {
    return this.inventoryService.createRestock(user.businessId, dto);
  }
}
