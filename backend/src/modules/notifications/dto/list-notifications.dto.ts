import { IsBoolean, IsOptional } from 'class-validator';
import { PageQueryDto } from '../../../common/dto/pagination.dto';
import { ToBoolean } from '../../../common/transforms';

export class ListNotificationsQueryDto extends PageQueryDto {
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  unreadOnly?: boolean;
}
