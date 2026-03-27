import {
  Controller, Get, Post, Body, Param, Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import type { User } from '@supabase/supabase-js';
import { ComplianceService } from './compliance.service';
import { RegisterDocumentDto, GetDocumentUploadUrlDto } from './dto/document.dto';
import { CurrentUser } from '../../core/decorators/current-user.decorator';

@ApiTags('Compliance')
@ApiBearerAuth('supabase-jwt')
@Controller('compliance')
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  // ── Documentos ────────────────────────────────────────────────────

  @Post('documents/upload-url')
  @ApiOperation({ summary: 'Obtener URL firmada para subir documento a Storage' })
  getUploadUrl(@CurrentUser() user: User, @Body() dto: GetDocumentUploadUrlDto) {
    return this.complianceService.getDocumentUploadUrl(user.id, dto);
  }

  @Post('documents')
  @ApiOperation({ summary: 'Registrar documento tras subirlo a Storage' })
  registerDocument(@CurrentUser() user: User, @Body() dto: RegisterDocumentDto) {
    return this.complianceService.registerDocument(user.id, dto);
  }

  @Get('documents')
  @ApiOperation({ summary: 'Listar documentos del usuario' })
  @ApiQuery({ name: 'subject_type', required: false })
  listDocuments(
    @CurrentUser() user: User,
    @Query('subject_type') subjectType?: string,
  ) {
    return this.complianceService.listDocuments(user.id, subjectType);
  }

  // ── KYC ──────────────────────────────────────────────────────────

  @Get('kyc')
  @ApiOperation({ summary: 'Obtener estado actual de KYC' })
  getKyc(@CurrentUser() user: User) {
    return this.complianceService.getKycApplication(user.id);
  }

  @Post('kyc')
  @ApiOperation({ summary: 'Crear/retomar KYC application' })
  createKyc(@CurrentUser() user: User) {
    return this.complianceService.createKycApplication(user.id);
  }

  @Post('kyc/:id/submit')
  @ApiOperation({ summary: 'Enviar KYC para revisión' })
  submitKyc(@CurrentUser() user: User, @Param('id') id: string) {
    return this.complianceService.submitKycApplication(user.id, id);
  }

  // ── KYB ──────────────────────────────────────────────────────────

  @Get('kyb')
  @ApiOperation({ summary: 'Obtener estado actual de KYB (empresa)' })
  getKyb(@CurrentUser() user: User) {
    return this.complianceService.getKybApplication(user.id);
  }

  @Post('kyb')
  @ApiOperation({ summary: 'Crear/retomar KYB application' })
  createKyb(@CurrentUser() user: User) {
    return this.complianceService.createKybApplication(user.id);
  }

  @Post('kyb/:id/submit')
  @ApiOperation({ summary: 'Enviar KYB para revisión' })
  submitKyb(@CurrentUser() user: User, @Param('id') id: string) {
    return this.complianceService.submitKybApplication(user.id, id);
  }

  // ── Reviews ───────────────────────────────────────────────────────

  @Get('reviews')
  @ApiOperation({ summary: 'Historial de revisiones compliance' })
  getReviews(@CurrentUser() user: User) {
    return this.complianceService.getComplianceReviews(user.id);
  }
}
