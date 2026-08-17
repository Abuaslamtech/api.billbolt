import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from 'prisma/prisma.service';
import { EmailLoginDto, EmailSignupDto, RefreshTokenDto } from './dto/email-auth.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { GoogleAuthService } from './google-auth.service';
import { JwtPayload } from './strategies/jwt.strategy';

const REFRESH_TOKEN_BYTES = 64;
const REFRESH_TOKEN_EXPIRES_DAYS = 30;
const ACCESS_TOKEN_EXPIRES = '15m';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly googleAuthService: GoogleAuthService,
  ) {}

  // ─── Token Helpers ──────────────────────────────────────────────────────────

  private signAccessToken(payload: JwtPayload): string {
    return this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow('JWT_SECRET'),
      expiresIn: ACCESS_TOKEN_EXPIRES,
    });
  }

  private generateRefreshToken(): string {
    return crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
  }

  private refreshTokenExpiry(): Date {
    const d = new Date();
    d.setDate(d.getDate() + REFRESH_TOKEN_EXPIRES_DAYS);
    return d;
  }

  /** Issue a single-session rotatable refresh token for the user */
  private async issueRefreshToken(userId: string): Promise<string> {
    const token = this.generateRefreshToken();

    await this.prisma.refreshToken.deleteMany({ where: { userId } });

    await this.prisma.refreshToken.create({
      data: {
        userId,
        token,
        expiresAt: this.refreshTokenExpiry(),
      },
    });

    return token;
  }

  /** Build full auth response */
  private async buildAuthResponse(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { business: true },
    });

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      businessId: user.business?.id ?? '',
      role: user.role,
    };

    const accessToken = this.signAccessToken(payload);
    const refreshToken = await this.issueRefreshToken(userId);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        avatarUrl: user.avatarUrl,
        role: user.role,
        credit: user.credit,
        business: user.business,
      },
    };
  }

  // ─── Google OAuth (Scath Pattern — Zero Firebase Admin Required) ────────────

  async googleLogin(dto: GoogleAuthDto) {
    // 1. Verify Google ID token cryptographically using google-auth-library
    const googleUser = await this.googleAuthService.verifyIdToken(dto.idToken);

    // 2. Find or create user in PostgreSQL
    let user = await this.prisma.user.findUnique({
      where: { email: googleUser.email },
      include: { business: true },
    });

    if (!user) {
      // Create new user + default business entity in database
      const fullName = `${googleUser.firstName} ${googleUser.lastName}`.trim() || 'Business Owner';
      user = await this.prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            email: googleUser.email,
            googleId: googleUser.googleId,
            fullName,
            avatarUrl: googleUser.avatarUrl,
          },
        });

        const newBusiness = await tx.business.create({
          data: {
            name: `${fullName}'s Store`,
            ownerId: newUser.id,
          },
        });

        return { ...newUser, business: newBusiness };
      });

      this.logger.log(`New user created via Google OAuth: ${user.email}`);
    } else if (!user.googleId) {
      // Link Google ID if user previously registered with email
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          googleId: googleUser.googleId,
          avatarUrl: user.avatarUrl || googleUser.avatarUrl,
        },
        include: { business: true },
      });
    }

    return this.buildAuthResponse(user.id);
  }

  // ─── Email Sign-Up (Bcrypt Hashed in DB) ────────────────────────────────────

  async emailSignup(dto: EmailSignupDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase().trim() } });
    if (existing) throw new ConflictException('An account with this email already exists');

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email.toLowerCase().trim(),
          passwordHash,
          fullName: dto.fullName,
          phone: dto.phone,
        },
      });

      const business = await tx.business.create({
        data: {
          name: dto.businessName,
          type: dto.businessType,
          phone: dto.phone,
          ownerId: user.id,
        },
      });

      return { user, business };
    });

    this.logger.log(`New user registered via email: ${result.user.email}`);
    return this.buildAuthResponse(result.user.id);
  }

  // ─── Email Login (Direct Password Verification) ────────────────────────────

  async emailLogin(dto: EmailLoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is disabled. Contact support.');
    }

    return this.buildAuthResponse(user.id);
  }

  // ─── Refresh Token ──────────────────────────────────────────────────────────

  async refresh(dto: RefreshTokenDto) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: dto.refreshToken },
      include: { user: true },
    });

    if (!stored) throw new UnauthorizedException('Invalid refresh token');
    if (stored.expiresAt < new Date()) {
      await this.prisma.refreshToken.delete({ where: { id: stored.id } });
      throw new UnauthorizedException('Refresh token expired. Please sign in again.');
    }

    return this.buildAuthResponse(stored.userId);
  }

  // ─── Logout ─────────────────────────────────────────────────────────────────

  async logout(userId: string) {
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
    return { message: 'Logged out successfully' };
  }

  // ─── Profile ────────────────────────────────────────────────────────────────

  async getMyProfile(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { business: true },
    });
  }
}
