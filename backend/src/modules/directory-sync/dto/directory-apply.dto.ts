import { IsString, Length } from 'class-validator';

export class DirectoryApplyDto {
  @IsString()
  @Length(1, 64)
  dryRunId!: string;
}
