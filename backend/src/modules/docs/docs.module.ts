import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { DocsAccessService } from './docs-access.service';
import { DocsContentRepository } from './docs-content.repository';
import { DocsController } from './docs.controller';
import { DocsService } from './docs.service';

/** Faza 3 (b): dokumentacija u aplikaciji — `/docs` rute nad generisanim ogledalom. */
@Module({
  imports: [AuthenticationModule],
  controllers: [DocsController],
  providers: [DocsService, DocsAccessService, DocsContentRepository],
  exports: [DocsService],
})
export class DocsModule {}
