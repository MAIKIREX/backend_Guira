import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { BridgeService } from './bridge.service';
import { CreatePayoutRequestDto } from './dto/create-payout.dto';
import {
  CreateVirtualAccountDto,
  CreateExternalAccountDto,
  CreateLiquidationAddressDto,
} from './dto/create-virtual-account.dto';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../core/guards/supabase-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { Roles } from '../../core/decorators/roles.decorator';

// ─────────────────────────────────────────────────
//  Rutas de usuario: /bridge/...
// ─────────────────────────────────────────────────

@ApiTags('Bridge')
@ApiBearerAuth('supabase-jwt')
@Controller('bridge')
export class BridgeController {
  constructor(private readonly bridgeService: BridgeService) {}

  // ── Virtual Accounts ──────────────────

  @Post('virtual-accounts')
  @ApiOperation({
    summary: 'Crear Virtual Account para recepción de depósitos',
  })
  @ApiResponse({
    status: 201,
    description: 'VA creada con instrucciones bancarias',
  })
  createVirtualAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateVirtualAccountDto,
  ) {
    return this.bridgeService.createVirtualAccount(user.id, dto);
  }

  @Get('virtual-accounts')
  @ApiOperation({ summary: 'Listar Virtual Accounts activas' })
  listVirtualAccounts(@CurrentUser() user: AuthenticatedUser) {
    return this.bridgeService.listVirtualAccounts(user.id);
  }

  @Get('virtual-accounts/:id')
  @ApiOperation({
    summary: 'Detalle de Virtual Account con instrucciones bancarias',
  })
  getVirtualAccount(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bridgeService.getVirtualAccount(id, user.id);
  }

  @Delete('virtual-accounts/:id')
  @ApiOperation({ summary: 'Desactivar Virtual Account' })
  deactivateVirtualAccount(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bridgeService.deactivateVirtualAccount(id, user.id);
  }

  // ── External Accounts ─────────────────

  @Post('external-accounts')
  @ApiOperation({ summary: 'Registrar cuenta bancaria destino' })
  @ApiResponse({ status: 201, description: 'Cuenta registrada en Bridge' })
  createExternalAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateExternalAccountDto,
  ) {
    return this.bridgeService.createExternalAccount(user.id, dto);
  }

  @Get('external-accounts')
  @ApiOperation({ summary: 'Listar cuentas bancarias registradas' })
  listExternalAccounts(@CurrentUser() user: AuthenticatedUser) {
    return this.bridgeService.listExternalAccounts(user.id);
  }

  @Delete('external-accounts/:id')
  @ApiOperation({ summary: 'Desactivar cuenta bancaria' })
  deactivateExternalAccount(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bridgeService.deactivateExternalAccount(id, user.id);
  }

  // ── Payouts ───────────────────────────

  @Post('payouts')
  @ApiOperation({
    summary: 'Crear solicitud de pago (con fee + reserva de saldo)',
  })
  @ApiResponse({ status: 201, description: 'Payout creado' })
  @ApiResponse({
    status: 400,
    description: 'Saldo insuficiente o límites excedidos',
  })
  createPayout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePayoutRequestDto,
  ) {
    return this.bridgeService.createPayout(user.id, dto);
  }

  @Get('payouts')
  @ApiOperation({ summary: 'Listar solicitudes de pago del usuario' })
  listPayouts(@CurrentUser() user: AuthenticatedUser) {
    return this.bridgeService.listPayoutRequests(user.id);
  }

  @Get('payouts/:id')
  @ApiOperation({ summary: 'Detalle de una solicitud de pago' })
  getPayoutDetail(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bridgeService.getPayoutRequest(id, user.id);
  }

  // ── Transfers ─────────────────────────

  @Get('transfers')
  @ApiOperation({ summary: 'Historial de transferencias Bridge' })
  listTransfers(@CurrentUser() user: AuthenticatedUser) {
    return this.bridgeService.listTransfers(user.id);
  }

  @Get('transfers/:id')
  @ApiOperation({ summary: 'Detalle de transferencia' })
  getTransfer(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bridgeService.getTransfer(id, user.id);
  }

  @Post('transfers/:id/sync')
  @ApiOperation({ summary: 'Sincronizar estado con Bridge API' })
  syncTransfer(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bridgeService.syncTransferFromBridge(id, user.id);
  }

  // ── Liquidation Addresses ─────────────

  @Post('liquidation-addresses')
  @ApiOperation({ summary: 'Crear dirección de liquidación crypto → fiat' })
  createLiquidationAddress(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateLiquidationAddressDto,
  ) {
    return this.bridgeService.createLiquidationAddress(user.id, dto);
  }

  @Get('liquidation-addresses')
  @ApiOperation({ summary: 'Listar direcciones de liquidación activas' })
  listLiquidationAddresses(@CurrentUser() user: AuthenticatedUser) {
    return this.bridgeService.listLiquidationAddresses(user.id);
  }
}

// ─────────────────────────────────────────────────
//  Admin: /admin/bridge/...
// ─────────────────────────────────────────────────

@ApiTags('Admin — Bridge')
@ApiBearerAuth('supabase-jwt')
@Controller('admin/bridge')
@UseGuards(RolesGuard)
export class AdminBridgeController {
  constructor(private readonly bridgeService: BridgeService) {}

  // ── Transfers (bridge_transfers) ─────────

  @Get('transfers')
  @Roles('staff', 'admin', 'super_admin')
  @ApiOperation({ summary: 'Listar todas las transferencias Bridge (admin)' })
  @ApiResponse({ status: 200, description: 'Lista de bridge_transfers' })
  listAllTransfers(@Query('status') status?: string) {
    return this.bridgeService.listAllTransfers({ status });
  }

  // ── Payouts (payout_requests) ────────────

  @Post('payouts/:id/approve')
  @Roles('staff', 'admin', 'super_admin')
  @ApiOperation({ summary: 'Aprobar payout pendiente de revisión' })
  @ApiResponse({ status: 200, description: 'Payout aprobado y ejecutado' })
  approvePayout(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.bridgeService.approvePayout(id, actor.id);
  }

  @Post('payouts/:id/reject')
  @Roles('staff', 'admin', 'super_admin')
  @ApiOperation({ summary: 'Rechazar payout (libera saldo reservado)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { reason: { type: 'string' } },
      required: ['reason'],
    },
  })
  rejectPayout(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { reason: string },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.bridgeService.rejectPayout(id, body.reason, actor.id);
  }

  // ── VA Fee Management ─────────────────

  @Get('users/:userId/va-fee')
  @Roles('staff', 'admin', 'super_admin')
  @ApiOperation({ summary: 'Get resolved developer_fee for a client (override → global)' })
  getUserVaFee(
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.bridgeService.getResolvedVaFee(userId);
  }

  @Patch('users/:userId/va-fee')
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Set/clear developer_fee override for a client' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        fee_percent: { type: 'number', nullable: true, description: 'null to clear override' },
        reason: { type: 'string' },
      },
      required: ['reason'],
    },
  })
  setUserVaFee(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() body: { fee_percent: number | null; reason: string },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.bridgeService.setUserVaFeeOverride(
      userId,
      body.fee_percent,
      body.reason,
      actor.id,
    );
  }

  @Get('users/:userId/virtual-accounts')
  @Roles('staff', 'admin', 'super_admin')
  @ApiOperation({ summary: 'List active VAs for a user (admin)' })
  listUserVirtualAccounts(
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.bridgeService.listUserVirtualAccounts(userId);
  }

  @Patch('virtual-accounts/:id/fee')
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Update developer_fee_percent of existing VA in Bridge' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        fee_percent: { type: 'number' },
        reason: { type: 'string' },
      },
      required: ['fee_percent', 'reason'],
    },
  })
  updateVaFee(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { fee_percent: number; reason: string },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.bridgeService.updateVirtualAccountFee(id, body.fee_percent, actor.id);
  }
}
