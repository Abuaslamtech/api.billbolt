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
  constructor(private prismaService: PrismaService) {}

  // create business
  async create(data: CreateBusinessDto, firebaseUid: string) {
    // find user by firebase ID
    const user = await this.prismaService.user.findUnique({
      where: { firebaseUid },
      include: {
        business: true,
      },
    });

    // Check if user exist
    if (!user) {
      throw new NotFoundException(
        'User not found. Please ensure user is registered!',
      );
    }

    // Check if user already has a business
    if (user.business) {
      throw new ConflictException('User already has a business registered');
    }

    // Create the business
    const newBusiness = await this.prismaService.business.create({
      data: {
        ...data,
        ownerId: user.id,
      },
    });

    // Return updated user with business
    const updatedUser = await this.prismaService.user.findUnique({
      where: { firebaseUid },
      include: { business: true },
    });

    return {
      success: true,
      message: 'Business created successfully',
      business: newBusiness,
      user: updatedUser, // Include complete user data
    };
  }

  async findAll() {
    const business = await this.prismaService.business.findMany();
    return business;
  }

  findOne(id: number) {
    return `This action returns a #${id} business`;
  }

  update(id: number, updateBusinessDto: UpdateBusinessDto) {
    return `This action updates a #${id} business`;
  }

  remove(id: number) {
    return `This action removes a #${id} business`;
  }
}
