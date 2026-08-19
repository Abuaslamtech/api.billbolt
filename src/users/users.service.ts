import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { PrismaService } from 'prisma/prisma.service';
import { admin } from 'src/firebase/firebase-admin';
import { SignInDto } from './dto/sign-in.dto';
import { v2 as cloudinary } from 'cloudinary';
import { Express } from 'express';

// cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
@Injectable()
export class UsersService {
  constructor(private readonly prismaService: PrismaService) {}

  // create new user with business
  async create(dto: CreateUserDto, firebaseUid: string) {
    const email = dto.email.toLowerCase().trim();
    const phone = dto.phone?.trim() ? dto.phone.trim() : null;
    const { fullName, business } = dto;

    try {
      // Check if user already exists in DB
      const orConditions: any[] = [{ email }, { firebaseUid }];
      if (phone) {
        orConditions.push({ phone });
      }

      const userExists = await this.prismaService.user.findFirst({
        where: {
          OR: orConditions,
        },
      });

      if (userExists) {
        throw new ConflictException('User already exists');
      }

      // Create user and business in database
      const result = await this.prismaService.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            firebaseUid,
            email,
            fullName,
            phone,
          },
        });

        const businessEntity = await tx.business.create({
          data: {
            name: business.name,
            type: business.type,
            phone,
            ownerId: user.id,
          },
        });

        return { user, business: businessEntity };
      });

      return {
        success: true,
        message: 'User profile created successfully',
        user: result.user,
        business: result.business,
      };
    } catch (error) {
      console.error('User creation error:', error);

      if (error instanceof ConflictException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to create user profile');
    }
  }

  // check existing
  async checkProvider(email: string) {
    try {
      const userRecord = await admin.auth().getUserByEmail(email);
      const providers = userRecord.providerData.map((p) => p.providerId);

      return providers;
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        return { provider: [] }; // Safe to proceed
      }
      throw new InternalServerErrorException('Failed to check provider');
    }
  }
  // Upload image to cloudinary

  async uploadAvatar(avatar: Express.Multer.File, firebaseUid: string) {
    try {
      // Validate inputs
      if (!avatar || !firebaseUid) {
        throw new BadRequestException('Invalid file or user ID');
      }

      // Find user by firebaseUid
      const user = await this.prismaService.user.findUnique({
        where: { firebaseUid },
      });

      if (!user) {
        throw new BadRequestException('User not found');
      }

      // Upload file to cloudinary from buffer
      const result = await new Promise<any>((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            {
              folder: `avatar/${user.id}`,
              transformation: [{ width: 200, height: 200, crop: 'fill' }],
              resource_type: 'auto',
            },
            (error, result) => {
              if (error) {
                reject(error);
              } else {
                resolve(result);
              }
            },
          )
          .end(avatar.buffer);
      });

      // Update user in database
      await this.prismaService.user.update({
        where: { firebaseUid },
        data: { avatarUrl: result.secure_url },
      });

      // message returned
      return {
        avatarUrl: result.secure_url,
        message: 'Avatar uploaded successfully',
      };
    } catch (error) {
      console.error('Avatar upload error:', error);
      throw new Error('Failed to upload avatar');
    }
  }

  // Get user profile (used after authentication)
  async getProfile(firebaseUid: string) {
    try {
      const user = await this.prismaService.user.findUnique({
        where: { firebaseUid },
        include: {
          business: true,
          receipts: true,
        },
      });

      if (!user) {
        throw new BadRequestException('User profile not found');
      }

      return user;
    } catch (error) {
      console.error('Get profile error:', error);
      throw new BadRequestException('Failed to get user profile');
    }
  }

  // find all users
  async findAll() {
    return this.prismaService.user.findMany({ include: { business: true } });
  }

  // find user by firebaseUid
  async findByFirebaseUid(firebaseUid: string) {
    return this.prismaService.user.findUnique({
      where: { firebaseUid },
      include: {
        business: true,
        receipts: true,
      },
    });
  }

  // log in user
  async signIn(SignInDto) {
    const token = SignInDto.token;
    const decodedToken = await admin.auth().verifyIdToken(token);
    const firebaseUid = decodedToken.uid;
    const user = await this.prismaService.user.findUnique({
      where: { firebaseUid },
      include: {
        business: true,
        receipts: true,
      },
    });
    console.log(token);
    return user;
  }
}
