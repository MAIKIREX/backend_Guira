import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { User } from '@supabase/supabase-js';
import { BridgeService } from './bridge.service';
import { CreatePayoutRequestDto } from './dto/create-payout.dto';
import { CurrentUser } from '../../core/decorators/current-user.decorator';

@ApiTags('Bridge')
@ApiBearerAuth('supabase-jwt')
@Controller('bridge')
export class BridgeController {
  constructor(private readonly bridgeService: BridgeService) {}

  // ── Payout Requests ───────────────────────────────────────────────

  @Post('payouts')
  @ApiOperation({ summary: 'Crear solicitud de pago (payout request)' })
  createPayout(
    @CurrentUser() user: User,
    @Body() dto: CreatePayoutRequestDto,
  ) {
    return this.bridgeService.createPayoutRequest(user.id, dto);
  }

  @Get('payouts')
  @ApiOperation({ summary: 'Listar payout requests del usuario' })
  listPayouts(@CurrentUser() user: User) {
    return this.bridgeService.listPayoutRequests(user.id);
  }

  // ── Transfers ─────────────────────────────────────────────────────

  @Get('transfers')
  @ApiOperation({ summary: 'Historial de transferencias Bridge' })
  listTransfers(@CurrentUser() user: User) {
    return this.bridgeService.listTransfers(user.id);
  }

  @Get('transfers/:id')
  @ApiOperation({ summary: 'Detalle de una transferencia' })
  getTransfer(@Param('id') id: string, @CurrentUser() user: User) {
    return this.bridgeService.getTransfer(id, user.id);
  }

  @Post('transfers/:bridgeId/sync')
  @ApiOperation({ summary: 'Sincronizar estado de transferencia con Bridge API' })
  syncTransfer(
    @Param('bridgeId') bridgeId: string,
    @CurrentUser() user: User,
  ) {
    return this.bridgeService.syncTransferFromBridge(bridgeId, user.id);
  }

  // ── Virtual Accounts ──────────────────────────────────────────────

  @Get('virtual-accounts')
  @ApiOperation({ summary: 'Cuentas virtuales del usuario (recepción fiat)' })
  listVirtualAccounts(@CurrentUser() user: User) {
    return this.bridgeService.listVirtualAccounts(user.id);
  }

  // ── External Accounts ─────────────────────────────────────────────

  @Get('external-accounts')
  @ApiOperation({ summary: 'Cuentas bancarias externas registradas' })
  listExternalAccounts(@CurrentUser() user: User) {
    return this.bridgeService.listExternalAccounts(user.id);
  }
}
