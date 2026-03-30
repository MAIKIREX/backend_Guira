import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/create-supplier.dto';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../core/guards/supabase-auth.guard';

@ApiTags('Suppliers')
@ApiBearerAuth('supabase-jwt')
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Post()
  @ApiOperation({ summary: 'Crear proveedor' })
  @ApiResponse({ status: 201, description: 'Proveedor creado' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSupplierDto,
  ) {
    return this.suppliersService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar proveedores activos' })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.suppliersService.findAll(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de proveedor' })
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.suppliersService.findOne(id, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar proveedor' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.suppliersService.update(id, user.id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Desactivar proveedor' })
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.suppliersService.remove(id, user.id);
  }
}
