import { IsEnum, IsOptional } from 'class-validator';
import { DataClassification } from '../../../../generated/prisma/enums';

export class UploadTicketAttachmentDto {
  @IsOptional()
  @IsEnum(DataClassification)
  classification?: DataClassification;
}
