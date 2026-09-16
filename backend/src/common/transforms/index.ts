import { Transform, type TransformFnParams } from 'class-transformer';

/**
 * The transform vocabulary the DTOs share.
 *
 * Query strings arrive as strings and bodies arrive as whatever the client
 * sent, so coercion has to happen before class-validator sees the value.
 * Implicit conversion is deliberately left off in the pipe — it guesses from
 * the TypeScript type and silently turns `"abc"` into `NaN` — so every
 * conversion in this codebase is spelled out with one of these.
 */

/** Collapses runs of whitespace and trims. Use for any free text shown in the UI. */
export function CleanText(): PropertyDecorator {
  return Transform(({ value }: TransformFnParams) =>
    typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : value,
  );
}

/**
 * Like CleanText, but an empty result becomes `null` rather than `""`.
 *
 * Optional free-text columns are nullable; storing `""` would make "cleared by
 * the user" and "never set" two different states that render identically.
 */
export function OptionalCleanText(): PropertyDecorator {
  return Transform(({ value }: TransformFnParams) => {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'string') return value;
    const cleaned = value.replace(/\s+/g, ' ').trim();
    return cleaned.length === 0 ? null : cleaned;
  });
}

export function Trim(): PropertyDecorator {
  return Transform(({ value }: TransformFnParams) =>
    typeof value === 'string' ? value.trim() : value,
  );
}

export function Lowercase(): PropertyDecorator {
  return Transform(({ value }: TransformFnParams) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );
}

/**
 * Query-string integer. A non-numeric value is passed through unchanged so
 * @IsInt reports "must be an integer" rather than the pipe swallowing it.
 */
export function ToInt(): PropertyDecorator {
  return Transform(({ value }: TransformFnParams) => {
    if (value === null || value === undefined || value === '') return undefined;
    if (typeof value === 'number') return value;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? value : parsed;
  });
}

/** Accepts `?flag=true` / `?flag=1` from query strings. */
export function ToBoolean(): PropertyDecorator {
  return Transform(({ value }: TransformFnParams) => {
    if (typeof value === 'boolean') return value;
    if (typeof value !== 'string') return value;
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    return value;
  });
}

/**
 * Comma-separated query parameter into a de-duplicated array. Also accepts the
 * repeated form (`?tag=a&tag=b`), which Express hands over as an array.
 */
export function CsvArray(): PropertyDecorator {
  return Transform(({ value }: TransformFnParams) => {
    if (value === null || value === undefined || value === '') return undefined;
    const parts = Array.isArray(value) ? value.map(String) : String(value).split(',');
    return Array.from(new Set(parts.map((part) => part.trim()).filter(Boolean)));
  });
}

/** ISO-8601 string to Date, leaving unparseable input for @IsDate to reject. */
export function ToDate(): PropertyDecorator {
  return Transform(({ value }: TransformFnParams) => {
    if (value === null || value === undefined || value === '') return undefined;
    if (value instanceof Date) return value;
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? value : parsed;
  });
}
