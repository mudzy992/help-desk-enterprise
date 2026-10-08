import { IsString, MinLength } from 'class-validator';

/** Paket 5.3.3 (D7): which setting's dependents the confirmation modal lists. */
export class ReadSettingDependentsQueryDto {
  @IsString()
  @MinLength(1)
  key!: string;
}
