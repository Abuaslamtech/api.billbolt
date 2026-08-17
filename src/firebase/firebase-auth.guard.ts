import {
  CanActivate,
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { admin } from './firebase-admin';

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    // check if token exist
    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    // decode token
    try {
      // verify firebase token
      const decodeToken = await admin.auth().verifyIdToken(token);
      console.log('Decoded token:', decodeToken);
      // attach decoded token to request
      request['user'] = decodeToken;

      // return true to allow all request
      return true;
    } catch (error) {
        console.error('Firebase token verification error:', error);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  // private method to extract token from authorization header
  private extractToken(request: Request): string | null {
    const authHeader = request.headers.authorization;

    // check for bearer token
    if (!authHeader || !authHeader?.startsWith('Bearer')) {
      return null;
    }

    const token = authHeader.substring(7);
    return token.trim() || null;
  }
}
