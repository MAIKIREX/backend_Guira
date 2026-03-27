# Tabla: `public.compliance_review_comments`

## Función de la Tabla
Almacena los comentarios y notas que el Staff intercambia durante el análisis de un caso de revisión. Permite la comunicación interna entre analistas sobre la misma solicitud, y sirve como justificación escrita ante una auditoría externa de por qué se tomó cierta decisión.

## Columnas

| Nombre | Tipo | Restricciones | Default | Descripción |
|---|---|---|---|---|
| `id` | `uuid` (PK) | NOT NULL | `uuid_generate_v4()` | Identificador único del comentario. |
| `review_id` | `uuid` | NOT NULL, FK → `compliance_reviews.id` | — | Caso al que pertenece el comentario. |
| `author_id` | `uuid` | NOT NULL, FK → `profiles.id` | — | Staff member que dejó el comentario. |
| `body` | `text` | NOT NULL | — | Cuerpo del comentario (texto libre). |
| `is_internal` | `boolean` | NOT NULL | `true` | Si es `true`, solo visible para Staff/Admin. Si es `false`, puede enviarse al cliente. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Fecha del comentario. |

*RLS: Solo Staff y Admin pueden insertar y leer. Inmutable (no UPDATE ni DELETE).*

## Relaciones
- **Pertenece a:** `compliance_reviews` via `review_id`.
- **Escrito por:** `profiles` via `author_id`.

## Ejemplo JSON

```json
{
  "id": "com11111-e89b-12d3-a456-426614174000",
  "review_id": "rev11111-e89b-12d3-a456-426614174000",
  "author_id": "staff000-e89b-12d3-a456-426614174000",
  "body": "El acta constitutiva está vencida. La empresa fue incorporada en 2019 pero el documento presentado es de 2018. Solicitar versión actualizada o carta de renovación.",
  "is_internal": true,
  "created_at": "2026-03-26T11:30:00Z"
}
```
