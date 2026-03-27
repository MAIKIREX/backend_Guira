import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase.module';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class ProfilesService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  async findOne(userId: string) {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !data) throw new NotFoundException('Perfil no encontrado');
    return data;
  }

  async update(userId: string, dto: UpdateProfileDto) {
    const { data, error } = await this.supabase
      .from('profiles')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  /** Genera una URL firmada para subir avatar a Storage */
  async getAvatarUploadUrl(userId: string, fileName: string) {
    const path = `${userId}/${Date.now()}-${fileName}`;
    const { data, error } = await this.supabase.storage
      .from('avatars')
      .createSignedUploadUrl(path);

    if (error) throw new Error(error.message);
    return { upload_url: data.signedUrl, path };
  }
}
