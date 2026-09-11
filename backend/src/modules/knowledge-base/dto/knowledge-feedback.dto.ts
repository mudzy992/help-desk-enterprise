import { IsBoolean } from 'class-validator';

export class KnowledgeFeedbackDto {
  @IsBoolean()
  isHelpful!: boolean;
}
