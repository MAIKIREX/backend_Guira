import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'usuario@ejemplo.com' })
  @IsEmail({}, { message: 'Debe ser un email válido' })
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'MiClave$egura123' })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(72, { message: 'La contraseña no puede exceder 72 caracteres' })
  password: string;

  @ApiProperty({ example: 'María González' })
  @IsString()
  @IsNotEmpty({ message: 'El nombre completo es requerido' })
  @MaxLength(200)
  full_name: string;
}
