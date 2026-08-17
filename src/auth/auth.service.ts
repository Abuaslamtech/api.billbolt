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
import { admin } from 'src/firebase/firebase-admin';
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

  /** Upsert a refresh token for the user — one active token per user (rotate on every login) */
  private async issueRefreshToken(userId: string): Promise<string> {
    const token = this.generateRefreshToken();

    // Delete any existing refresh tokens for this user (single-session)
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

  /** Build the full auth response from a User + Business record */
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

  // ─── Google OAuth ───────────────────────────────────────────────────────────

  async googleLogin(dto: GoogleAuthDto) {
    const googleUser = await this.googleAuthService.verifyIdToken(dto.idToken);

    // Upsert: create if new, just get if existing
    let user = await this.prisma.user.findUnique({
      where: { email: googleUser.email },
    });

    if (!user) {
      // New Google user — also verify via Firebase Admin to get firebaseUid
      const decoded = await admin.auth().verifyIdToken(dto.idToken);
      user = await this.prisma.user.create({
        data: {
          firebaseUid: decoded.uid,
          email: googleUser.email,
          fullName: `${googleUser.firstName} ${googleUser.lastName}`.trim(),
          avatarUrl: googleUser.avatarUrl,
        },
      });
      this.logger.log(`New user created via Google OAuth: ${user.email}`);
    }

    return this.buildAuthResponse(user.id);
  }

  // ─── Email Sign-Up ──────────────────────────────────────────────────────────

  async emailSignup(dto: EmailSignupDto) {
    // Check for existing email
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('An account with this email already exists');

    // Create Firebase user
    let firebaseUser: admin.auth.UserRecord;
    try {
      firebaseUser = await admin.auth().createUser({
        email: dto.email,
        password: dto.password,
        displayName: dto.fullName,
      });
    } catch (err: any) {
      if (err.code === 'auth/email-already-exists') {
        throw new ConflictException('An account with this email already exists');
      }
      this.logger.error('Firebase user creation failed:', err);
      throw new BadRequestException('Failed to create account. Please try again.');
    }

    // Create DB user + business in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          firebaseUid: firebaseUser.uid,
          email: dto.email,
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

  // ─── Email Login ────────────────────────────────────────────────────────────

  async emailLogin(dto: EmailLoginDto) {
    // Client signs in via Firebase Auth and sends us the short-lived Firebase ID token
    const decoded = await admin.auth().verifyIdToken(dto.idToken).catch(() => {
      throw new UnauthorizedException('Invalid credentials');
    });

    const user = await this.prisma.user.findUnique({
      where: { firebaseUid: decoded.uid },
    });

    if (!user) throw new UnauthorizedException('No account found. Please sign up.');
    if (!user.isActive) throw new UnauthorizedException('Account is inactive. Contact support.');

    return this.buildAuthResponse(user.id);
  }

  // ─── Refresh ────────────────────────────────────────────────────────────────

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

  // ─── Get My Profile ─────────────────────────────────────────────────────────

  async getMyProfile(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { business: true },
    });
  }
}
