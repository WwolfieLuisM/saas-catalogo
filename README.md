# Javier — SaaS Gaming Catalog Platform

Plataforma SaaS multi-tenant para catálogos de videojuegos, desarrollada por **Luismi**.

**Javier** es el primer tenant/cliente de la plataforma.

La plataforma está diseñada para poder incorporar futuros negocios sin duplicar el código.

---

## 1. Arquitectura

```text
                         ┌──────────────────────┐
                         │      Usuario         │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │ Next.js / React      │
                         │ Frontend             │
                         └──────────┬───────────┘
                                    │ REST
                                    ▼
                         ┌──────────────────────┐
                         │ Express + TypeScript │
                         │ Backend API          │
                         └───────┬───────┬──────┘
                                 │       │
                    ┌────────────┘       └─────────────┐
                    ▼                                  ▼
             ┌──────────────┐                   ┌──────────────┐
             │ PostgreSQL   │                   │ Cloudinary   │
             │ Neon + Prisma│                   │ Media/CDN    │
             └──────────────┘                   └──────────────┘

                         Deploy / Infra
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
           GitHub           Render          Cloudflare
```

---

# 2. Stack

## Backend

- Node.js
- Express.js
- TypeScript
- Prisma
- PostgreSQL
- Neon
- JWT
- Zod
- Cloudinary

## Frontend

- Next.js
- React
- TypeScript
- App Router

## Infraestructura

- GitHub
- GitHub Actions
- Render
- Cloudflare
- Neon
- Cloudinary

## Desarrollo

- Git
- GitHub CLI
- OpenCode

---

# 3. Principios

## Multi-tenant desde el inicio

La plataforma no debe estar diseñada exclusivamente para Javier.

```text
Luismi
│
├── Biblioteca base
│   └── +1000 juegos
│
├── Javier
│   ├── Juegos de biblioteca
│   └── Juegos personalizados
│
├── Tenant B
│
└── Tenant C
```

Cada tenant tiene sus propios:

- juegos;
- categorías;
- géneros;
- plataformas;
- precios;
- configuración;
- media;
- administradores;
- sesiones;
- auditoría.

---

# 4. Roles

## SUPER_ADMIN

Propietario de la plataforma.

Puede:

- administrar tenants;
- administrar biblioteca base;
- administrar administradores;
- ver auditoría global según permisos;
- administrar configuraciones globales;
- realizar operaciones críticas.

## ADMIN

Administrador de un tenant.

Puede administrar únicamente su tenant:

- juegos;
- catálogo;
- categorías;
- géneros;
- plataformas;
- precios;
- media;
- importación/exportación;
- sesiones permitidas;
- configuración disponible.

El backend debe imponer el aislamiento.

Nunca confiar en un `tenantId` enviado por frontend.

---

# 5. Repositorios / estructura recomendada

```text
project/
├── backend/
│   ├── src/
│   ├── prisma/
│   ├── tests/
│   ├── Dockerfile
│   ├── package.json
│   └── README.md
│
├── frontend/
│   ├── app/
│   ├── components/
│   ├── lib/
│   ├── public/
│   ├── tests/
│   ├── package.json
│   └── README.md
│
├── docs/
│   ├── Backend+Db.md
│   ├── Frontend.md
│   └── README.md
│
├── .github/
│   └── workflows/
│
├── .gitignore
└── README.md
```

Si el repositorio existente utiliza otra estructura válida, conservarla y documentarla.

---

# 6. Documentos de arquitectura

Los documentos principales son:

- `Backend+Db.md` (unificado: especificación técnica + alcance multi-tenant V2)
- `Frontend.md`

Estos documentos contienen las especificaciones de implementación.

Antes de modificar una parte importante del proyecto:

1. revisar el documento correspondiente;
2. revisar el código actual;
3. verificar el contrato real;
4. evitar duplicar o contradecir decisiones existentes.

---

# 7. Backend

Ruta conceptual:

```text
/backend
```

API:

```text
/api/v1
```

Endpoints públicos principales:

```text
GET /api/v1/games
GET /api/v1/games/:id
GET /api/v1/catalog
GET /api/v1/catalog/version
GET /api/v1/catalog/sync
GET /api/v1/categories
GET /api/v1/genres
GET /api/v1/platforms
GET /api/v1/health
```

Admin:

```text
/api/v1/admin/*
```

## Catálogo público

Catálogo por tenant sin autenticación. El tenant se identifica siempre por su `slug`:

```text
GET /api/v1/catalog/version?tenant=<slug>
GET /api/v1/catalog?tenant=<slug>
GET /api/v1/catalog/sync?tenant=<slug>&since=<numero>
```

- `/version` devuelve `{ version, updatedAt }` de `CatalogMetadata` (versión `0` y `updatedAt: null` si aún no existe).
- `/` devuelve la instantánea pública completa: `{ version, updatedAt, games }`, con los juegos visibles (`availability=true`, no eliminados) ordenados por `createdAt` asc y luego `id` asc. Cada juego expone solo los campos del DTO público (§69): `id`, `title`, `slug`, `description`, `price` (número o `null`, siempre `currency: "CUP"`), `availability`, `size {value, unit, formatted}`, `releaseYear`, `category {id, name} | null`, `genres[]`, `platforms[]`, `coverImage {url, alt} | null`, `screenshots[]` y `requirements {minimum, recommended}`. Nunca se filtran `tenantId`, `priceMode`, `origin`, timestamps ni datos de auditoría.
- `/sync` compara `since` con la versión actual: si coincide responde `{ changed: false, version, updatedAt }`; si difiere (o `since` falta) responde `{ changed: true, version, updatedAt, games }` con el snapshot completo.

Estrategia de caché y consistencia:

- `/version` y `/` envían `ETag: "v<version>"` y `Cache-Control: no-cache`.
- Con `If-None-Match` coincidente responden `304` sin cuerpo; un `If-None-Match` desactualizado recibe `200` con el ETag nuevo.
- `/sync` no envía `ETag` (solo `Cache-Control: no-cache`).
- La instantánea se lee en una única transacción `RepeatableRead` para que juegos, media y taxonomía sean coherentes entre sí.

Errores:

```text
400 VALIDATION_ERROR   # falta tenant, está vacío, se envía tenantId o since no es entero
404 TENANT_NOT_FOUND   # slug inexistente o tenant inactivo
```

Versionado (bump incondicional desde la auditoría 2026-10-09): toda mutación de catálogo incrementa `version` sin comprobar visibilidad — crear/editar/eliminar/restaurar/duplicar juegos, subir/borrar/reordenar/escanear media, crear o renombrar taxonomía del tenant, aplicar precios y alternar `showUnavailable` — de modo que un cambio nunca puede quedar fuera del snapshot (el coste son recargas de más, nunca datos obsoletos). Excepción: un `PATCH` de juego sin ningún cambio público y el CRUD de reglas de precio (los precios se materializan con `apply`) no incrementan. El incremento es atómico (`upsert` con `version: { increment: 1 }`), sin lost update entre peticiones concurrentes.

Ejemplos:

```bash
curl "http://localhost:3000/api/v1/catalog/version?tenant=javier"
curl -H 'If-None-Match: "v5"' "http://localhost:3000/api/v1/catalog?tenant=javier"
curl "http://localhost:3000/api/v1/catalog/sync?tenant=javier&since=5"
```

## Admin API (dashboard, sesiones, auditoría, sistema, config, backups, import/export)

Endpoints autenticados bajo `/api/v1/admin/*` (roles `ADMIN` y `SUPER_ADMIN`):

```text
GET    /api/v1/admin/dashboard
GET    /api/v1/admin/sessions
DELETE /api/v1/admin/sessions/:id
GET    /api/v1/admin/audit
GET    /api/v1/admin/system
GET    /api/v1/admin/config
PATCH  /api/v1/admin/config
GET    /api/v1/admin/backups
POST   /api/v1/admin/backups
POST   /api/v1/admin/backups/:id/restore
GET    /api/v1/admin/export/catalog
GET    /api/v1/admin/export/media-manifest
POST   /api/v1/admin/import/validate
POST   /api/v1/admin/import/preview
POST   /api/v1/admin/import/backup
POST   /api/v1/admin/import/run
POST   /api/v1/admin/games/:id/duplicate
```

Dashboard (`GET /api/v1/admin/dashboard?tenantId=<uuid>`):

- Devuelve exactamente los 10 campos de la especificación: `totalGames`, `availableGames`, `unavailableGames`, `libraryGames`, `customGames`, `mediaErrors`, `orphanMedia`, `activeSessions`, `recentAuditEvents` (ventana de 24 h) y `catalogVersion` (`null` si el tenant no tiene `CatalogMetadata`).
- `ADMIN` solo agrega su propio tenant (enviar `?tenantId` distinto al propio responde `403`); `SUPER_ADMIN` agrega el global o, con `?tenantId`, un tenant concreto (desconocido → `422 TENANT_NOT_FOUND`).
- Los juegos eliminados (`deletedAt`) no cuentan. `activeSessions` cuenta sesiones sin revocar y no vencidas de los admins del alcance; `recentAuditEvents` global incluye eventos de plataforma (`tenantId: null`).

Sesiones (`GET /api/v1/admin/sessions`):

- Filtros: `status` (`active` por defecto, `revoked`, `all`), `q` (sobre `userAgent`), `tenantId` (mismas reglas de dashboard) y paginación estándar (`page`, `limit`, `meta`). Orden estable por `createdAt` desc y luego `id` desc.
- El DTO expone `id`, `adminId`, `adminUsername`, `adminRole`, `tenantId`, `userAgent`, `ipAddress`, `createdAt`, `lastUsedAt`, `expiresAt`, `revokedAt` e `isCurrent`; nunca `tokenHash` ni tokens.
- `isCurrent` marca la sesión activa más reciente del usuario autenticado (heurística: el JWT no lleva `sessionId` y la cookie de refresh no llega a `/admin/*`); con varias sesiones simultáneas el distintivo puede señalar otra dispositivo.

Revocación (`DELETE /api/v1/admin/sessions/:id`):

- `ADMIN` solo revoca las suyas (ajena o inexistente → `404 SESSION_NOT_FOUND`); `SUPER_ADMIN` cualquier sesión. Ya revocada → `409 SESSION_ALREADY_REVOKED`. El id debe ser un uuid (`400` si no).
- Revoca y audita `SESSION_REVOKED` (entidad `AdminSession`, metadata `adminId`) en una única transacción. El refresh de esa sesión queda invalidado de inmediato (`401 REFRESH_REUSE_DETECTED`); el access token sigue siendo válido hasta su expiración (JWT sin estado). En el propio dispositivo conviene `POST /auth/logout`.

Auditoría (`GET /api/v1/admin/audit`):

- Solo lectura: no existen endpoints de escritura (POST/PATCH/DELETE responden `404`). Los eventos se escriben exclusivamente desde los servicios con `auditData()`.
- Filtros: `action` y `entity` (exactos), `from`/`to` (ISO 8601 con offset, `from <= to`), `q` (acción, entidad, `entityId` o username del actor, insensible a mayúsculas), `tenantId` y paginación. Orden por `timestamp` desc y luego `id` desc.
- `ADMIN` siempre ve su tenant (tenant ajeno → `403`); `SUPER_ADMIN` ve el global incluyendo eventos de plataforma (`tenantId: null`) o filtra por tenant (`422` si no existe).
- Cada evento incluye `actorUsername` resuelto y `metadata`; no expone `userAgent`, `tokenHash` ni credenciales.

Sistema (`GET /api/v1/admin/system`):

- Devuelve exactamente `{ status, database, uptimeSeconds, nodeVersion, environment, timestamp }`. `database` reutiliza el mismo chequeo `SELECT 1` que `/health`; nunca expone `DATABASE_URL`, credenciales ni permite mutaciones (POST/DELETE → `404`).

Configuración (`GET|PATCH /api/v1/admin/config`):

- Los 5 campos de `TenantSettings` del spec: `publicName` (≤50), `whatsapp` (≤30), `footer` (≤120), `showUnavailable` (default `false`) y `offerOffline` (default `true`); el DTO incluye `tenantId` y `updatedAt`.
- `ADMIN` opera siempre sobre su propio tenant (`?tenantId` ajeno → `403`); `SUPER_ADMIN` requiere `?tenantId` (missing → `400`, desconocido → `422 TENANT_NOT_FOUND`).
- `PATCH` exige al menos un campo (body vacío → `400`) y audita `CONFIG_UPDATED` (entidad `TenantSettings`, metadata `fields`); si cambia `showUnavailable` también incrementa la versión del catálogo para que los clientes revaliden.

Backups (`GET|POST /api/v1/admin/backups`, `POST /:id/restore`):

- Copia de seguridad real con payload JSON en la tabla `Backup` (juegos, taxonomía, media, precios, settings y metadata de catálogo; nunca passwords, sesiones ni auditoría) según lo aprobado para el flujo pre-import (Fase 12).
- `POST` acepta `type` (`MANUAL` por defecto, `PRE_IMPORT`, `AUTOMATIC`) y `tenantId` opcional; `ADMIN` siempre crea `scope: TENANT` del propio tenant (ajeno → `403`), `SUPER_ADMIN` crea `PLATAFORMA` (sin `tenantId`) o `TENANT` (desconocido → `422`). Audita `BACKUP_CREATED`.
- `GET` lista paginado ordenado por `createdAt` desc sin exponer el payload; `ADMIN` solo ve las suyas (`?tenantId` ajeno → `403`), `SUPER_ADMIN` todas o filtra (`422` si no existe).
- `POST /:id/restore` es exclusivo `SUPER_ADMIN` y exige `{ "confirm": "RESTAURAR" }` (`422 RESTORE_CONFIRM_REQUIRED`); aplica el snapshot transaccionalmente (borra y reinserta el alcance de la copia), avanza la versión del catálogo (`max(actual, copia) + 1`) y audita `RESTORE_COMPLETED`. Copia inexistente → `404 BACKUP_NOT_FOUND`; payload corrupto → `422 BACKUP_PAYLOAD_INVALID`.

Import/Export (Fase 12, `/api/v1/admin/export` y `/api/v1/admin/import`):

- `GET /export/catalog` devuelve el catálogo completo (`schema: luismi-platform/catalog@1`, `tenant`, `version`, `games[]` con referencias por slug) y `Content-Disposition: attachment` (`catalogo-<tenant>.json`); audita `CATALOG_EXPORTED` con metadata mínima no sensible. `GET /export/media-manifest` lista los assets reales de Cloudinary (`luismi-platform/media-manifest@1`, `manifest-multimedia-<tenant>.json`) y audita `MEDIA_MANIFEST_EXPORTED`.
- `POST /import/validate` valida sin mutar: formato estricto (`games` con campos conocidos, entradas de hasta 50 géneros/plataformas) y referencias por slug (`categorySlug`, `genreSlugs`, `platformSlugs`, `baseGameSlug`) resueltas contra la DB del tenant; inexistentes → conflictos explícitos en `errors`.
- `POST /import/preview` calcula `changes` (`create`/`update`/`delete`/`unchanged`) y `fingerprint` (sha256 de versión + `id`/`updatedAt`/`deletedAt` de cada fila) sin escribir nada: juegos activos ausentes del archivo se marcan para soft delete, campos de biblioteca (`origin`, `baseGameId` y metadatos copiados) solo generan warnings, y el slug de un juego ya eliminado → `422 IMPORT_VALIDATION_FAILED`.
- `POST /import/backup` crea la copia de seguridad `PRE_IMPORT` (`COMPLETED`) del alcance del tenant, requerida por `run`.
- `POST /import/run` exige `{ catalog, confirm: "IMPORTAR", backupId, fingerprint }`: copia inexistente → `404 BACKUP_NOT_FOUND`, no `PRE_IMPORT`/de otro tenant → `422 IMPORT_BACKUP_INVALID`, formato inválido → `422 IMPORT_FORMAT_INVALID`, confirm ausente → `400 VALIDATION_ERROR` y otro valor → `422 IMPORT_CONFIRM_REQUIRED`; si el catálogo cambió entre preview y run (fingerprint de otra versión) → `409 IMPORT_PREVIEW_STALE` sin tocar datos. Aplica altas/cambios/borrados en una única transacción all-or-nothing, audita `IMPORT_STARTED` y `IMPORT_COMPLETED` con contadores y avanza `CatalogMetadata.version`.
- La entrada usa el formato del export: ids ignorados (siempre se resuelve por slug), `id` opcional solo como hint, y `tenantId` del archivo se ignora (el servidor usa el de la sesión). Roundtrip export→import con el mismo archivo reporta `unchanged` total (la comparación de `requirements` es insensible al orden de claves jsonb).
- Límites de cuerpo: `/import` acepta JSON hasta 5 MB (`413 PAYLOAD_TOO_LARGE`); el resto de rutas admin mantiene 1 MB.

Duplicar juego (`POST /api/v1/admin/games/:id/duplicate`):

- Crea siempre una entidad nueva (nunca reutiliza el id): slug `-copia` (o `-copia-2`, `-copia-3`… si está ocupado), título con sufijo `(copia)` (máx. 150), `origin: PERSONALIZADO`, `baseGameId: null`, `availability: false`, precio/requirements/metadata copiados y puentes de taxonomía replicados; audita `CREATE` con `duplicatedFrom`.
- Inexistente o de otro tenant (ADMIN) → `404 GAME_NOT_FOUND`; `id` no uuid → `400`; slug agotado → `409 GAME_SLUG_EXISTS`.

Errores comunes:

```text
400 VALIDATION_ERROR          # parámetros o fechas inválidos
401 UNAUTHENTICATED           # sin token o token inválido
403 FORBIDDEN                 # rol no autorizado o tenant ajeno en ADMIN
404 SESSION_NOT_FOUND         # sesión inexistente o de otro admin (ADMIN)
404 BACKUP_NOT_FOUND          # copia PRE_IMPORT inexistente (import/run)
409 SESSION_ALREADY_REVOKED   # sesión ya revocada
409 IMPORT_PREVIEW_STALE      # el catálogo cambió entre preview y run
413 PAYLOAD_TOO_LARGE         # cuerpo mayor a 5 MB en /import
422 TENANT_NOT_FOUND          # ?tenantId inexistente (SUPER_ADMIN)
422 IMPORT_VALIDATION_FAILED  # preview con errores de validación/referencias
```

---

# 8. Base de datos

Proveedor:

**Neon PostgreSQL**

ORM:

**Prisma**

Modelos principales:

```text
Tenant
TenantSettings
AdminUser
AdminSession
BaseGame
TenantGame
Category
Genre
Platform
GamePlatform
GameMedia
PricingRule
CatalogMetadata
AuditLog
```

Puede haber modelos auxiliares adicionales si son necesarios.

---

# 9. Biblioteca base

Luismi mantiene una biblioteca base de más de 1000 juegos.

Un tenant puede incorporar juegos de esta biblioteca a su catálogo.

También puede crear juegos personalizados.

Conceptualmente:

```text
BaseGame
    │
    ├── TenantGame (Javier)
    ├── TenantGame (Tenant B)
    └── TenantGame (Tenant C)
```

Un juego proveniente de biblioteca debe conservar referencia al `BaseGame`.

Un juego personalizado no necesita `BaseGame`.

---

# 10. Juegos

Un juego soporta:

- título;
- slug;
- descripción;
- precio;
- disponibilidad;
- tamaño;
- unidad de tamaño;
- año;
- categoría;
- género;
- múltiples plataformas;
- portada;
- hasta 4 screenshots;
- requisitos mínimos;
- requisitos recomendados;
- origen;
- tenant;
- auditoría;
- soft delete.

---

# 11. Requisitos

## Mínimos

- CPU
- GPU
- RAM
- OS
- DirectX
- almacenamiento

## Recomendados

- CPU
- GPU
- RAM
- OS
- DirectX
- almacenamiento

Presets:

```text
Intel i3/i5/i7/i9
AMD Ryzen 3/5/7/9
GTX
RTX
RX
Intel Arc
Other/manual
```

RAM:

```text
2 / 4 / 6 / 8 / 12 / 16 / 32 / 64 GB
```

---

# 12. Precios

Los precios son propiedad del tenant.

Las reglas se almacenan en:

```text
PricingRule
```

Ejemplo inicial de seed:

```text
1–10 GB       → 40 CUP
10.01–50 GB  → 50 CUP
50.01–100 GB → 70 CUP
100.01+ GB   → 100 CUP
```

Estos valores son configuración inicial, no valores globales obligatorios.

El backend calcula el precio.

El frontend no debe convertirse en fuente de verdad.

---

# 13. Multimedia

Proveedor:

**Cloudinary**

La base de datos guarda referencias y metadatos.

No guardar imágenes binarias en PostgreSQL.

Estructura lógica:

```text
tenants/{tenantId}/games/{slug}/cover
tenants/{tenantId}/games/{slug}/shot-1
tenants/{tenantId}/games/{slug}/shot-2
tenants/{tenantId}/games/{slug}/shot-3
tenants/{tenantId}/games/{slug}/shot-4
```

Soporta:

- upload;
- reemplazo;
- eliminación;
- manifest;
- retry;
- errores;
- detección de media huérfana.

---

# 14. Autenticación

Sistema:

```text
JWT
```

Access token:
- aproximadamente 15 minutos.

Refresh token:
- aproximadamente 30 días.

Refresh tokens:
- almacenados como hash;
- rotación;
- revocación;
- protección contra reutilización.

Frontend:
- access token en memoria;
- refresh token en cookie HttpOnly/Secure.

---

# 15. Seguridad

Implementar:

- Helmet;
- CORS;
- rate limiting;
- Zod;
- autorización;
- tenant isolation;
- validación runtime;
- manejo centralizado de errores;
- logs seguros.

Nunca almacenar en Git:

- `.env`;
- passwords;
- JWT secrets;
- Cloudinary secrets;
- tokens.

## Correcciones de seguridad (Fase 10)

- H1: cambio de password revoca las sesiones activas del administrador en la misma transacción (`administrators.service.ts`);
- H2: `authenticate` valida que el tenant del usuario esté activo (401 `UNAUTHENTICATED`); `login`/`refresh` devuelven 401 `ACCOUNT_DISABLED` si el tenant está desactivado (login/refresh/getMe);
- M1: mapeo Prisma de errores de constraint a códigos HTTP: P2002 → 409 `UNIQUE_CONFLICT`, P2003 → 422 `FOREIGN_KEY_VIOLATION`, P2025 → 404 `NOT_FOUND` (los demás siguen siendo 500);
- M3: `resolveTenantId` (games, taxonomías, media, pricing) valida la existencia del tenant para SUPER_ADMIN → 422 `TENANT_NOT_FOUND` (antes 500 o lista vacía silenciosa);
- M4: `envSchema` fuerza `COOKIE_SECURE=true` cuando `NODE_ENV=production`;
- L4: `login` purga sesiones expiradas del usuario antes de emitir token nuevo;
- L6: `CORS_ORIGIN` con `*` + credentials queda prohibido en producción (error en arranque); en producción `origin` lista concreta y `credentials: true`.

## Revocación de tokens (Fase 11)

- `AdminUser.tokenVersion` (migración `20261009031026_fase11_config_backups_tokenversion`): el access JWT lleva el claim `tokenVersion` y `authenticate` exige que coincida con el contador del usuario → 401 `UNAUTHENTICATED` al instante.
- El contador se incrementa en la misma transacción del cambio de password (`administrators.service.ts`) y en la revocación global de sesiones (`POST /administrators/:id/revoke-sessions`); la revocación de una sesión individual (`DELETE /sessions/:id`) solo invalida el refresh y el access sigue vigente hasta expirar (comportamiento documentado en §7).
- Tokens firmados sin el claim (legacy) son rechazados por `verifyAccessToken`.
- Resuelve **D2**: los JWT de acceso ya no esperan a expirar para invalidarse.

## Migración Fase 11

- `TenantSettings` + `publicName`, `whatsapp`, `footer`, `showUnavailable` (default `false`), `offerOffline` (default `true`);
- `AdminUser.tokenVersion Int @default(0)`;
- tabla `Backup` (`id`, `tenantId?` con cascade, `type`, `scope`, `status`, `payload Json?`, timestamps, índices en `tenantId` y `createdAt`).
- Aplicada en Neon (main `br-misty-salad-b8xwlwmc`) y registrada localmente; puramente aditiva.

## Deuda documentada (aceptada)

- **D1 — `npm audit` (2026-10-09: 0 critical, 4 high, 1 moderate)**: `deepmerge-ts < 8` (high) y `mysql2` (high + moderate GHSA-rgwj-5xj2-c3m3) alcanzables solo vía árbol de dependencias del CLI `prisma` (`@prisma/client → prisma → @prisma/config → deepmerge-ts`); `mysql2` no es alcanzable en el runtime (usa `@prisma/adapter-pg`); `@prisma/client` sale como moderate por la ruta de prisma. **Nunca ejecutar `npm audit fix --force`**; revisar en el próximo bump de Prisma.
- **C1 (resuelto 2026-10-09)**: las migraciones `fase7_pricing` y `fase11_config_backups_tokenversion` tenían el DDL aplicado en Neon (vía `db push`/SQL manual) pero sin registrar en `_prisma_migrations` → `npx prisma migrate deploy` (CMD del `Dockerfile`) habría fallado en cada arranque. Reconciliado con `npx prisma migrate resolve --applied <migración>` para ambas; `migrate status` queda en "Database schema is up to date". Si vuelven a aplicar DDL manualmente, repetir `migrate resolve`.
- **L1**: el chequeo de "último SUPER_ADMIN" ocurre fuera de la transacción (ventana mínima; solo SUPER_ADMIN puede desactivar a otro SUPER_ADMIN). Incluye la carrera de doble `refresh` con el mismo token (dos sesiones válidas sin `REFRESH_REUSE_DETECTED`; mitigado por `tokenVersion`).
- **L2**: `JWT_REFRESH_SECRET` se declara en `envSchema` por cumplimiento del spec pero no se usa (el refresh token es opaco y se guarda hasheado con `JWT_ACCESS_SECRET`).
- **L3**: rate limiting en memoria (aceptable: una sola instancia Render); para múltiples instancias usar store externo. `POST /auth/refresh` no tiene rate limit propio (solo el global + el de login).
- **L5**: cast `as unknown as TaxonomyDb` en pruebas (fakeDb compatible con Prisma sin generar tipos).
- **M2**: `LOG_LEVEL` se lee en `logger.ts` pero no está declarada en `envSchema`/`.env.example`.
- **M3**: §7/`docs/Backend+Db.md` documentan `GET /games`, `/categories`, `/genres`, `/platforms` públicos que no existen; el único catálogo público real es `/api/v1/catalog`.
- **M4**: `memory-bank/techContext.md` dice `src/generated/` commiteado; en realidad está en `.gitignore` (un clon limpio necesita `npm run prisma:generate`).
- **M5**: README §16–§32/§39/§43/§47 describen un frontend que aún no existe en el repo (`frontend/` solo tiene `.gitkeep`).
- **H-4**: transacciones interactivas con timeout por defecto de 5 s (`import`/`restore` grandes) y `P2028` sin mapear en `errorHandler` → 500 genérico.
- **H-5/H-6/H-8**: chequeos de concurrencia sin lock (fingerprint del import, versiones del restore, validación de reglas de precio solapables) — sin corrupción FK, pero con ventanas de lost update.
- **H-7**: `P2002` se traduce a 409 genérico sin `meta.target` (el cliente no sabe qué campo colisionó).
- **H-9**: borrar taxonomía deja los puentes intactos; el admin (sin filtro `deletedAt`) y el catálogo público (con filtro) pueden divergir.
- **H-10**: `scanMedia` consulta Cloudinary antes que la BD; un upload en la ventana puede marcarse `ORPHAN` indebidamente.
- **H-11**: `publishFromLibrary` omite sin aviso taxonomía global borrada (no cae en `TAXONOMY_MAPPING_INCOMPLETE`).
- **H-12**: `applyPricing` devuelve una versión calculada fuera de la transacción (puede no ser la persistida).
- **H-13/H-14/H-16/H-17**: `IMPORT_STARTED` se audita fuera de la tx; `assertTaxonomyRefs` confunde duplicados con inexistentes; códigos Prisma (`P2028`, CHECK) caen a 500; no hay listado de borrados (papelera) para soft delete.
- **H-19**: `prisma/seed.ts` escribe sin transacción y sin bump de versión.
- **RBAC H-1**: juegos/media/pricing/taxonomy/import-export no usan `requireRoles` explícito (hoy correcto porque solo existen `ADMIN`/`SUPER_ADMIN`; defense-in-depth si se añade un rol).
- **RBAC H-2**: `restoreBackup` inserta el payload sin validar `tenantId` por fila (solo SUPER_ADMIN puede llegar; validar con zod antes del `createMany`).
- **RBAC H-3**: `GET /admin/system` (versión de Node/uptime) accesible a cualquier ADMIN; `GET /health` expone `ok|degraded`.
- **B4/B5/B6/B9/B10**: `DATABASE_URL` leída fuera del schema Zod; `refresh` sin rate limit propio; `allowScripts` inerte (no hay `@lavamoat/allow-scripts`); `requestLogger` loguea la query completa de `originalUrl`; sin handler de `unhandledRejection`/`uncaughtException`.
- **B1/B2/B3/B7/B8**: doc de errores sin 429/413 matizado; mensajes 4xx crudos de librerías; `helmet` con defaults; `.gitignore` sin `.next/`/`*.tsbuildinfo`.
- **Tests — fakeDb no acredita atomicidad**: `$transaction` en `tests/helpers/fakeDb.ts` es `Promise.all`/`fn()` sin rollback, sin aislamiento ni restricciones únicas/CHECK; los tests prueban la lógica de aplicación, no la integridad concurrente en producción (esta última se verifica con `migrate status` + smokes reales contra Neon).

---

# 16. Frontend

Ruta conceptual:

```text
/frontend
```

Tecnología:

- Next.js;
- React;
- TypeScript;
- App Router.

Branding:

**JAVIER**

Nunca mostrar:

`Javier PC`

Concepto visual:

> Gaming oscuro, limpio y rápido.

---

# 17. Rutas públicas

```text
/
/feed
/juegos
/juegos/[slug]
/categorias/[slug]
/generos/[slug]
/plataformas/[slug]
/favoritos
/mi-lista
/mi-coleccion
/contacto
```

---

# 18. Navegación

Sidebar:

```text
Inicio
Juegos
Mi colección
Mi lista
Contacto
```

Header:

```text
JAVIER
Buscar juegos...
```

En móvil:
- drawer;
- header compacto;
- touch targets grandes.

---

# 19. Catálogo

El catálogo debe permitir:

- búsqueda;
- filtros;
- ordenamiento;
- navegación rápida.

Búsqueda:

- nombre;
- género;
- categoría;
- plataforma.

Cuando el catálogo está cacheado, preferir búsqueda local.

---

# 20. Cache

La estrategia pública es:

```text
Cache local
     ↓
catalog/version
     ↓
¿Cambió?
 ├── No → usar cache
 └── Sí → actualizar
```

Modelo:

```json
{
  "schemaVersion": 1,
  "catalogVersion": 42,
  "updatedAt": "...",
  "cachedAt": "...",
  "expiresAt": "...",
  "data": {
    "games": []
  }
}
```

Esto reduce solicitudes y mejora la experiencia con conexiones inestables.

---

# 21. Offline

Cuando exista cache:

- mostrar catálogo;
- buscar localmente;
- favoritos;
- Mi Lista;
- Mi Colección.

Mostrar aviso:

```text
Sin conexión
Mostrando el último catálogo disponible.
```

Cuando vuelva la conexión:
- verificar versión;
- sincronizar.

---

# 22. Favoritos

Favoritos y Mi Lista son diferentes.

Favoritos:
- marcador personal;
- no representa pedido.

LocalStorage:

```text
javierpc:favorites
```

Ruta:

```text
/favoritos
```

---

# 23. Mi Lista

Representa pedido/solicitud.

LocalStorage:

```text
javierpc:list
```

Soporta:
- varios juegos;
- cantidad;
- precio;
- tamaño;
- total.

Acción:

```text
Pedir por mensaje
```

No utilizar:

```text
Pedir solo este
```

---

# 24. Mi Colección

Biblioteca personal.

Estados:

```text
Todos
Favoritos
Pendiente
Jugado
Ganado
```

Persistencia local:

```text
javierpc:collection
```

---

# 25. Floating Mi Lista

Debe ser:

- circular;
- SVG;
- dorado;
- icono oscuro;
- draggable;
- persistente;
- badge de cantidad.

Aproximadamente:

Desktop:
`66 × 66`

Mobile:
`56 × 56`

Ocultar cuando Mi Lista esté vacía.

---

# 26. Detalle de juego

Mostrar:

- portada;
- screenshots;
- título;
- descripción;
- precio;
- disponibilidad;
- plataformas;
- categoría;
- género;
- tamaño;
- año;
- requisitos.

Acciones:

```text
+ Añadir a mi lista
Favorito
```

Menú de tres puntos únicamente aquí.

---

# 27. Menú de detalle

Acciones:

```text
Favorito
Pendiente
Jugado
Ganado
Quitar estado
```

No colocar este menú en las cards del catálogo.

---

# 28. SEO

Implementar:

- metadata dinámica;
- Open Graph;
- canonical;
- sitemap;
- robots.

No indexar:

```text
/admin
/admin/*
```

Indexar catálogo público.

---

# 29. Performance

Objetivos:

- primer render rápido;
- pocas peticiones;
- imágenes optimizadas;
- lazy loading;
- cache;
- Server Components;
- JavaScript reducido.

No descargar todas las imágenes automáticamente.

Cloudinary debe proporcionar thumbnails apropiados.

---

# 30. Admin

Ruta:

```text
/admin
```

Debe consumir el backend real.

Secciones:

```text
Dashboard
Juegos
Biblioteca base
Categorías
Géneros
Plataformas
Multimedia
Administradores
Auditoría
Sesiones
Negocios
Configuración
```

`Negocios` únicamente para SUPER_ADMIN.

---

# 31. Admin mobile

En móvil:

- sidebar → drawer;
- tablas → cards;
- filtros → bottom sheet;
- formularios → una columna;
- dashboard → métricas apiladas;
- touch targets grandes;
- sin overflow horizontal.

---

# 32. Configuración Admin

Debe incluir:

```text
Catálogo
Precios
Datos / importación
Multimedia
Base de datos / sistema
```

Funciones:
- versionado;
- reglas de precio;
- preview/apply;
- export;
- import;
- backup;
- restore;
- media status;
- system status.

Implementado (backend, Fase 11+12): los ajustes de catálogo (`publicName`, `whatsapp`, `footer`, `showUnavailable`, `offerOffline`) viven en `GET|PATCH /api/v1/admin/config` (ver §7); `backup`/`restore` en `/api/v1/admin/backups` (ver §7 y §56); `export`/`import` en `/api/v1/admin/export|import` y `duplicate` en `POST /api/v1/admin/games/:id/duplicate` (ver §7).

---

# 33. Importación

Flujo:

```text
Archivo
 ↓
Validación
 ↓
Comparación
 ↓
Preview
 ↓
Backup
 ↓
Confirmación
 ↓
Import
 ↓
Auditoría
 ↓
Nueva versión
```

No realizar importaciones destructivas silenciosas.

Implementado (backend, Fase 12): el flujo completo vive en `/api/v1/admin/import` (`validate` → `preview` → `backup` (`PRE_IMPORT`) → `run` con `confirm: "IMPORTAR"`, `backupId` y `fingerprint`), con el export de origen en `/api/v1/admin/export` (ver §7). Ningún paso es destructivo sin confirmación explícita y copia previa; `run` es all-or-nothing en una transacción.

---

# 34. Auditoría

Registrar acciones administrativas importantes.

Ejemplos:

```text
GAME_CREATED
GAME_UPDATED
GAME_DELETED
GAME_RESTORED
PRICE_RULE_CREATED
PRICE_RULE_UPDATED
PRICES_APPLIED
MEDIA_UPLOADED
MEDIA_DELETED
ADMIN_CREATED
ADMIN_DISABLED
TENANT_CREATED
IMPORT_COMPLETED
BACKUP_CREATED
RESTORE_COMPLETED
SESSION_REVOKED
```

---

# 35. API y frontend

Contrato:

```text
Next.js
   ↓
API Client
   ↓
/api/v1
   ↓
Express
   ↓
Prisma
   ↓
Neon
```

Nunca:

```text
Next.js → PostgreSQL
```

Nunca:

```text
Next.js → Prisma
```

---

# 36. Desarrollo local

## Requisitos

Instalar:

- Node.js;
- Git;
- GitHub CLI;
- OpenCode.

Comprobar:

```bash
node --version
npm --version
git --version
gh --version
```

---

# 37. Clonar repositorio

```bash
git clone <REPOSITORY_URL>
cd <PROJECT_DIRECTORY>
```

Configurar ramas según la estrategia del proyecto.

---

# 38. Variables de entorno Backend

Crear:

```text
backend/.env
```

A partir de:

```text
backend/.env.example
```

Variables esperadas (23; fuente de verdad: `backend/.env.example` ↔ `src/config/env.ts`):

```env
NODE_ENV=development
PORT=3000

DATABASE_URL=
DIRECT_DATABASE_URL=

JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=30d

COOKIE_DOMAIN=
COOKIE_SECURE=false
COOKIE_SAME_SITE=lax

CORS_ORIGIN=http://localhost:3001

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_FOLDER=game-catalog

RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
LOGIN_RATE_LIMIT_MAX=10

SEED_ADMIN_USERNAME=
SEED_ADMIN_PASSWORD=
SEED_JAVIER_ADMIN_USERNAME=javier-admin
SEED_JAVIER_ADMIN_PASSWORD=
```

`LOG_LEVEL` es opcional (no validada por el schema; por defecto `info`).

Checklist de despliegue (producción):

- `NODE_ENV=production` **obligatorio**: el schema lo tiene en `development` por defecto y solo con `production` se fuerza `COOKIE_SECURE=true`, se prohíbe `CORS_ORIGIN=*` y se activa `trust proxy` (rate limit tras el proxy). El `Dockerfile` ya lo fija; en Render/otro host **declararlo explícitamente**.
- `DATABASE_URL` y `DIRECT_DATABASE_URL` apuntando a la BD de producción.
- `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` con ≥32 caracteres y valores distintos a los de desarrollo.
- `CORS_ORIGIN` con el origen exacto del frontend (nunca `*` en producción).
- `COOKIE_SECURE=true` (si no va en el Dockerfile) y `COOKIE_DOMAIN` si aplica.

Nunca subir `.env`.

---

# 39. Variables Frontend

Crear:

```text
frontend/.env.local
```

Ejemplo:

```env
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=
```

No colocar secrets aquí.

---

# 40. Instalar Backend

```bash
cd backend
npm install
```

Generar Prisma:

```bash
npm run prisma:generate
```

Ejecutar migrations:

```bash
npm run prisma:migrate
```

Seed:

```bash
npm run prisma:seed
```

Desarrollo:

```bash
npm run dev
```

---

# 41. Instalar Frontend

En otra terminal:

```bash
cd frontend
npm install
npm run dev
```

Abrir el dominio local indicado por Next.js.

---

# 42. Scripts Backend esperados

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
npm run test
npm run test:watch
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

---

# 43. Scripts Frontend esperados

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
npm run test
```

Los nombres pueden ajustarse si el proyecto ya tiene convenciones diferentes.

---

# 44. Prisma

Para cambios de schema:

```bash
npx prisma migrate dev --name <descripcion>
```

Generar cliente:

```bash
npx prisma generate
```

No editar producción de forma destructiva sin migration controlada.

---

# 45. Health check

Backend:

```text
GET /api/v1/health
```

Debe comprobar al menos que la API funciona y, según implementación, el estado de DB.

---

# 46. API documentation

OpenAPI/Swagger debe documentar:

- auth;
- games;
- catalog;
- library;
- categories;
- genres;
- platforms;
- media;
- pricing;
- admins;
- tenants;
- audit;
- import/export;
- system.

---

# 47. Tests

Antes de considerar una versión estable:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Backend y frontend deben pasar sus respectivos checks.

---

# 48. Git workflow

Ejemplo:

```bash
git status
git add .
git commit -m "feat: ..."
git push
```

Para crear repositorio:

```bash
gh auth login
gh auth status
```

Y si corresponde:

```bash
gh repo create <repo-name> --private --source=. --remote=origin --push
```

---

# 49. GitHub Actions

CI debe comprobar:

```text
install
 ↓
lint
 ↓
typecheck
 ↓
test
 ↓
build
```

No almacenar secrets directamente en YAML.

Utilizar GitHub Secrets.

---

# 50. Render

Backend preparado para Render.

El servidor debe utilizar:

```text
process.env.PORT
```

No asumir un puerto fijo en producción.

Configurar:

- build command;
- start command;
- environment variables;
- health check;
- migrations controladas.

---

# 51. Neon

La DB de producción utiliza Neon.

Mantener separadas:

- desarrollo;
- testing;
- producción.

Nunca ejecutar pruebas destructivas contra producción.

---

# 52. Cloudinary

Variables:

```text
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
```

El secret solamente existe en backend.

Frontend utiliza URLs públicas/transformadas.

---

# 53. Cloudflare

Puede utilizarse como:

- DNS;
- CDN/edge cuando corresponda;
- protección;
- caching.

No convertir Cloudflare en dependencia obligatoria del código de negocio.

---

# 54. Seguridad de tenant

Regla crítica:

```text
JWT
 ↓
AdminUser
 ↓
role + tenantId
 ↓
authorization
 ↓
service
 ↓
tenant-scoped query
```

Nunca:

```text
frontend tenantId
 ↓
DB
```

---

# 55. Regla de precios

El frontend nunca es la autoridad del precio.

```text
Frontend
 ↓
API
 ↓
PricingService
 ↓
PricingRule
 ↓
PostgreSQL
```

---

# 56. Backups

Los backups deben estar controlados.

No exponer:

- SQL console;
- credenciales;
- secretos;
- dumps privados al usuario público.

Exportar catálogo no equivale necesariamente a un dump completo de PostgreSQL.

Implementado (backend, Fase 11): copias controladas en la tabla `Backup` con payload JSON (sin credenciales, sesiones ni auditoría) vía `GET|POST /api/v1/admin/backups` y `POST /api/v1/admin/backups/:id/restore` (`SUPER_ADMIN` + confirm `RESTAURAR`); ver §7 para el contrato completo.

---

# 57. Producción

Antes de deploy:

- [ ] variables de entorno configuradas;
- [ ] secrets fuera del repositorio;
- [ ] DB correcta;
- [ ] migrations revisadas;
- [ ] Cloudinary correcto;
- [ ] CORS correcto;
- [ ] JWT secrets únicos;
- [ ] rate limiting activo;
- [ ] health check;
- [ ] logs;
- [ ] tests;
- [ ] build.

---

# 58. Flujo completo de desarrollo

```text
1. Cambiar especificación
        ↓
2. Revisar Backend+Db.md / Frontend.md
        ↓
3. Implementar backend si hace falta
        ↓
4. Migration Prisma
        ↓
5. Tests backend
        ↓
6. Implementar frontend
        ↓
7. Tests frontend
        ↓
8. Typecheck
        ↓
9. Build
        ↓
10. Revisión manual
        ↓
11. Git commit
        ↓
12. Push
        ↓
13. CI
        ↓
14. Deploy
```

---

# 59. Orden recomendado para construir la plataforma

## Fase 1 — Backend base

- Express;
- TypeScript;
- Prisma;
- Neon;
- configuración;
- health;
- estructura modular.

## Fase 2 — Seguridad

- Tenant;
- AdminUser;
- JWT;
- sessions;
- RBAC;
- tenant isolation.

## Fase 3 — Catálogo

- BaseGame;
- TenantGame;
- games;
- categories;
- genres;
- platforms;
- requirements.

## Fase 4 — Media

- Cloudinary;
- cover;
- screenshots;
- manifest;
- retry;
- orphan media.

## Fase 5 — Pricing

- PricingRule;
- PricingService;
- preview;
- apply;
- audit.

## Fase 6 — Catalog API

- catalog;
- catalog version;
- caching;
- optimized responses.

## Fase 7 — Admin API

- dashboard;
- admins;
- tenants;
- sessions;
- audit;
- system.

## Fase 8 — Data management

- import;
- export;
- backup;
- restore;
- history;
- duplicate.

## Fase 9 — Frontend

- Next.js;
- layout;
- catalog;
- detail;
- favorites;
- Mi Lista;
- Mi Colección;
- offline/cache;
- SEO.

## Fase 10 — Admin frontend

- login;
- dashboard;
- games;
- library;
- pricing;
- media;
- administrators;
- audit;
- sessions;
- configuration.

## Fase 11 — Production

- tests;
- Docker;
- Render;
- GitHub Actions;
- Cloudflare;
- monitoring básico.

---

# 60. Checklist final

## Backend

- [ ] Express
- [ ] TypeScript
- [ ] Prisma
- [ ] Neon
- [ ] Multi-tenant
- [ ] SUPER_ADMIN
- [ ] ADMIN
- [ ] JWT
- [ ] Sessions
- [ ] Games
- [ ] Base library
- [ ] Categories
- [ ] Genres
- [ ] Platforms
- [ ] Requirements
- [ ] Cloudinary
- [ ] Pricing
- [ ] Catalog version
- [ ] Audit
- [ ] Import/export
- [ ] Backup/restore
- [ ] Tests
- [ ] OpenAPI
- [ ] Docker
- [ ] Render

## Frontend

- [ ] Next.js
- [ ] React
- [ ] TypeScript
- [ ] App Router
- [ ] Javier branding
- [ ] Catalog
- [ ] Search
- [ ] Filters
- [ ] Game detail
- [ ] Favorites
- [ ] Mi Lista
- [ ] Mi Colección
- [ ] Floating list
- [ ] Offline
- [ ] Cache
- [ ] Cloudinary
- [ ] Responsive
- [ ] SEO
- [ ] Admin
- [ ] Auth
- [ ] Tests
- [ ] Build

## Production

- [ ] GitHub
- [ ] GitHub Actions
- [ ] Render
- [ ] Neon
- [ ] Cloudinary
- [ ] Cloudflare
- [ ] Secrets
- [ ] Backups
- [ ] Health checks
- [ ] Logs
- [ ] Security review
- [ ] Tenant isolation review

---

# 61. Regla absoluta

**No inventar funcionalidades implementadas.**

Antes de afirmar que una parte funciona:

1. comprobar código;
2. ejecutar test cuando corresponda;
3. ejecutar typecheck;
4. ejecutar build;
5. verificar integración.

El README debe mantenerse actualizado conforme el proyecto evolucione.

---

## Autoría

Plataforma desarrollada y diseñada por:

**Luismi**

Primer tenant:

**Javier**

Arquitectura:

**Multi-tenant SaaS**
