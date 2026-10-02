import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { BrandingService } from './branding.service';
import { PublicBrandingController } from './public-branding.controller';

@Module({
  imports: [SettingsModule],
  controllers: [PublicBrandingController],
  providers: [BrandingService],
  exports: [BrandingService],
})
export class BrandingModule {}
