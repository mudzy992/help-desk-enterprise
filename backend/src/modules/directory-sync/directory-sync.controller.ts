import { Body, Controller, Post, UsePipes, ValidationPipe } from '@nestjs/common';
import { DirectorySyncService } from './directory-sync.service';
import type { DirectoryReadResult } from './directory-sync.types';
import { DirectoryReadDto } from './dto/directory-read.dto';

@Controller('directory-sync')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class DirectorySyncController {
  constructor(private readonly directorySyncService: DirectorySyncService) {}

  @Post('read')
  read(@Body() body: DirectoryReadDto): Promise<DirectoryReadResult> {
    return this.directorySyncService.read({
      operation: body.operation,
      scope: body.scope,
    });
  }
}
