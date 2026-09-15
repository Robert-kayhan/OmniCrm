import { z } from 'zod';

/**
 * Prisma issues cuid v1 ids (`c` + 24 base36 chars). Validating the shape keeps
 * obviously-malformed ids out of the database layer, but tenant scoping — not
 * id opacity — is what actually protects the data.
 */
export const idSchema = z
  .string()
  .trim()
  .min(1, 'Identifier is required')
  .max(64, 'Identifier is too long')
  .regex(/^[A-Za-z0-9_-]+$/, 'Identifier contains invalid characters');

export const idParamSchema = z.object({ id: idSchema });
export type IdParam = z.infer<typeof idParamSchema>;

/** Collapses whitespace and trims; use for any free-text field shown in the UI. */
export const cleanText = (max: number, min = 1) =>
  z
    .string()
    .transform((value) => value.replace(/\s+/g, ' ').trim())
    .pipe(z.string().min(min).max(max));

export const optionalCleanText = (max: number) =>
  z
    .string()
    .transform((value) => value.replace(/\s+/g, ' ').trim())
    .pipe(z.string().max(max))
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .optional();

/** Accepts `?flag=true` / `?flag=1` from query strings. */
export const queryBoolean = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) =>
    typeof value === 'boolean' ? value : value === 'true' || value === '1',
  );

/** Comma separated query parameter into a de-duplicated array. */
export const csvOf = <T extends z.ZodType<unknown, string>>(schema: T) =>
  z
    .union([z.string(), z.array(z.string())])
    .transform((value) => {
      const parts = Array.isArray(value) ? value : value.split(',');
      return Array.from(new Set(parts.map((part) => part.trim()).filter(Boolean)));
    })
    .pipe(z.array(schema));

export const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Colour must be a 6-digit hex value such as #2563eb');
