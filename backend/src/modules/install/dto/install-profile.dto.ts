import { IsIn } from 'class-validator';
import { installProfiles, type InstallProfile } from '../steps/install-step.types';

export class SaveInstallProfileDto {
  @IsIn(installProfiles)
  profile!: InstallProfile;
}
