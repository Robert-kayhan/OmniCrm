import { Injectable, type ArgumentMetadata, type PipeTransform } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError as ClassValidationError } from 'class-validator';
import { ValidationError } from '../errors/app.error';

export interface ValidationIssue {
  path: string;
  message: string;
  code: string;
}

const PRIMITIVES: unknown[] = [String, Boolean, Number, Array, Object];

/** `param` is Nest's name for what the API has always called `params`. */
function sourceOf(type: ArgumentMetadata['type']): string {
  return type === 'param' ? 'params' : type;
}

/**
 * Flattens class-validator's tree into the flat issue list clients already
 * parse: one entry per failed constraint, `path` rooted at the request part it
 * came from and `code` carrying the constraint name (`isEmail`, `maxLength`)
 * rather than a human sentence.
 */
function toIssues(
  errors: ClassValidationError[],
  prefix: string,
  issues: ValidationIssue[] = [],
): ValidationIssue[] {
  for (const error of errors) {
    const path = `${prefix}.${error.property}`;

    for (const [code, message] of Object.entries(error.constraints ?? {})) {
      issues.push({ path, message, code });
    }
    if (error.children?.length) {
      toIssues(error.children, path, issues);
    }
  }
  return issues;
}

/**
 * Validates and coerces every decorated @Body/@Query/@Param DTO.
 *
 * Registered globally, so a handler gets validation by typing its parameter —
 * there is no per-route wiring to forget. Failures raise the API's own
 * ValidationError (422 / `VALIDATION_ERROR`) instead of Nest's default 400, so
 * clients keep one code for "your input was wrong".
 */
@Injectable()
export class AppValidationPipe implements PipeTransform<unknown> {
  async transform(value: unknown, metadata: ArgumentMetadata): Promise<unknown> {
    const { metatype, type } = metadata;

    // No DTO class to validate against: a raw `@Param('id')` string, a
    // `@Req()`, or a handler that takes the value untyped.
    if (!metatype || PRIMITIVES.includes(metatype)) return value;

    const instance = plainToInstance(metatype, value ?? {}, {
      // Off by design: implicit conversion infers from the declared TypeScript
      // type and turns `?page=abc` into NaN, which then passes @IsNumber.
      // DTOs declare their coercion explicitly with the decorators in
      // common/transforms instead.
      enableImplicitConversion: false,
      exposeDefaultValues: true,
    });

    const errors = await validate(instance as object, {
      // Unknown keys are dropped rather than rejected, matching how the API has
      // always treated extra fields, and keeping a client that sends a newer
      // field working against an older deployment.
      whitelist: true,
      forbidNonWhitelisted: false,
      // An absent optional property must not be reported as invalid.
      skipMissingProperties: false,
      stopAtFirstError: false,
      validationError: { target: false, value: false },
    });

    if (errors.length > 0) {
      throw new ValidationError(toIssues(errors, sourceOf(type)));
    }

    return instance;
  }
}
