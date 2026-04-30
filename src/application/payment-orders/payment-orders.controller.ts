import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  Res,
  StreamableFile,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../core/guards/supabase-auth.guard';
import { PaymentOrdersService } from './payment-orders.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { PsavService } from '../psav/psav.service';
import { PdfService } from '../../core/pdf/pdf.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import { ExportService } from '../../core/export/export.service';
import { ProfilesService } from '../profiles/profiles.service';
import { CreateInterbankOrderDto } from './dto/create-interbank-order.dto';
import { CreateWalletRampOrderDto } from './dto/create-wallet-ramp-order.dto';
import { ConfirmDepositDto } from './dto/confirm-deposit.dto';
import {
  ApproveOrderDto,
  MarkSentDto,
  CompleteOrderDto,
  FailOrderDto,
} from './dto/admin-order-action.dto';
import {
  BRIDGE_RAMP_ON_ROUTES,
  BRIDGE_RAMP_OFF_ROUTES,
  FIAT_BO_OFF_RAMP_ROUTES,
  FIAT_BO_ALLOWED_DESTINATION_CURRENCIES,
  FIAT_BO_EXCLUDED_SOURCE_CURRENCIES,
} from '../../common/constants/bridge-route-catalog.constants';
import { getValidSourceRoutes } from '../../common/constants/transfer-route-catalog.constants';

// ═══════════════════════════════════════════════
//  USER CONTROLLER — /payment-orders
// ═══════════════════════════════════════════════

@ApiTags('Payment Orders')
@ApiBearerAuth('supabase-jwt')
@Controller('payment-orders')
export class PaymentOrdersController {
  constructor(
    private readonly paymentOrdersService: PaymentOrdersService,
    private readonly exchangeRatesService: ExchangeRatesService,
    private readonly psavService: PsavService,
    private readonly pdfService: PdfService,
    private readonly suppliersService: SuppliersService,
    private readonly exportService: ExportService,
    private readonly profilesService: ProfilesService,
  ) {}

  // ── Crear órdenes ──

  @Post('interbank')
  @ApiOperation({ summary: 'Crear orden interbancaria (Bolivia ↔ Mundo)' })
  createInterbankOrder(
    @Body() dto: CreateInterbankOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentOrdersService.createInterbankOrder(user.id, dto);
  }

  @Post('wallet-ramp')
  @ApiOperation({ summary: 'Crear orden de rampa on/off (Wallet Bridge)' })
  createWalletRampOrder(
    @Body() dto: CreateWalletRampOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentOrdersService.createWalletRampOrder(user.id, dto);
  }

  // ── Consultas ──

  @Get()
  @ApiOperation({ summary: 'Listar mis órdenes de pago' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'flow_category', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getMyOrders(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('flow_category') flow_category?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.paymentOrdersService.getMyOrders(user.id, {
      status,
      flow_category,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('route-catalog')
  @ApiOperation({
    summary: 'Catálogo de rutas Bridge soportadas (on-ramp y off-ramp)',
  })
  getRouteCatalog() {
    return {
      ramp_on: BRIDGE_RAMP_ON_ROUTES,
      ramp_off: BRIDGE_RAMP_OFF_ROUTES,
      fiat_bo_off_ramp: FIAT_BO_OFF_RAMP_ROUTES,
      fiat_bo_allowed_destinations: FIAT_BO_ALLOWED_DESTINATION_CURRENCIES,
      fiat_bo_excluded_sources: FIAT_BO_EXCLUDED_SOURCE_CURRENCIES,
    };
  }

  @Get('psav-configs')
  @ApiOperation({
    summary:
      'Cuentas PSAV crypto activas para resolución de rutas de retiro (sin campos sensibles)',
  })
  async getActivePsavCryptoConfigs() {
    const accounts = await this.psavService.getActiveCryptoAccounts();
    return accounts.map(
      ({ id, name, type, currency, crypto_network, is_active }) => ({
        id,
        name,
        type,
        currency,
        crypto_network,
        is_active,
      }),
    );
  }

  @Get('exchange-rates')
  @ApiOperation({ summary: 'Obtener todos los tipos de cambio' })
  getExchangeRates() {
    return this.exchangeRatesService.getAllRates();
  }

  @Get('exchange-rates/:pair')
  @ApiOperation({
    summary: 'Obtener tipo de cambio para un par específico',
  })
  getExchangeRate(@Param('pair') pair: string) {
    return this.exchangeRatesService.getRate(pair);
  }

  @Get('export')
  @ApiOperation({ summary: 'Exportar historial de expedientes a Excel o PDF (respeta filtro de estado)' })
  @ApiQuery({ name: 'format', required: true, enum: ['excel', 'pdf'], description: 'Formato del archivo de exportación' })
  @ApiQuery({ name: 'status', required: false, description: 'Filtrar por estado (si se omite, exporta todos)' })
  async exportOrders(
    @CurrentUser() user: AuthenticatedUser,
    @Query('format') format: string,
    @Query('status') status?: string,
    @Res({ passthrough: true }) res?: any,
  ) {
    if (format !== 'excel' && format !== 'pdf') {
      throw new BadRequestException('El parámetro format debe ser "excel" o "pdf"');
    }

    // Obtener órdenes filtradas (sin paginación)
    const orders = await this.paymentOrdersService.getOrdersForExport(user.id, { status });

    // Resolver nombres de proveedores
    const supplierIds = [...new Set(orders.map((o: any) => o.supplier_id).filter(Boolean))];
    const suppliers = await this.suppliersService.findByIds(supplierIds as string[], user.id);

    // Obtener perfil del cliente y teléfono
    const profile = await this.profilesService.findOne(user.id);
    const phone = await this.profilesService.getClientPhone(user.id);
    
    const client = {
      id: profile.id,
      full_name: profile.full_name ?? null,
      email: profile.email,
      phone,
    };

    const filters = { status };
    const dateStr = new Date().toISOString().slice(0, 10);
    let buffer: Buffer;
    let contentType: string;
    let filename: string;

    if (format === 'excel') {
      buffer = await this.exportService.generateExcel(orders, suppliers, client, filters);
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      filename = `expedientes-${dateStr}.xlsx`;
    } else {
      buffer = await this.exportService.generatePdfReport(orders, suppliers, client, filters);
      contentType = 'application/pdf';
      filename = `expedientes-${dateStr}.pdf`;
    }

    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });

    return new StreamableFile(buffer);
  }

  @Get('transfer-routes/:supplierId')
  @ApiOperation({
    summary:
      'Rutas de origen válidas dado el destino crypto de un proveedor (wallet_to_wallet)',
  })
  async getTransferRoutes(
    @Param('supplierId', new ParseUUIDPipe()) supplierId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const supplier = await this.suppliersService.findOne(supplierId, user.id);
    const destNetwork = (supplier as any)?.bank_details?.wallet_network as
      | string
      | undefined;
    const destCurrency = (supplier as any)?.bank_details?.wallet_currency as
      | string
      | undefined;

    if (!destNetwork || !destCurrency) {
      return {
        dest_network: null,
        dest_currency: null,
        sources: [],
        message:
          'El proveedor no tiene red/moneda crypto configurada en bank_details.',
      };
    }

    const sources = getValidSourceRoutes(destNetwork, destCurrency);
    return {
      dest_network: destNetwork.toLowerCase(),
      dest_currency: destCurrency.toLowerCase(),
      sources,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una orden' })
  getOrderById(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentOrdersService.getOrderById(user.id, id);
  }

  @Get(':id/pdf')
  @ApiOperation({ summary: 'Generar comprobante operativo en PDF de la orden' })
  async getOrderPdf(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: any,
  ) {
    const order = await this.paymentOrdersService.getOrderById(user.id, id);
    let supplier = null;
    if (order.supplier_id) {
      try {
        supplier = await this.suppliersService.findOne(
          order.supplier_id,
          user.id,
        );
      } catch (e) {
        // Ignorar si no se encuentra
      }
    }

    const buffer = await this.pdfService.generatePaymentPdf(order, supplier);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="payment-order-${id.slice(0, 8)}.pdf"`,
      'Content-Length': buffer.length,
    });

    return new StreamableFile(buffer);
  }

  // ── Acciones del usuario ──

  @Patch(':id')
  @ApiOperation({
    summary:
      'Actualizar campos editables de una orden (supporting_document_url, notes)',
  })
  updateOrder(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentOrdersService.updateOrderByUser(user.id, id, dto);
  }

  @Post(':id/confirm-deposit')
  @ApiOperation({
    summary: 'Confirmar depósito con comprobante (usuario)',
  })
  confirmDeposit(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ConfirmDepositDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentOrdersService.confirmDeposit(user.id, id, dto);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancelar una orden pendiente' })
  cancelOrder(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentOrdersService.cancelOrder(user.id, id);
  }
}

// ═══════════════════════════════════════════════
//  ADMIN CONTROLLER — /admin/payment-orders
// ═══════════════════════════════════════════════

@ApiTags('Admin - Payment Orders')
@ApiBearerAuth('supabase-jwt')
@Controller('admin/payment-orders')
export class AdminPaymentOrdersController {
  constructor(
    private readonly paymentOrdersService: PaymentOrdersService,
    private readonly exchangeRatesService: ExchangeRatesService,
    private readonly psavService: PsavService,
  ) {}

  // ── Listados ──

  @Get()
  @Roles('staff', 'admin', 'super_admin')
  @ApiOperation({ summary: 'Listar todas las órdenes (admin)' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'flow_type', required: false })
  @ApiQuery({ name: 'flow_category', required: false })
  @ApiQuery({ name: 'requires_psav', required: false, type: Boolean })
  @ApiQuery({ name: 'user_id', required: false })
  @ApiQuery({ name: 'from_date', required: false })
  @ApiQuery({ name: 'to_date', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listAllOrders(
    @Query('status') status?: string,
    @Query('flow_type') flow_type?: string,
    @Query('flow_category') flow_category?: string,
    @Query('requires_psav') requires_psav?: string,
    @Query('user_id') user_id?: string,
    @Query('from_date') from_date?: string,
    @Query('to_date') to_date?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.paymentOrdersService.listAllOrders({
      status,
      flow_type,
      flow_category,
      requires_psav:
        requires_psav !== undefined ? requires_psav === 'true' : undefined,
      user_id,
      from_date,
      to_date,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('stats')
  @Roles('staff', 'admin', 'super_admin')
  @ApiOperation({ summary: 'Estadísticas del dashboard de órdenes' })
  getStats() {
    return this.paymentOrdersService.getOrderStats();
  }

  // ── Acciones de estado ──

  @Post(':id/approve')
  @Roles('staff', 'admin', 'super_admin')
  @ApiOperation({ summary: 'Aprobar orden (deposit_received → processing)' })
  approveOrder(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ApproveOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentOrdersService.approveOrder(id, user.id, dto);
  }

  @Post(':id/mark-sent')
  @Roles('staff', 'admin', 'super_admin')
  @ApiOperation({ summary: 'Marcar como enviada (processing → sent)' })
  markSent(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: MarkSentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentOrdersService.markSent(id, user.id, dto);
  }

  @Post(':id/complete')
  @Roles('staff', 'admin', 'super_admin')
  @ApiOperation({ summary: 'Completar orden (sent → completed)' })
  completeOrder(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CompleteOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentOrdersService.completeOrder(id, user.id, dto);
  }

  @Post(':id/fail')
  @Roles('staff', 'admin', 'super_admin')
  @ApiOperation({ summary: 'Fallar una orden (cualquier estado → failed)' })
  failOrder(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: FailOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentOrdersService.failOrder(id, user.id, dto);
  }

  // ── PSAV Accounts Admin ──

  @Get('psav-accounts')
  @Roles('staff', 'admin', 'super_admin')
  @ApiOperation({ summary: 'Listar cuentas PSAV' })
  listPsavAccounts() {
    return this.psavService.listAccounts();
  }

  @Post('psav-accounts')
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Crear o actualizar cuenta PSAV (upsert)' })
  upsertPsavAccount(@Body() dto: Record<string, unknown>) {
    if (dto.id) {
      const { id, ...rest } = dto;
      return this.psavService.updateAccount(id as string, rest as any);
    }
    return this.psavService.createAccount(dto as any);
  }

  @Patch('psav-accounts/:id')
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Actualizar cuenta PSAV' })
  updatePsavAccount(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: Record<string, unknown>,
  ) {
    return this.psavService.updateAccount(id, dto as any);
  }

  // ── Exchange Rates Admin ──

  @Get('exchange-rates')
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Listar tipos de cambio (admin)' })
  getAllRates() {
    return this.exchangeRatesService.getAllRates();
  }

  @Post('exchange-rates/sync')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Sincronizar tipos de cambio manualmente desde el mercado P2P',
  })
  syncExternalRates(@CurrentUser() user: AuthenticatedUser) {
    return this.exchangeRatesService.syncExternalRates(user.id);
  }

  @Post('exchange-rates/:pair')
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Actualizar tipo de cambio' })
  updateRate(
    @Param('pair') pair: string,
    @Body() dto: { rate: number; spread_percent?: number },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.exchangeRatesService.updateRate(pair, dto, user.id);
  }
}
