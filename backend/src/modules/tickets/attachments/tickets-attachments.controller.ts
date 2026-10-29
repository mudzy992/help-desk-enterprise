import {
  attachmentContentDisposition,
  decodeMultipartFilename,
} from './sanitize-attachment-filename';
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { open, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { SessionAuthenticationGuard } from '../../authentication/session-authentication.guard';
import type { AuthenticatedHttpRequest } from '../../authentication/authenticated-request';
import { readAuthenticatedPrincipal } from '../../authentication/authenticated-request';
import { authorizationRoleKeys } from '../../authorization/authorization.constants';
import { RequireRoles } from '../../authorization/require-roles.decorator';
import { RoleGuard } from '../../authorization/role.guard';
import type { TicketMutationContext } from '../tickets.types';
import { ticketAttachmentUploadHardLimitBytes } from './attachments.constants';
import { UploadTicketAttachmentDto } from './dto/upload-ticket-attachment.dto';
import { TicketsAttachmentsService } from './tickets-attachments.service';

@Controller('tickets')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(
  authorizationRoleKeys.user,
  authorizationRoleKeys.agent,
  authorizationRoleKeys.admin,
  authorizationRoleKeys.superAdmin,
)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class TicketsAttachmentsController {
  constructor(private readonly attachmentsService: TicketsAttachmentsService) {}

  @Get(':ticketId/attachments')
  list(
    @Param('ticketId') ticketId: string,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.attachmentsService.list(ticketId, readContext(request));
  }

  @Post(':ticketId/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({ destination: tmpdir(), filename: (_request, _file, callback) => callback(null, `ticket-upload-${randomUUID()}`) }),
      limits: {
        files: 1,
        fileSize: ticketAttachmentUploadHardLimitBytes,
      },
    }),
  )
  async upload(
    @Param('ticketId') ticketId: string,
    @UploadedFile()
    file: { originalname: string; mimetype: string; size: number; path: string } | undefined,
    @Body() body: UploadTicketAttachmentDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    if (file === undefined) return this.attachmentsService.upload(ticketId, undefined, readContext(request));
    const handle = await open(file.path, 'r');
    const signature = Buffer.alloc(Math.min(file.size, 8192));
    try {
      await handle.read(signature, 0, signature.length, 0);
      return await this.attachmentsService.upload(
        ticketId,
        {
          originalName: decodeMultipartFilename(file.originalname),
          declaredMimeType: file.mimetype,
          size: file.size,
          buffer: signature,
          temporaryPath: file.path,
          requestedClassification: body.classification,
        },
        readContext(request),
      );
    } finally {
      await handle.close();
      await unlink(file.path).catch(() => undefined);
    }
  }

  @Get(':ticketId/attachments/:attachmentId/content')
  async download(
    @Param('ticketId') ticketId: string,
    @Param('attachmentId') attachmentId: string,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<StreamableFile> {
    const result = await this.attachmentsService.downloadStream(ticketId, attachmentId, readContext(request));
    return new StreamableFile(result.stream, {
      type: result.metadata.mimeType,
      disposition: attachmentContentDisposition(result.metadata.originalName),
      length: result.metadata.sizeBytes,
    });
  }

  @Delete(':ticketId/attachments/:attachmentId')
  @HttpCode(204)
  remove(
    @Param('ticketId') ticketId: string,
    @Param('attachmentId') attachmentId: string,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.attachmentsService.remove(
      ticketId,
      attachmentId,
      readContext(request),
    );
  }
}

function readContext(request: AuthenticatedHttpRequest): TicketMutationContext {
  const actorUserId = readAuthenticatedPrincipal(request)?.subjectId ?? '';
  if (actorUserId.length === 0) {
    throw new ForbiddenException({
      code: 'FORBIDDEN',
      message: 'Authorization failed',
    });
  }
  return { actorUserId };
}
