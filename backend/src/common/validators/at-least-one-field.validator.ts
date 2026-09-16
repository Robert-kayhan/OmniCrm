import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

/**
 * Rejects a PATCH body in which the caller sent nothing to change.
 *
 * Applied to one property but validated against the whole object, because the
 * rule is about the body as a unit. Without it an empty `{}` would pass every
 * per-field @IsOptional and issue a no-op UPDATE that still writes an audit row.
 */
export function AtLeastOneField(
  fields: string[],
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'atLeastOneField',
      target: target.constructor,
      propertyName: propertyName as string,
      options: {
        message: 'At least one field must be provided',
        ...validationOptions,
      },
      validator: {
        validate(_value: unknown, args: ValidationArguments): boolean {
          const object = args.object as Record<string, unknown>;
          return fields.some((field) => object[field] !== undefined);
        },
      },
    });
  };
}
