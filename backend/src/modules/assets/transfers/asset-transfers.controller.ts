import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AuthenticatedHttpRequest } from '../../authentication/authenticated-request';
import { SessionAuthenticationGuard } from '../../authentication/session-authentication.guard';
import { privacyActorOf } from '../../privacy/privacy-actor';
import { assetViewerOf, type AssetViewer } from '../asset-viewer';
import { AssetError, assetErrorCodes } from '../assets.constants';
import { runAsset } from '../map-asset-error';
import { AssetMovementDto, CancelTransferDto, SaveSignatoryDto, UploadTemplateDto } from './asset-transfers.dto';
import { AssetTransfersService, type TransferListQuery } from './asset-transfers.service';
import { assetTransferLimits, assetTransferScenarios, type AssetTransferScenarioValue } from './plan-asset-transfer';
import { transferTemplateLimits } from './transfer-document';

type UploadedMulterFile = { originalname?: string; buffer?: Buffer } | undefined;

function fileResponse(file: { fileName: string; buffer: Buffer; type: string }, inline = false): StreamableFile {
  const ascii = file.fileName.replace(/[^\w.-]/g, '_');
  return new StreamableFile(file.buffer, {
    type: file.type,
    disposition: `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    length: file.buffer.length,
  });
}

function decodeFileName(name: string): string {
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return (decoded.includes('\uFFFD') ? name : decoded).slice(0, 255);
}

function isoDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return Number.isNaN(Date.parse(value)) ? undefined : value;
}

function parseListQuery(raw: Record<string, string | undefined>): TransferListQuery {
  const limit = raw.limit === undefined ? undefined : Number(raw.limit);
  return {
    search: raw.search?.slice(0, 120),
    status: ['ISSUED', 'SIGNED', 'CANCELLED'].includes(raw.status ?? '') ? (raw.status as TransferListQuery['status']) : undefined,
    scenario: (assetTransferScenarios as readonly string[]).includes(raw.scenario ?? '') ? (raw.scenario as AssetTransferScenarioValue) : undefined,
    userId: raw.userId || undefined,
    from: isoDate(raw.from),
    to: isoDate(raw.to),
    cursor: raw.cursor || undefined,
    limit: limit !== undefined && Number.isInteger(limit) ? limit : undefined,
  };
}

/**
 * Paket 3.2 C9 (§7a): equipment moves and transfer records. Registered before
 * AssetsController so "/assets/transfers" is never read as an asset id.
 * Checks live in the service (RoleGuard needs a permission on every route).
 */
@Controller('assets')
@UseGuards(SessionAuthenticationGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class AssetTransfersController {
  constructor(private readonly transfers: AssetTransfersService) {}

  private viewer(request: AuthenticatedHttpRequest): AssetViewer {
    return assetViewerOf(request, privacyActorOf(request).principal.subjectId);
  }

  @Get('transfers/configuration')
  @Header('Cache-Control', 'no-store')
  configuration() {
    return runAsset(async () => {
      const { enabled, required } = await this.transfers.configuration();
      return { enabled, required };
    });
  }

  @Post('movements/preview')
  @HttpCode(200)
  preview(@Req() request: AuthenticatedHttpRequest, @Body() body: AssetMovementDto) {
    return runAsset(() => this.transfers.preview(body, this.viewer(request)));
  }

  @Post('movements')
  @HttpCode(200)
  move(@Req() request: AuthenticatedHttpRequest, @Body() body: AssetMovementDto) {
    return runAsset(() => this.transfers.move(body, this.viewer(request)));
  }

  @Get('transfers')
  @Header('Cache-Control', 'no-store')
  list(@Req() request: AuthenticatedHttpRequest, @Query() query: Record<string, string | undefined>) {
    return runAsset(() => this.transfers.list(parseListQuery(query), this.viewer(request)));
  }

  @Get('transfers/mine')
  @Header('Cache-Control', 'no-store')
  mine(@Req() request: AuthenticatedHttpRequest) {
    return runAsset(() => this.transfers.mine(this.viewer(request)));
  }

  // ---------------------------------------------------------- catalog: signatories + templates

  @Get('transfers/signatories')
  @Header('Cache-Control', 'no-store')
  signatories(@Req() request: AuthenticatedHttpRequest) {
    return runAsset(() => this.transfers.signatories(this.viewer(request)));
  }

  @Put('transfers/signatories/:unitId')
  setSignatory(@Req() request: AuthenticatedHttpRequest, @Param('unitId') unitId: string, @Body() body: SaveSignatoryDto) {
    return runAsset(() => this.transfers.setSignatory(unitId, body, this.viewer(request)));
  }

  @Delete('transfers/signatories/:unitId')
  @HttpCode(204)
  removeSignatory(@Req() request: AuthenticatedHttpRequest, @Param('unitId') unitId: string) {
    return runAsset(() => this.transfers.removeSignatory(unitId, this.viewer(request)));
  }

  @Get('transfers/templates')
  @Header('Cache-Control', 'no-store')
  templates(@Req() request: AuthenticatedHttpRequest) {
    return runAsset(() => this.transfers.templates(this.viewer(request)));
  }

  @Post('transfers/templates')
  @UseInterceptors(FileInterceptor('file', { limits: { files: 1, fileSize: transferTemplateLimits.maxBytes + 1 } }))
  uploadTemplate(@Req() request: AuthenticatedHttpRequest, @UploadedFile() file: UploadedMulterFile, @Body() body: UploadTemplateDto) {
    return runAsset(async () => {
      if (!file?.buffer) throw new AssetError(assetErrorCodes.transferTemplateInvalid, 'missing');
      return this.transfers.uploadTemplate({ fileName: decodeFileName(file.originalname ?? 'template.docx'), buffer: file.buffer }, body.notes, this.viewer(request));
    });
  }

  @Get('transfers/templates/default')
  @Header('Cache-Control', 'no-store')
  defaultTemplate(@Req() request: AuthenticatedHttpRequest, @Query('locale') locale?: string) {
    const effective = locale === 'en' ? 'en' : locale === 'bs' ? 'bs' : null;
    return runAsset(async () => fileResponse(await this.transfers.templateFile(null, effective, this.viewer(request))));
  }

  @Get('transfers/templates/sample')
  @Header('Cache-Control', 'no-store')
  sample(@Req() request: AuthenticatedHttpRequest) {
    return runAsset(async () => fileResponse(await this.transfers.templateSample(this.viewer(request))));
  }

  @Get('transfers/templates/:version')
  @Header('Cache-Control', 'no-store')
  templateFile(@Req() request: AuthenticatedHttpRequest, @Param('version') version: string) {
    return runAsset(async () => {
      const parsed = Number(version);
      if (!Number.isInteger(parsed) || parsed < 1) throw new AssetError(assetErrorCodes.transferTemplateNotFound);
      return fileResponse(await this.transfers.templateFile(parsed, null, this.viewer(request)));
    });
  }

  // ---------------------------------------------------------- one record

  @Get('transfers/:id')
  @Header('Cache-Control', 'no-store')
  get(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string) {
    return runAsset(() => this.transfers.get(id, this.viewer(request)));
  }

  @Get('transfers/:id/document')
  @Header('Cache-Control', 'no-store')
  document(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string) {
    return runAsset(async () => fileResponse(await this.transfers.document(id, this.viewer(request))));
  }

  @Post('transfers/:id/cancel')
  @HttpCode(200)
  cancel(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Body() body: CancelTransferDto) {
    return runAsset(() => this.transfers.cancel(id, body.reason, this.viewer(request)));
  }

  @Post('transfers/:id/signed')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { files: 1, fileSize: assetTransferLimits.signedMaxBytes + 1 } }))
  uploadSigned(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @UploadedFile() file: UploadedMulterFile) {
    return runAsset(async () => {
      if (!file?.buffer) throw new AssetError(assetErrorCodes.transferFileInvalid, 'missing');
      return this.transfers.uploadSigned(id, { fileName: decodeFileName(file.originalname ?? 'signed'), buffer: file.buffer }, this.viewer(request));
    });
  }

  @Get('transfers/:id/signed')
  @Header('Cache-Control', 'no-store')
  signed(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string) {
    return runAsset(async () => fileResponse(await this.transfers.signedCopy(id, this.viewer(request))));
  }

  @Get(':id/transfers')
  @Header('Cache-Control', 'no-store')
  forAsset(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string) {
    return runAsset(() => this.transfers.forAsset(id, this.viewer(request)));
  }
}
