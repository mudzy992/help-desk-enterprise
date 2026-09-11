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
      limits: {
        files: 1,
        fileSize: ticketAttachmentUploadHardLimitBytes,
      },
    }),
  )
  upload(
    @Param('ticketId') ticketId: string,
    @UploadedFile()
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
    @Body() body: UploadTicketAttachmentDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.attachmentsService.upload(
      ticketId,
      file === undefined
        ? undefined
        : {
            originalName: file.originalname,
            declaredMimeType: file.mimetype,
            size: file.size,
            buffer: file.buffer,
            requestedClassification: body.classification,
          },
      readContext(request),
    );
  }

  @Get(':ticketId/attachments/:attachmentId/content')
  async download(
    @Param('ticketId') ticketId: string,
    @Param('attachmentId') attachmentId: string,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<StreamableFile> {
    const result = await this.attachmentsService.download(
      ticketId,
      attachmentId,
      readContext(request),
    );
    const filename = result.metadata.originalName.replace(/"/g, '');
    return new StreamableFile(result.contents, {
      type: result.metadata.mimeType,
      disposition: `attachment; filename="${filename}"`,
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
