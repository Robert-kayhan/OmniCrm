import { Matches, MaxLength, MinLength } from 'class-validator';
import { Trim } from '../transforms';

/**
 * Prisma issues cuid v1 ids (`c` + 24 base36 chars). Validating the shape keeps
 * obviously-malformed ids out of the database layer, but tenant scoping — not
 * id opacity — is what actually protects the data.
 */
export const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export class IdParamDto {
  @Trim()
  @MinLength(1, { message: 'Identifier is required' })
  @MaxLength(64, { message: 'Identifier is too long' })
  @Matches(ID_PATTERN, { message: 'Identifier contains invalid characters' })
  id!: string;
}
