# System Patterns

## Architecture Overview
Monorepo con `backend/` y `frontend/`. Backend Express + TypeScript (ESM) con Prisma sobre PostgreSQL (Neon). Frontend Next.js App Router (aún no implementado). API REST versionada en `/api/v1`. Media en Cloudinary (solo referencias en DB).

## Design Patterns in Use
- **Módulos por dominio** en backend: cada módulo (`auth`, `tenants`, `administrators`, `taxonomy`, `base-games`, `games`, `media`, `pricing`, `catalog`, `audit`, `health`) tiene `*.route.ts`, `*.service.ts`, `*.schemas.ts` (Zod).
- **Factory de servicios de taxonomía**: `createTaxonomyService(config)` reutiliza el mismo CRUD para Category, Genre y Platform mediante `TaxonomyConfig` (delegate de Prisma + códigos de error).
- **AuthContext**: el middleware `authenticate` hidrata `req.auth` desde la DB (no del JWT), de modo que desactivar un usuario o cambiar su rol surte efecto en el siguiente request.
- **AppError centralizado**: errores de negocio lanzan `AppError(statusCode, code, message, details)`; un único `errorHandler` los traduce a JSON y **emite `error.details`** (ej. `details.missing`, `details.fields`, `details.missingIds`).
- **Soft delete** en taxonomía, BaseGame y TenantGame (`deletedAt`/`deletedBy`); el slug queda reservado (409 slug existe). Hard delete no existe.
- **Taxonomía dual**: `tenantId = null` = librería global (seed/SUPER_ADMIN, sin CRUD global API); `tenantId` con valor = taxonomía del tenant. Índices únicos **parciales** `WHERE "tenantId" IS NULL` para impedir duplicados globales.
- **Publicación de juego** (`publishFromLibrary`): copia metadata de `BaseGame` al crear `TenantGame` y mapea taxonomía global→tenant **por slug**; `undefined` en el body = auto-mapear, `null`/`[]` = borrar vínculo, string = mapear a otro slug; lo que no tenga equivalente → 422 `TAXONOMY_MAPPING_INCOMPLETE` (nunca skip silencioso).
- **`loadDetails` batched**: los servicios cargan taxonomía/puentes con `findMany` agrupado en vez de `include` de Prisma (evita unions problemáticas con delegates fake y mantiene el DTO plano).
- **`findRow` dos consultas**: acceso cross-tenant se resuelve con ternario de dos `findFirst` (primero scoped, luego por id si el rol lo permite) — la ternaria con union de tipos no compilaba.
- **Cliente Cloudinary REST**: `config/cloudinary.ts` sin SDK — firma sha1 sobre params ordenados (excluyendo `file`/`api_key`), data-URI en `file`, `destroy` tolera `not found`, `list` con paginación `next_cursor`; todo con `withRetry` (3 intentos) fuera del módulo para poder mockearlo en tests.
- **Flujo media upload→DB**: validar → subir con retry → upsert+auditar en `$transaction`; subida fallida ⇒ fila `ERROR` (slot reutilizable) + 502 `MEDIA_UPLOAD_FAILED {attempts}`; DB falla tras subir ⇒ `destroyImage` de compensación (§67) solo en creación. Nunca degradar una fila OK existente a ERROR.
- **Borrado media**: `destroyImage` primero, DB después (fallo ⇒ 502 y fila intacta, reintentable); la detección de restos la hace `POST /media/scan`.
- **Reorden media**: deleteMany+createMany con los mismos ids dentro de `$transaction` (evita choque del CHECK de rango y del índice único parcial durante un intercambio de sortOrder); validación de que `order` es exactamente el conjunto actual → 422 `MEDIA_REORDER_INVALID`.
- **fakeDb muta filas en `update`**: las filas del store son referencias vivas — el servicio debe capturar `previous` (status/publicId) *antes* de la transacción si necesita comparar el estado anterior.
- **Backend = única autoridad de precios**: `validateRuleSet` revalida el conjunto activo ordenado por minSize en cada mutación de reglas Y en preview/apply (422 `PRICE_RULE_OVERLAP`/`PRICE_RULE_UNBOUNDED_ORDER`/`PRICE_RULE_INVALID`); el frontend solo sugiere, el backend decide.
- **Preview nunca escribe / apply sí**: `POST /preview` solo calcula `{changes, unchanged, uncovered, manual}`; `POST /apply` ejecuta los cambios en `$transaction` + `PRICES_APPLIED` + bump de `CatalogMetadata.version` — y 0 cambios ⇒ `applied:0` sin auditoría ni bump.
- **`sizeToGb` decimal**: MB ÷1000, GB ×1, TB ×1000; límites de regla inclusivos (replica `priceFor` de adminv2); tamaño < primer minSize ⇒ uncovered (jamás tocado por apply).
- **Catálogo público sin auth**: identificación solo por slug (`tenant`), `tenantId` prohibido en query (400); instantánea en `$transaction` `RepeatableRead` para coherencia juego↔media↔taxonomía; DTO público §69 blindado (nunca tenantId/priceMode/origin/timestamps/auditoría).
- **ETag por versión**: `"v<version>"` literal en `/` y `/version` con 304 por `If-None-Match` (tolera `W/` y listas); `/sync` sin ETag — por eso `app.set('etag', false)` en `createApp` (Express generaba un weak ETag automático en todas las respuestas).
- **`planCatalogBump` devuelve `{op}` atómico**: desde la auditoría 2026-10-09 hace `upsert({ where: { tenantId }, update: { version: { increment: 1 } }, create: {...} })` — sin `findFirst` previo ni literal `version+1` (el read-then-write perdía incrementos concurrentes, hallazgo H-1). Devuelve el write como `PrismaPromise` empaquetado; si devolviera `Promise<PrismaPromise>` el `Awaited` de TypeScript colapsaría a `unknown` y en runtime el `await` ejecutaría el bump **fuera** del `$transaction` (rompería atomicidad). Se pushea como `ops.push((await planCatalogBump(id)).op)`.
- **Bump incondicional (auditoría 2026-10-09)**: toda mutación de catálogo incrementa `version` sin comprobar `availability`/`showUnavailable` (juegos, media, taxonomía, apply, config, y ahora también `duplicateGame`); solo `PATCH` de juego sin diff público y CRUD de reglas no bump. Garantiza que un cambio nunca queda fuera del snapshot; coste: recargas de más.

## Component Relationships
```
Frontend (Next.js, pendiente)
    ↓ REST
Express (app.ts monta routers)
    ├── /api/v1/health
    ├── /api/v1/auth        (login/refresh/logout/me, rate-limited)
    ├── /api/v1/admin/tenants         (SUPER_ADMIN)
    ├── /api/v1/admin/administrators  (SUPER_ADMIN)
    ├── /api/v1/admin/{categories,genres,platforms}  (ADMIN + tenant isolation)
    ├── /api/v1/admin/base-games      (lectura: SUPER+ADMIN; escritura: solo SUPER)
    ├── /api/v1/admin/games           (ADMIN tenant-scoped; SUPER con tenantId explícito)
    │     └── /:gameId/media/manifest, /:gameId/cover, /:gameId/screenshots[/reorder|/:id]  (montado tras games)
    ├── /api/v1/admin/media           (GET / listado, POST /scan huérfanos)
    ├── /api/v1/admin/pricing         (GET/POST /rules, PATCH/DELETE /rules/:id, POST /preview, POST /apply)
    └── /api/v1/catalog               (sin auth: GET /version, GET /, GET /sync — ETag "v<version>")
    ↓
Prisma (adapter-pg) → PostgreSQL (Neon)
Cloudinary (REST vía config/cloudinary.ts: upload/destroy/list)
```

## Key Technical Decisions
| Decision | Reasoning |
|----------|-----------|
| JWT access (15m) + refresh opaco (30d) en cookie HttpOnly | Access corto en headers; refresh no expone JWT y permite rotación + detección de reutilización |
| Refresh token: random 32 bytes, hash SHA-256, rotación por uso | Estándar OWASP; reutilización revoca la familia de sesiones del admin |
| `req.auth` se hidrata desde DB, no del payload del JWT | Revocación/desactivación efectiva sin lista negra de access tokens |
| Argon2id con dummy-hash para usuarios inexistentes | Igualar timing de respuesta y evitar user enumeration |
| Precios calculados en backend (`PricingRule`) | El frontend nunca es fuente de verdad (README §55) |
| Aislamiento tenant: ADMIN cross-tenant recibe 404 | No filtrar existencia de recursos ajenos |
| Zod en todas las entradas (body/query/params) | Validación runtime + tipos inferidos |
| Taxonomía genérica con 3 configs | Evita triplicar CRUD de Category/Genre/Platform |
| Taxonomía dual `tenantId=null` global + índices únicos parciales | Librería compartida entre tenants sin duplicados; Prisma `@@unique` no puede expresar `WHERE`, se escribe SQL crudo en la migración |
| Publicar mapea taxonomía **por slug** y falla en 422 si falta equivalente | Evita perder o inventar categorías al copiar de la biblioteca |
| `priceMode=MANUAL` fija precio a mano; `priceMode=RULE` solo vía `POST /pricing/preview|apply` (§10 + §84) | El backend es única fuente de verdad de precios; preview informa, apply ejecuta |
| Campos de biblioteca inmutables tras publicar (422) | El origen BIBLIOTECA no se edita en el tenant; los metadatos viven en `BaseGame` |
| Fakes de DB en tests (`createRowDelegate`/`createBridgeDelegate`) | Suite completa sin Postgres; misma firma `where` (operador `in` soportado) |
| Cloudinary sin SDK + firma sha1 manual | Cero dependencias pesadas; control total del payload y fácil de mockear con `vi.mock` |
| multer en memoria con fileFilter (MIME + extensión) | Validación temprana de tipo/tamaño con códigos propios (`MEDIA_*`) antes de llegar al servicio |
| publicId fijo + `overwrite:true` en reemplazos | Slug inmutable ⇒ publicId estable; el historial versionado de Cloudinary mantiene viva la URL anterior si falla la DB |

## Data Flow
1. Request → `requestLogger` (x-request-id) → rate limit global → `helmet`/`cors`/`cookieParser`.
2. Rutas admin → `authenticate` (JWT → DB user) → `requireRoles` → schema Zod → service → Prisma.
3. Mutaciones de tenant/admin/taxonomía → `$transaction` que escribe entidad + `AuditLog`.
4. Login/refresh → sesión en `AdminSession` (hash del token) + cookie `refresh_token` con path `/api/v1/auth`.

## API Patterns
- REST, versionado `/api/v1`. Envolvente `{ success, data, error?, meta? }`.
- Errores: `{ success: false, error: { code, message, details } }`. Códigos tipo `UNAUTHENTICATED`, `TENANT_NOT_FOUND`.
- Paginación: query `page`/`limit` (max 100), respuesta `meta: { page, pageSize, total, totalPages }`.

## Error Handling Strategy
`AppError` → `errorHandler` (único). ZodError → 400. JSON malformado → 400. Errores 4xx del body-parser pasan con su mensaje. resto → 500 genérico + log pino. **Falta**: mapeo de errores de Prisma (P2002, P2003) → hoy caen a 500 (hallazgo M1 de auditoría). Códigos de negocio en español-tipo: `BASE_GAME_SLUG_EXISTS`, `GAME_SLUG_EXISTS`, `DUPLICATE_PUBLICATION`, `TAXONOMY_MAPPING_INCOMPLETE` (422 + `details.missing`), `LIBRARY_FIELDS_IMMUTABLE` (422 + `details.fields`), `PRICE_REQUIRED`, `PRICE_ONLY_MANUAL`, `CATEGORY/GENRE/PLATFORM_NOT_FOUND` (422 + `details.missingIds`); media: `MEDIA_FILE_REQUIRED` (422), `MEDIA_INVALID_TYPE` (422), `MEDIA_FILE_TOO_LARGE` (422), `MEDIA_LIMIT` (422), `MEDIA_REORDER_INVALID` (422), `MEDIA_NOT_FOUND` (404), `MEDIA_UPLOAD_FAILED` (502 + `details.attempts`), `MEDIA_SCAN_FAILED` (502); pricing: `PRICE_RULE_NOT_FOUND` (404), `PRICE_RULE_OVERLAP` (422 + `details.conflict`), `PRICE_RULE_UNBOUNDED_ORDER` (422), `PRICE_RULE_INVALID` (422).

## Testing Strategy
Vitest. Tests por módulo en `backend/tests/integration/` (auth, tenants, taxonomies, administrators, rate limit, middleware, errorHandler, tokens, duration, env, health, base-games, games, media, pricing, **catalog**) con `fakeDb.ts` como doble de Prisma y `vi.mock` de `config/cloudinary` (assets en memoria + inyección de fallos). **407/407 en verde** (2026-10-08); gates `format/lint/typecheck/test/build` + smoke real antes de cada commit.
