import { applyDecorators } from '@nestjs/common';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * The password policy, declared once.
 *
 * Each rule is its own decorator rather than one combined regex so a rejected
 * password comes back saying exactly which requirement it missed — a single
 * "invalid password" leaves the user guessing.
 */
export const IsStrongPassword = () =>
  applyDecorators(
    IsString(),
    MinLength(10, { message: 'Password must be at least 10 characters' }),
    MaxLength(128, { message: 'Password must be at most 128 characters' }),
    Matches(/[a-z]/, { message: 'Password must contain a lowercase letter' }),
    Matches(/[A-Z]/, { message: 'Password must contain an uppercase letter' }),
    Matches(/[0-9]/, { message: 'Password must contain a number' }),
  );
