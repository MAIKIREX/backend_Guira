# Referencia de Errores y Respuestas HTTP

Catálogo de todos los errores que puede retornar la API de Guira durante el proceso de alta de cuenta.

## Códigos HTTP Generales

- **`201 Created`**: El recurso fue creado exitosamente.
- **`200 OK`**: Operación exitosa.
- **`400 Bad Request`**: Los datos enviados no son válidos o faltan campos requeridos.
- **`401 Unauthorized`**: No hay token de autenticación o el token es inválido/expirado.
- **`403 Forbidden`**: El usuario autenticado no tiene los permisos necesarios para este endpoint.
- **`404 Not Found`**: El recurso solicitado no existe.
- **`409 Conflict`**: El recurso ya existe (por ejemplo, email duplicado).
- **`429 Too Many Requests`**: Se excedió el límite de intentos. Esperar antes de reintentar.
- **`502 Bad Gateway`**: Error al conectar con Bridge API (proveedor externo).

---

## Errores Comunes por Endpoint

### `POST /auth/register`
| Mensaje de Error | Causa | Solución |
| :--- | :--- | :--- |
| **Ya existe una cuenta con este email** | El email ya está registrado. | Usar un email diferente o recuperar la contraseña. |
| **Debe ser un email válido** | Formato de email incorrecto. | Verificar el formato: `usuario@dominio.com` |
| **La contraseña debe tener...** | Password muy corto. | Usar una contraseña de 8+ caracteres. |

### `POST /onboarding/kyc/person`
| Mensaje de Error | Causa | Solución |
| :--- | :--- | :--- |
| **El solicitante debe ser mayor de 18 años** | `date_of_birth` indica minoría. | Solo mayores de 18 años pueden aplicar. |
| **id_type must be one of...** | Valor inválido. | Usar: `passport`, `drivers_license`, o `national_id`. |

### `PATCH /onboarding/kyc/application/submit`
| Mensaje de Error | Causa | Solución |
| :--- | :--- | :--- |
| **Debes adjuntar al menos un documento...** | Falta documento de Identidad. | Usar `/onboarding/documents/upload` antes de enviar. |
| **Debes aceptar los Terms of Service...** | No se aceptaron los ToS. | Llamar a `/onboarding/kyc/tos-accept`. |

### `PATCH /onboarding/kyb/application/submit`
| Mensaje de Error | Causa | Solución |
| :--- | :--- | :--- |
| **Debes agregar al menos un director...** | No hay directores de empresa. | Registrar directores `/onboarding/kyb/business/directors`. |
| **Debes adjuntar al menos un documento...** | Faltan actas o id corporativo. | Subir los archivos corporativos requeridos. |

---

## Formato de Error Estándar (NestJS)

Cualquier error en las validaciones retornará un cuerpo JSON similar a este:

```json
{
  "statusCode": 400,
  "message": [
    "El solicitante debe ser mayor de 18 años",
    "country format must be ISO alpha-2"
  ],
  "error": "Bad Request"
}
```
