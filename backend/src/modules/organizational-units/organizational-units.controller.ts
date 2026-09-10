import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AssignUserOrganizationalUnitDto } from './dto/assign-user-organizational-unit.dto';
import { CreateOrganizationalUnitDto } from './dto/create-organizational-unit.dto';
import { UpdateOrganizationalUnitDto } from './dto/update-organizational-unit.dto';
import { OrganizationalUnitsService } from './organizational-units.service';
import type {
  OrganizationalUnitDetailResponse,
  OrganizationalUnitTreeNodeResponse,
  OrganizationalUnitUserResponse,
} from './organizational-unit.types';

@Controller('organizational-units')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class OrganizationalUnitsController {
  constructor(
    private readonly organizationalUnitsService: OrganizationalUnitsService,
  ) {}

  @Post()
  create(
    @Body() body: CreateOrganizationalUnitDto,
  ): Promise<OrganizationalUnitDetailResponse> {
    return this.organizationalUnitsService.create(body);
  }

  @Get('tree')
  getTree(): Promise<readonly OrganizationalUnitTreeNodeResponse[]> {
    return this.organizationalUnitsService.getTree();
  }

  @Put('user-mappings')
  assignUser(
    @Body() body: AssignUserOrganizationalUnitDto,
  ): Promise<OrganizationalUnitUserResponse> {
    return this.organizationalUnitsService.assignUser(body);
  }

  @Get(':organizationalUnitId/users')
  listUsers(
    @Param('organizationalUnitId') organizationalUnitId: string,
  ): Promise<readonly OrganizationalUnitUserResponse[]> {
    return this.organizationalUnitsService.listUsers(organizationalUnitId);
  }

  @Get(':organizationalUnitId')
  getById(
    @Param('organizationalUnitId') organizationalUnitId: string,
  ): Promise<OrganizationalUnitDetailResponse> {
    return this.organizationalUnitsService.getById(organizationalUnitId);
  }

  @Patch(':organizationalUnitId')
  update(
    @Param('organizationalUnitId') organizationalUnitId: string,
    @Body() body: UpdateOrganizationalUnitDto,
  ): Promise<OrganizationalUnitDetailResponse> {
    return this.organizationalUnitsService.update(organizationalUnitId, body);
  }

  @Delete(':organizationalUnitId')
  @HttpCode(204)
  async delete(
    @Param('organizationalUnitId') organizationalUnitId: string,
  ): Promise<void> {
    await this.organizationalUnitsService.delete(organizationalUnitId);
  }
}
