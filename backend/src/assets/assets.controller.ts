import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AssetsService } from './assets.service';
import { DepreciationService } from './depreciation.service';
import {
  CreateAssetDto,
  DepreciateDto,
  DisposeAssetDto,
  TransferAssetDto,
  UpdateAssetDto,
} from './dto/asset.dto';
import { CompanyAccessGuard } from '../common/guards/company-access.guard';
import { AuthUser, CompanyId, CurrentUser } from '../common/decorators';

@ApiTags('Ativos e depreciação')
@ApiBearerAuth()
@Controller('assets')
@UseGuards(CompanyAccessGuard)
export class AssetsController {
  constructor(
    private readonly assets: AssetsService,
    private readonly depreciation: DepreciationService,
  ) {}

  @Get()
  list(
    @CompanyId() companyId: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('category') category?: string,
  ) {
    return this.assets.list(companyId, { search, status, category });
  }

  @Get('depreciation/preview')
  depreciationPreview(@CompanyId() companyId: string, @Query() query: DepreciateDto) {
    return this.depreciation.monthPreview(companyId, query);
  }

  @Post('depreciation')
  postDepreciation(
    @CompanyId() companyId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: DepreciateDto,
  ) {
    return this.depreciation.postMonth(companyId, user, dto);
  }

  @Post('depreciation/:recordId/reverse')
  reverseDepreciation(
    @CompanyId() companyId: string,
    @CurrentUser() user: AuthUser,
    @Param('recordId') recordId: string,
    @Body('reason') reason: string,
  ) {
    return this.depreciation.reverseRecord(companyId, user, recordId, reason);
  }

  @Get(':id')
  findOne(@CompanyId() companyId: string, @Param('id') id: string) {
    return this.assets.findOne(companyId, id);
  }

  @Post()
  create(@CompanyId() companyId: string, @CurrentUser() user: AuthUser, @Body() dto: CreateAssetDto) {
    return this.assets.create(companyId, user, dto);
  }

  @Patch(':id')
  update(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAssetDto,
  ) {
    return this.assets.update(companyId, id, dto);
  }

  @Post(':id/transfer')
  transfer(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Body() dto: TransferAssetDto,
  ) {
    return this.assets.transfer(companyId, id, dto);
  }

  @Post(':id/disposal')
  dispose(
    @CompanyId() companyId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: DisposeAssetDto,
  ) {
    return this.assets.dispose(companyId, user, id, dto);
  }

  @Get(':id/depreciation/history')
  depreciationHistory(@CompanyId() companyId: string, @Param('id') id: string) {
    return this.depreciation.history(companyId, id);
  }
}
