import {
  IsString, IsNotEmpty, IsOptional, IsArray,
  ValidateNested, IsNumber, IsPositive, IsEnum
} from 'class-validator';
import { Type } from 'class-transformer';

class ReceiptItemDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsNumber()
  @IsPositive()
  qty: number;
}

export type PaymentMethod = 'Cash' | 'Transfer' | 'Card' | 'Other';

export class CreateReceiptDto {
  @IsString()
  @IsNotEmpty()
  customerName: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiptItemDto)
  items: ReceiptItemDto[];

  @IsOptional()
  @IsString()
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  soldBy?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsNumber()
  discount?: number;
}
