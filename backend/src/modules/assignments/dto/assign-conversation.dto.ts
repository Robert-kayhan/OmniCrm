import {
  IsOptional,
  Matches,
  MaxLength,
  registerDecorator,
  type ValidationArguments,
} from 'class-validator';
import { ID_PATTERN } from '../../../common/dto/id-param.dto';
import { Trim } from '../../../common/transforms';

/**
 * Distinguishes "leave as is" from "clear".
 *
 * @IsOptional skips validation for both `undefined` and `null`, which is
 * exactly right here — but it also means neither counts as "provided", so the
 * body-level rule below has to look for the key itself rather than a value.
 */
function RequiresATarget(): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'requiresATarget',
      target: target.constructor,
      propertyName: propertyName as string,
      options: { message: 'Provide assignedUserId, assignedTeamId, or both' },
      validator: {
        validate(_value: unknown, args: ValidationArguments): boolean {
          const dto = args.object as Record<string, unknown>;
          return 'assignedUserId' in dto || 'assignedTeamId' in dto;
        },
      },
    });
  };
}

/**
 * Either target may be null, which unassigns that dimension. Sending both null
 * returns the conversation to the unassigned queue.
 */
export class AssignConversationDto {
  @RequiresATarget()
  @IsOptional()
  @Trim()
  @MaxLength(64)
  @Matches(ID_PATTERN, { message: 'Identifier contains invalid characters' })
  assignedUserId?: string | null;

  @IsOptional()
  @Trim()
  @MaxLength(64)
  @Matches(ID_PATTERN, { message: 'Identifier contains invalid characters' })
  assignedTeamId?: string | null;
}
