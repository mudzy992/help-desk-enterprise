import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { notificationListLimits } from '../notifications.constants';
import type { NotificationListQuery } from '../notifications.types';

export class ListNotificationsQueryDto implements NotificationListQuery {
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  unreadOnly?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(notificationListLimits.maximum)
  limit?: number;
}
