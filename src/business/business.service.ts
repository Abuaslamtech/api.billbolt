import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { PrismaService } from 'prisma/prisma.service';
import { JwtPayload } from 'src/auth/strategies/jwt.strategy';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';

@Injectable()
export class BusinessService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /** Create business for authenticated user and return fresh tokens with businessId */
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

    const updatedUser = await this.prismaService.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { business: true },
    });

    // Generate fresh JWT token containing the new businessId
    const payload: JwtPayload = {
      sub: updatedUser.id,
      email: updatedUser.email,
      businessId: newBusiness.id,
      role: updatedUser.role,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow('JWT_SECRET'),
      expiresIn: '15m',
    });

    const refreshToken = crypto.randomBytes(64).toString('hex');
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 30);

    await this.prismaService.refreshToken.deleteMany({ where: { userId } });
    await this.prismaService.refreshToken.create({
      data: {
        userId,
        token: refreshToken,
        expiresAt: expiry,
      },
    });

    return {
      success: true,
      message: 'Business created successfully',
      accessToken,
      refreshToken,
      business: newBusiness,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        fullName: updatedUser.fullName,
        phone: updatedUser.phone,
        avatarUrl: updatedUser.avatarUrl,
        role: updatedUser.role,
        credit: updatedUser.credit,
        business: updatedUser.business,
      },
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
