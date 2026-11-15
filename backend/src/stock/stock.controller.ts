import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { StockService } from './stock.service';
import {
  CreateProductDto,
  CreateStockMovementDto,
  ListMovementsDto,
  ListProductsDto,
  ReverseStockDto,
  UpdateProductDto,
} from './dto/stock.dto';
import { CompanyAccessGuard } from '../common/guards/company-access.guard';
import { AuthUser, CompanyId, CurrentUser } from '../common/decorators';

@ApiTags('Estoque')
@ApiBearerAuth()
@Controller('stock')
@UseGuards(CompanyAccessGuard)
export class StockController {
  constructor(
    private readonly products: ProductsService,
    private readonly stock: StockService,
  ) {}

  // ── Produtos ─────────────────────────────────────────────
  @Get('products/options')
  productOptions(@CompanyId() companyId: string) {
    return this.products.options(companyId);
  }

  @Get('products')
  listProducts(@CompanyId() companyId: string, @Query() query: ListProductsDto) {
    return this.products.list(companyId, query);
  }

  @Get('products/:id')
  findProduct(@CompanyId() companyId: string, @Param('id') id: string) {
    return this.products.findOne(companyId, id);
  }

  @Post('products')
  createProduct(@CompanyId() companyId: string, @Body() dto: CreateProductDto) {
    return this.products.create(companyId, dto);
  }

  @Patch('products/:id')
  updateProduct(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(companyId, id, dto);
  }

  @Delete('products/:id')
  removeProduct(@CompanyId() companyId: string, @Param('id') id: string) {
    return this.products.remove(companyId, id);
  }

  @Get('summary')
  summary(@CompanyId() companyId: string) {
    return this.products.summary(companyId);
  }

  // ── Movimentações ────────────────────────────────────────
  @Get('movements')
  listMovements(@CompanyId() companyId: string, @Query() query: ListMovementsDto) {
    return this.stock.list(companyId, query);
  }

  @Get('movements/:id')
  findMovement(@CompanyId() companyId: string, @Param('id') id: string) {
    return this.stock.findOne(companyId, id);
  }

  @Post('movements')
  createMovement(
    @CompanyId() companyId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateStockMovementDto,
  ) {
    return this.stock.createMovement(companyId, user, dto);
  }

  @Post('movements/:id/reverse')
  reverse(
    @CompanyId() companyId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReverseStockDto,
  ) {
    return this.stock.reverse(companyId, user, id, dto);
  }
}
