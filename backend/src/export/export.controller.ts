import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { ExportService, ExportFilters } from './export.service';
import { CompanyAccessGuard } from '../common/guards/company-access.guard';
import { CompanyId } from '../common/decorators';

@ApiTags('Exportação de relatórios')
@ApiBearerAuth()
@Controller('export')
@UseGuards(CompanyAccessGuard)
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get(':report')
  async export(
    @CompanyId() companyId: string,
    @Param('report') report: string,
    @Query('format') format = 'xlsx',
    @Query() query: ExportFilters,
    @Res() res: Response,
  ) {
    const valid = ['xlsx', 'pdf'];
    if (!valid.includes(format)) format = 'xlsx';

    const file = await this.exportService.export(
      companyId,
      report,
      format as 'xlsx' | 'pdf',
      query,
    );

    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.end(file.buffer);
  }
}
