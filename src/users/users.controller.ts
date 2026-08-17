import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  Request,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { SignInDto } from './dto/sign-in.dto';
import { uploadAvatarDto } from './dto/upload-avatar.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { FirebaseAuthGuard } from 'src/firebase/firebase-auth.guard';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // sign-up
  @Post('/signup')
  @UseGuards(FirebaseAuthGuard) // User must be authenticated with Firebase first
  create(@Body() createUserDto: CreateUserDto, @Request() req) {
    const firebaseUid = req.user.uid; // Get from authenticated Firebase user
    return this.usersService.create(createUserDto, firebaseUid);
  }
  // upload avatar
  @Post('/upload')
  @UseInterceptors(FileInterceptor('avatar'))
  @UseGuards(FirebaseAuthGuard)
  uploadAvatar(@UploadedFile() avatar: Express.Multer.File, @Request() req) {
    if (!avatar) {
      throw new BadRequestException('No file uploaded');
    }

    const firebaseUid = req.user.uid; // Use Firebase UID directly
    return this.usersService.uploadAvatar(avatar, firebaseUid);
  }

  // sign-in
  @Post('/signin')
  signIn(@Body() SignInDto: SignInDto) {
    // const token = SignInDto.firebaseToken;
    // console.log(SignInDto.firebaseToken);
    // if (!token) {
    //   throw new BadRequestException('Firebase Token is required');
    // }
    return this.usersService.signIn(SignInDto);
  }
  // check existing user
  @Post('check-provider')
  checkProvider(@Body() body: { email: string }) {
    return this.usersService.checkProvider(body.email);
  }

  // find all uses
  @Get()
  findAll() {
    return this.usersService.findAll();
  }
  // Get user profile
  @Get('/profile')
  @UseGuards(FirebaseAuthGuard)
  getProfile(@Request() req) {
    const firebaseUid = req.user.uid;
    return this.usersService.getProfile(firebaseUid);
  }

  // find user by firebaseID
  @Get(':firebaseUid')
  async findByFirebaseUid(@Param('firebaseUid') firebaseUid: string) {
    return this.usersService.findByFirebaseUid(firebaseUid);
  }

  // @Get(':id')
  // findOne(@Param('id') id: string) {
  //   return this.usersService.findOne(+id);
  // }

  // @Patch(':id')
  // update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
  //   return this.usersService.update(+id, updateUserDto);
  // }

  // @Delete(':id')
  // remove(@Param('id') id: string) {
  //   return this.usersService.remove(+id);
  // }
}
