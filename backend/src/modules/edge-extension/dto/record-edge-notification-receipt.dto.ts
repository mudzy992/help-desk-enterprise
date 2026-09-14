import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import {
  edgeExtensionReceiptKinds,
  type EdgeExtensionReceiptKind,
} from '../edge-extension.constants';

export class RecordEdgeNotificationReceiptDto {
  @IsString()
  @MinLength(1)
  notificationId!: string;

  @IsIn(edgeExtensionReceiptKinds)
  kind!: EdgeExtensionReceiptKind;

  @IsOptional()
  @IsString()
  @MinLength(1)
  eventId?: string;
}
