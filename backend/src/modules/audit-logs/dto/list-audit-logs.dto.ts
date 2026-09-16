import { IsDate, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../../common/dto/pagination.dto';
import { ID_PATTERN } from '../../../common/dto/id-param.dto';
import { ToDate, Trim } from '../../../common/transforms';

export class ListAuditLogsQueryDto extends PageQueryDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(80)
  action?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(60)
  entityType?: string;

  @IsOptional()
  @Trim()
  @Matches(ID_PATTERN, { message: 'Identifier contains invalid characters' })
  @MaxLength(64)
  entityId?: string;

  @IsOptional()
  @Trim()
  @Matches(ID_PATTERN, { message: 'Identifier contains invalid characters' })
  @MaxLength(64)
  userId?: string;

  @IsOptional()
  @ToDate()
  @IsDate({ message: 'from must be a valid date' })
  from?: Date;

  @IsOptional()
  @ToDate()
  @IsDate({ message: 'to must be a valid date' })
  to?: Date;
}
