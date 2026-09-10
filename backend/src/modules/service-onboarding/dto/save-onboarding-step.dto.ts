import { IsString, MaxLength, MinLength } from 'class-validator';
import { onboardingConfigurationRefMaximumLength } from '../service-onboarding.constants';

export class SaveOnboardingFormStepDto {
  @IsString()
  @MinLength(1)
  @MaxLength(onboardingConfigurationRefMaximumLength)
  formVersionRef!: string;
}

export class SaveOnboardingRoutingStepDto {
  @IsString()
  @MinLength(1)
  @MaxLength(onboardingConfigurationRefMaximumLength)
  routingConfigurationRef!: string;
}

export class SaveOnboardingSlaStepDto {
  @IsString()
  @MinLength(1)
  @MaxLength(onboardingConfigurationRefMaximumLength)
  slaConfigurationRef!: string;
}

export class SaveOnboardingApprovalsStepDto {
  @IsString()
  @MinLength(1)
  @MaxLength(onboardingConfigurationRefMaximumLength)
  approvalsConfigurationRef!: string;
}
