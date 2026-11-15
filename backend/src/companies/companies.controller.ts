import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { CompaniesService } from './companies.service';
import { ImportOpeningService } from './import-opening.service';
import {
  AddMemberDto,
  CompleteOpeningDto,
  CreateCompanyDto,
  UpdateCompanyDto,
} from './dto/company.dto';
import { AuthUser, CurrentUser } from '../common/decorators';

@ApiTags('Empresas')
@ApiBearerAuth()
@Controller('companies')
export class CompaniesController {
  constructor(
    private readonly companies: CompaniesService,
    private readonly importOpening: ImportOpeningService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.companies.list(user);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCompanyDto) {
    return this.companies.create(user, dto);
  }

  @Post('import')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: 'Planilha .xlsx ou .csv com o patrimônio inicial' },
        payload: { type: 'string', description: 'JSON com os dados da empresa (legalName, tradeName, openingDate, ...)' },
      },
      required: ['file', 'payload'],
    },
  })
  importSpreadsheet(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('payload') payload: string,
  ) {
    return this.importOpening.import(user, file, payload);
  }

  @Get(':id/opening')
  opening(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.companies.openingState(user, id);
  }

  @Post(':id/opening')
  completeOpening(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CompleteOpeningDto,
  ) {
    return this.companies.completeOpening(user, id, dto);
  }

  @Get(':id/members')
  members(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.companies.members(user, id);
  }

  @Post(':id/members')
  addMember(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AddMemberDto) {
    return this.companies.addMember(user, id, dto);
  }

  @Delete(':id/members/:memberId')
  removeMember(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
  ) {
    return this.companies.removeMember(user, id, memberId);
  }

  @Get(':id/activity')
  activity(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.companies.resolveAccess(user, id).then(({ company }) =>
      this.companies.activity(company.id, Number(limit) || 8),
    );
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.companies.findOne(user, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateCompanyDto) {
    return this.companies.update(user, id, dto);
  }
}
