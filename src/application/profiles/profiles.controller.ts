import { Controller, Get, Patch, Body, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { User } from '@supabase/supabase-js';
import { ProfilesService } from './profiles.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CurrentUser } from '../../core/decorators/current-user.decorator';

@ApiTags('Profiles')
@ApiBearerAuth('supabase-jwt')
@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get('me')
  @ApiOperation({ summary: 'Obtener perfil del usuario autenticado' })
  getMe(@CurrentUser() user: User) {
    return this.profilesService.findOne(user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Actualizar perfil (nombre, teléfono, avatar_url)' })
  updateMe(@CurrentUser() user: User, @Body() dto: UpdateProfileDto) {
    return this.profilesService.update(user.id, dto);
  }

  @Get('me/avatar-upload-url')
  @ApiOperation({ summary: 'Obtener URL firmada para subir avatar' })
  getAvatarUploadUrl(
    @CurrentUser() user: User,
    @Query('fileName') fileName: string,
  ) {
    return this.profilesService.getAvatarUploadUrl(user.id, fileName);
  }
}
