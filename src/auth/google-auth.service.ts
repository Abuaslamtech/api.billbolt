import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

export interface GoogleUser {
  googleId: string;
  email: string;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
}

@Injectable()
export class GoogleAuthService {
  private googleClient: OAuth2Client;

  constructor(private configService: ConfigService) {
    const clientId = this.configService.get<string>('GOOGLE_OAUTH_CLIENT_ID');
    this.googleClient = new OAuth2Client(clientId);
  }

  async verifyIdToken(idToken: string): Promise<GoogleUser> {
    try {
      const webClientId = this.configService.get<string>('GOOGLE_OAUTH_CLIENT_ID');
      const androidClientId = this.configService.get<string>('GOOGLE_ANDROID_CLIENT_ID');
      const iosClientId = this.configService.get<string>('GOOGLE_IOS_CLIENT_ID');

      const audiences = [webClientId, androidClientId, iosClientId].filter(
        (id): id is string => !!id,
      );

      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: audiences,
      });

      const payload = ticket.getPayload();
      if (!payload) throw new UnauthorizedException('Invalid Google token payload');
      if (!payload.email) throw new UnauthorizedException('Email not found in Google token');
      if (!payload.email_verified) throw new UnauthorizedException('Google email not verified');

      return {
        googleId: payload.sub!,
        email: payload.email,
        emailVerified: payload.email_verified,
        firstName: payload.given_name || '',
        lastName: payload.family_name || '',
        avatarUrl: payload.picture,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      const msg = error instanceof Error ? error.message.toLowerCase() : '';
      if (msg.includes('expired') || msg.includes('token used too late')) {
        throw new UnauthorizedException({ code: 'google_token_expired', message: 'Google session expired. Sign in again.' });
      }
      throw new UnauthorizedException({ code: 'google_token_invalid', message: 'Invalid Google token' });
    }
  }
}
