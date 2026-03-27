import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import type { User } from '@supabase/supabase-js';
import { WalletsService } from './wallets.service';
import { CurrentUser } from '../../core/decorators/current-user.decorator';

@ApiTags('Wallets')
@ApiBearerAuth('supabase-jwt')
@Controller('wallets')
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar wallets del usuario' })
  findAll(@CurrentUser() user: User) {
    return this.walletsService.findAllByUser(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener wallet por ID' })
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.walletsService.findOne(id, user.id);
  }

  @Get('me/balances')
  @ApiOperation({ summary: 'Balances actuales del usuario (todas las monedas)' })
  getBalances(@CurrentUser() user: User) {
    return this.walletsService.getBalances(user.id);
  }

  @Get('me/ledger')
  @ApiOperation({ summary: 'Historial de ledger (transacciones inmutables)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  getLedger(
    @CurrentUser() user: User,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.walletsService.getLedger(user.id, limit, offset);
  }

  @Get('me/payin-routes')
  @ApiOperation({ summary: 'Rutas de pago disponibles (cuentas virtuales y liquidation addresses)' })
  getPayinRoutes(@CurrentUser() user: User) {
    return this.walletsService.getPayinRoutes(user.id);
  }
}
