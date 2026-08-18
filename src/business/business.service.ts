import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class BusinessService {
  constructor(private readonly prismaService: PrismaService) {}

  /** Create business for authenticated user */
  async create(data: CreateBusinessDto, userId: string) {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      include: { business: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.business) {
      throw new ConflictException('User already has a registered business');
    }

    const newBusiness = await this.prismaService.business.create({
      data: {
        name: data.name,
        type: data.type,
        address: data.address,
        phone: data.phone || user.phone,
        email: data.email || user.email,
        currency: data.currency || 'NGN',
        ownerId: user.id,
      },
    });

    // Update user phone if provided
    if (data.phone && !user.phone) {
      await this.prismaService.user.update({
        where: { id: user.id },
        data: { phone: data.phone },
      });
    }

    const updatedUser = await this.prismaService.user.findUnique({
      where: { id: user.id },
      include: { business: true },
    });

    return {
      success: true,
      message: 'Business created successfully',
      business: newBusiness,
      user: updatedUser,
    };
  }

  /** Get authenticated user's business */
  async getMyBusiness(userId: string) {
    const business = await this.prismaService.business.findUnique({
      where: { ownerId: userId },
    });

    if (!business) {
      throw new NotFoundException('No business found for this user');
    }

    return business;
  }

  /** Update authenticated user's business */
  async updateMyBusiness(userId: string, updateBusinessDto: UpdateBusinessDto) {
    const business = await this.prismaService.business.findUnique({
      where: { ownerId: userId },
    });

    if (!business) {
      throw new NotFoundException('No business found for this user');
    }

    return this.prismaService.business.update({
      where: { id: business.id },
      data: updateBusinessDto,
    });
  }

  async findAll() {
    return this.prismaService.business.findMany();
  }

  async findOne(id: string) {
    return this.prismaService.business.findUnique({
      where: { id },
    });
  }

  async remove(id: string) {
    return this.prismaService.business.delete({
      where: { id },
    });
  }
}
