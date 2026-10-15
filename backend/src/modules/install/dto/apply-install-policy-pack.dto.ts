import { IsString, Length } from 'class-validator';

/** `POST /install/policy-pack` — the pack the operator confirmed in the step. */
export class ApplyInstallPolicyPackDto {
  @IsString()
  @Length(1, 64)
  policyPackKey!: string;
}
