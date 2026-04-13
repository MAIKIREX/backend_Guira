import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { FeesService } from './fees.service';
import {
  CreateFeeDto,
  UpdateFeeDto,
  CreateFeeOverrideDto,
} from './dto/create-fee.dto';
import { UpdateFeeOverrideDto } from './dto/update-fee-override.dto';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../core/guards/supabase-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { Roles } from '../../core/decorators/roles.decorator';

// ─────────────────────────────────────────────────
//  Ruta pública: /fees
// ─────────────────────────────────────────────────

@ApiTags('Fees')
@ApiBearerAuth('supabase-jwt')
@Controller('fees')
export class FeesController {
  constructor(private readonly feesService: FeesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar tarifas vigentes' })
  @ApiResponse({ status: 200, description: 'Tarifas activas' })
  getPublicFees() {
    return this.feesService.getPublicFees();
  }
}

// ─────────────────────────────────────────────────
//  Rutas admin: /admin/fees/...
// ─────────────────────────────────────────────────

@ApiTags('Admin — Fees')
@ApiBearerAuth('supabase-jwt')
@Controller('admin/fees')
@UseGuards(RolesGuard)
export class AdminFeesController {
  constructor(private readonly feesService: FeesService) {}

  @Get()
  @Roles('staff', 'admin', 'super_admin')
  @ApiOperation({ summary: 'Listar todas las tarifas (activas e inactivas)' })
  getAllFees() {
    return this.feesService.getAllFees();
  }

  @Post()
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Crear nueva tarifa' })
  @ApiResponse({ status: 201, description: 'Tarifa creada' })
  createFee(@Body() dto: CreateFeeDto) {
    return this.feesService.createFee(dto);
  }

  @Patch(':id')
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Actualizar tarifa' })
  updateFee(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateFeeDto,
  ) {
    return this.feesService.updateFee(id, dto);
  }

  @Get('overrides/:userId')
  @Roles('staff', 'admin', 'super_admin')
  @ApiOperation({ summary: 'Overrides de fee para un usuario' })
  getOverrides(@Param('userId', new ParseUUIDPipe()) userId: string) {
    return this.feesService.getOverrides(userId);
  }

  @Post('overrides')
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Crear override de fee para cliente VIP' })
  @ApiResponse({ status: 201, description: 'Override creado' })
  createOverride(
    @Body() dto: CreateFeeOverrideDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.feesService.createOverride(dto, actor.id);
  }

  @Patch('overrides/:id')
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Actualizar override de fee' })
  @ApiResponse({ status: 200, description: 'Override actualizado' })
  updateOverride(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateFeeOverrideDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.feesService.updateOverride(id, dto, actor.id);
  }

  @Delete('overrides/:id')
  @Roles('super_admin')
  @ApiOperation({ summary: 'Eliminar override de fee permanentemente' })
  @ApiResponse({ status: 200, description: 'Override eliminado' })
  deleteOverride(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.feesService.deleteOverride(id, actor.id);
  }
}

