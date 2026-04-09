import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/auth-response.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/password-reset.dto';
import { Public } from '../../core/guards/supabase-auth.guard';
import type { AuthenticatedUser } from '../../core/guards/supabase-auth.guard';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { RateLimitGuard } from '../../core/guards/rate-limit.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Public()
  @UseGuards(RateLimitGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Registrar nuevo usuario',
    description:
      'Crea un usuario en Supabase Auth. El trigger de DB creará el perfil automáticamente con role=client y onboarding_status=pending.',
  })
  @ApiResponse({ status: 201, description: 'Usuario creado exitosamente' })
  @ApiResponse({ status: 409, description: 'Email ya registrado' })
  @ApiResponse({ status: 429, description: 'Demasiados intentos' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Get('me')
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Obtener datos del usuario autenticado',
    description:
      'Retorna el perfil completo incluyendo rol, estado de onboarding y límites de transacción.',
  })
  @ApiResponse({ status: 200, description: 'Perfil del usuario' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  async getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getMe(user.id);
  }

  @Post('refresh')
  @Public()
  @UseGuards(RateLimitGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Renovar token de acceso',
    description: 'Usa un refresh token para obtener un nuevo access token.',
  })
  @ApiResponse({ status: 200, description: 'Token renovado' })
  @ApiResponse({ status: 401, description: 'Refresh token inválido' })
  @ApiResponse({ status: 429, description: 'Demasiados intentos' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refresh_token);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Cerrar sesión',
    description: 'Invalida la sesión del usuario en Supabase Auth.',
  })
  @ApiResponse({ status: 200, description: 'Sesión cerrada' })
  async logout(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.logout(user.id);
  }

  @Post('forgot-password')
  @Public()
  @UseGuards(RateLimitGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Solicitar restablecimiento de contraseña',
    description:
      'Envía un correo con un enlace para restablecer la contraseña a la cuenta asociada.',
  })
  @ApiResponse({ status: 200, description: 'Correo enviado (si existe)' })
  @ApiResponse({ status: 429, description: 'Demasiados intentos' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @ApiBearerAuth('supabase-jwt')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restablecer contraseña',
    description:
      'Actualiza la contraseña del usuario. Requiere estar autenticado con el token especial recibido por correo.',
  })
  @ApiResponse({ status: 200, description: 'Contraseña actualizada' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.authService.resetPassword(user.id, dto);
  }
}
