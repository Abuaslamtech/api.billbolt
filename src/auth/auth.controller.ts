import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { GetUser } from './decorators/get-user.decorator';
import { EmailLoginDto, EmailSignupDto, RefreshTokenDto } from './dto/email-auth.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { JwtAuthGuard } from './guards/jwt.guard';
import { JwtPayload } from './strategies/jwt.strategy';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** Google Sign-In — verifies Firebase/Google ID token, upserts user, returns JWT pair */
  @Post('google')
  googleLogin(@Body() dto: GoogleAuthDto) {
    return this.authService.googleLogin(dto);
  }

  /** Email Sign-Up — creates Firebase user + DB user + business, returns JWT pair */
  @Post('email/signup')
  emailSignup(@Body() dto: EmailSignupDto) {
    return this.authService.emailSignup(dto);
  }

  /** Email Login — client provides Firebase ID token, we return our own JWT pair */
  @Post('email/login')
  emailLogin(@Body() dto: EmailLoginDto) {
    return this.authService.emailLogin(dto);
  }

  /** Refresh — exchanges a valid refresh token for a new access token */
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  /** Logout — revokes the refresh token (server-side session invalidation) */
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@GetUser() user: JwtPayload) {
    return this.authService.logout(user.sub);
  }

  /** Get profile of authenticated user */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@GetUser() user: JwtPayload) {
    return this.authService.getMyProfile(user.sub);
  }
}
