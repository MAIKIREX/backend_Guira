import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { User } from '@supabase/supabase-js';

/**
 * Extrae el usuario autenticado del request.
 * Uso: @CurrentUser() user: User
 * Requiere que SupabaseAuthGuard esté activo.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as User;
  },
);
