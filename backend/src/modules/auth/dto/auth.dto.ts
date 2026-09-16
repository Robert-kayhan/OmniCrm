import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CleanText, Lowercase, ToBoolean, Trim } from '../../../common/transforms';
import { IsStrongPassword } from './password';

export class RegisterDto {
  @CleanText()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  organizationName!: string;

  @CleanText()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @Lowercase()
  @IsEmail({}, { message: 'A valid email address is required' })
  @MaxLength(254)
  email!: string;

  @IsStrongPassword()
  password!: string;
}

export class LoginDto {
  @Lowercase()
  @IsEmail({}, { message: 'A valid email address is required' })
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(1, { message: 'Password is required' })
  @MaxLength(128)
  password!: string;
}

/**
 * The refresh token normally arrives in an httpOnly cookie. The body field is a
 * fallback for clients that cannot hold cookies (native apps, integration tests).
 */
export class RefreshDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1)
  refreshToken?: string;
}

export class LogoutDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1)
  refreshToken?: string;

  /** Revoke every session for this user, not just the presented one. */
  @ApiPropertyOptional()
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  allDevices: boolean = false;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword!: string;

  @IsStrongPassword()
  newPassword!: string;
}
