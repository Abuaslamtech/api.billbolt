import { IsString, IsNotEmpty, IsEmail, MinLength, IsOptional } from 'class-validator';

export class EmailSignupDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsString()
  @IsNotEmpty()
  businessName: string;

  @IsOptional()
  @IsString()
  businessType?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

export class EmailLoginDto {
  /** Firebase ID token obtained from signInWithEmailAndPassword on the client */
  @IsString()
  @IsNotEmpty()
  idToken: string;
}

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
