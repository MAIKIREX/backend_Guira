import {
  Injectable,
  Inject,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase.module';
import { RegisterDto } from './dto/register.dto';
import { AuthResponseDto, MeResponseDto } from './dto/auth-response.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/password-reset.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  /**
   * Registra un nuevo usuario en Supabase Auth.
   * El trigger `handle_new_user` crea automáticamente el perfil en `profiles`.
   */
  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    // ─── El usuario ya fue creado en Supabase Auth por el frontend ───
    // Este endpoint solo se encarga de verificar que existe y asegurar
    // que el perfil (profiles) tenga full_name y datos iniciales.

    // Buscar el usuario recién creado por email
    const { data: existingUsers } = await this.supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1,
      // @ts-expect-error – Supabase admin API acepta filter en runtime
      filter: `email.eq.${dto.email.toLowerCase()}`,
    });

    const users =
      (existingUsers as { users?: { id: string; email?: string }[] })?.users ?? [];
    const existingUser = users.find(
      (u) => u.email?.toLowerCase() === dto.email.toLowerCase(),
    );

    if (!existingUser) {
      // Si no encontramos al usuario, puede que aún no se haya propagado
      // o que el signup en Supabase haya fallado silenciosamente.
      throw new ConflictException(
        'No se encontró la cuenta en el sistema de autenticación. Por favor, intenta registrarte nuevamente.',
      );
    }

    // Verificar si ya tiene un perfil completo (evitar duplicados)
    const { data: existingProfile } = await this.supabase
      .from('profiles')
      .select('id, full_name')
      .eq('id', existingUser.id)
      .maybeSingle();

    if (existingProfile && existingProfile.full_name) {
      // El perfil ya está completo — posible llamada duplicada
      return {
        user_id: existingUser.id,
        email: existingUser.email ?? dto.email,
        access_token: '',
        refresh_token: '',
        expires_in: 0,
        onboarding_status: 'pending',
      };
    }

    // Actualizar full_name en profiles (el trigger handle_new_user ya insertó el registro base)
    await this.supabase
      .from('profiles')
      .update({ full_name: dto.full_name })
      .eq('id', existingUser.id);

    return {
      user_id: existingUser.id,
      email: existingUser.email ?? dto.email,
      access_token: '',
      refresh_token: '',
      expires_in: 0,
      onboarding_status: 'pending',
    };
  }

  /**
   * Retorna el perfil completo del usuario autenticado.
   */
  async getMe(userId: string): Promise<MeResponseDto> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select(
        'id, email, full_name, role, onboarding_status, bridge_customer_id, is_active, is_frozen, phone, avatar_url, daily_limit_usd, monthly_limit_usd, created_at',
      )
      .eq('id', userId)
      .single();

    if (error || !data) {
      throw new NotFoundException('Perfil no encontrado');
    }

    return data as MeResponseDto;
  }

  /**
   * Renueva la sesión usando un refresh token.
   */
  async refreshToken(refreshToken: string): Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }> {
    const { data, error } = await this.supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.session) {
      throw new UnauthorizedException(
        'Refresh token inválido o expirado. Inicia sesión nuevamente.',
      );
    }

    return {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in ?? 3600,
    };
  }

  /**
   * Invalida la sesión del usuario (cierra sesión en Supabase Auth).
   */
  async logout(userId: string): Promise<{ message: string }> {
    const { error } = await this.supabase.auth.admin.signOut(userId);

    if (error) {
      this.logger.warn(
        `Error cerrando sesión para ${userId}: ${error.message}`,
      );
      // No lanzamos error — el token ya podría estar expirado
    }

    return { message: 'Sesión cerrada exitosamente' };
  }

  /**
   * Solicita el envío de un correo para restablecer la contraseña.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    // Usamos el cliente regular (no admin) para resetPasswordForEmail
    // para que use las plantillas de email configuradas en el proyecto
    const { error } = await this.supabase.auth.resetPasswordForEmail(
      dto.email,
      {
        redirectTo: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/reset-password`,
      },
    );

    if (error) {
      this.logger.error(
        `Error en forgot password para ${dto.email}: ${error.message}`,
      );
      // Nunca confirmamos si el email existe o no por seguridad,
      // pero si el error es de rate limit etc, lo manejamos.
      // Retornamos éxito de todas formas si no es un error de sistema crítico.
    }

    return {
      message:
        'Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña.',
    };
  }

  /**
   * Restablece la contraseña de un usuario asumiendo que ya se autenticó temporalmente
   * con el token enviado a su correo electrónico.
   * Requiere el ID del usuario (extraído del token) y la nueva contraseña.
   */
  async resetPassword(
    userId: string,
    dto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    // Usamos updateUser usando la sesión de supabase
    // Dado que estamos en el backend con Guards personalizados, la forma más segura
    // es usar el API admin para actualizar el usuario directamente, ya que el middleware
    // de SupabaseAuthGuard ya validó la autenticidad de la petición con el token JWT

    const { error } = await this.supabase.auth.admin.updateUserById(userId, {
      password: dto.new_password,
    });

    if (error) {
      this.logger.error(
        `Error reseteando contraseña para ${userId}: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'No se pudo restablecer la contraseña. Intente nuevamente.',
      );
    }

    return { message: 'Contraseña actualizada exitosamente' };
  }
}
