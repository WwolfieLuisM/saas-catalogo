# Backend + Database — Catálogo de Juegos (V1 + V2 unificado)

> **Documento unificado.** Combina la especificación técnica detallada (V1) y el alcance multi-tenant V2.
> Regla de precedencia en caso de conflicto: **prevalece V2** — modelo multi-tenant (`Tenant`, `BaseGame`, `TenantGame`), prefijo `/api/v1` en todas las rutas, formato de paginación `meta`, rutas de media `tenants/{tenantId}/games/{slug}/...`, versión de catálogo por tenant, precios calculados por el backend (`PricingService`) y aislamiento de tenants.
> Las secciones 81–93 contienen el alcance y las reglas críticas exclusivas de V2.

## 0. INSTRUCCIÓN PRINCIPAL PARA EL AGENTE

Construye el **backend completo y la infraestructura de base de datos** para una **plataforma SaaS multi-tenant** de catálogo de videojuegos, con primer cliente/tenant en Cuba.

Este documento es la especificación técnica principal del backend.

**Plataforma:**

- Luismi es el propietario de la plataforma (`SUPER_ADMIN`).
- Javier es el primer tenant/cliente (`ADMIN`).
- La plataforma debe incorporar futuros tenants sin duplicar código.
- No hardcodees Javier, `tenantId`, precios, categorías, géneros, plataformas, credenciales ni carpetas de Cloudinary. Los datos demo pertenecen al seed/configuración.

**IMPORTANTE:**

- NO desarrollar todavía el frontend.
- NO desarrollar todavía Next.js.
- NO desarrollar todavía React Native.
- El backend debe ser completamente independiente del cliente.
- El backend debe poder ser consumido posteriormente por:
  - Next.js Web
  - React Native
  - cualquier otro cliente HTTP autorizado.
- Priorizar arquitectura limpia, mantenible, segura y preparada para crecimiento.
- Mantener el proyecto compatible con los planes gratuitos de los servicios seleccionados siempre que sea técnicamente posible.
- No utilizar servicios de pago obligatorio.
- No almacenar secretos en Git.
- No inventar APIs de proveedores: consultar documentación oficial/MCP cuando sea necesario.
- Antes de implementar una integración externa, verificar su API/documentación actual.
- Si existe una decisión arquitectónica mejor que la especificada aquí, documentarla antes de cambiarla.

---

# 1. OBJETIVO DEL PROYECTO

Crear una API REST multi-tenant para una plataforma SaaS de catálogo de videojuegos.

Los usuarios públicos podrán consultar los juegos disponibles del catálogo del tenant correspondiente.

Los administradores podrán administrar completamente, siempre dentro de su tenant (o globalmente si son `SUPER_ADMIN`):

- juegos
- categorías
- géneros
- plataformas
- imágenes
- administradores
- disponibilidad
- precios
- información general del catálogo.

El sistema debe soportar:

- SaaS multi-tenant con aislamiento impuesto por el backend
- autenticación administrativa
- autorización (RBAC: `SUPER_ADMIN` / `ADMIN`)
- JWT
- refresh tokens
- CRUD completo
- soft delete
- auditoría
- biblioteca base compartida (`BaseGame`) y juegos personalizados (`TenantGame`)
- Cloudinary
- PostgreSQL en Neon
- Prisma ORM
- sincronización/versionado del catálogo por tenant
- API preparada para aplicaciones web y móviles
- despliegue en Render
- CI/CD con GitHub Actions.

---

# 2. STACK OBLIGATORIO

## Backend

- Node.js
- TypeScript
- Express.js
- Prisma ORM
- PostgreSQL
- Zod
- JWT
- Argon2id o bcrypt, preferentemente Argon2id
- Helmet
- CORS
- rate limiting
- logging estructurado
- testing automatizado.

## Base de datos

PostgreSQL alojado en:

Neon

ORM:

Prisma

## Imágenes

Cloudinary.

Cloudinary almacenará:

- portada
- hasta 4 capturas por juego.

El backend será responsable de autorizar y controlar las operaciones.

Nunca exponer:

- Cloudinary API Secret
- Neon API Key
- JWT signing secret
- refresh token secret
- cualquier otra credencial privada.

---

# 3. ARQUITECTURA GENERAL

```text
                    ┌──────────────────────┐
                    │    Next.js Web       │
                    │      FUTURO          │
                    └──────────┬───────────┘
                               │
                               │ HTTPS / REST
                               ▼
                    ┌──────────────────────┐
                    │     Express API      │
                    │                      │
                    │ Auth                 │
                    │ Games                │
                    │ Categories           │
                    │ Genres               │
                    │ Platforms            │
                    │ Admins               │
                    │ Catalog Sync         │
                    │ Media                │
                    │ Audit                │
                    └───────┬───────┬──────┘
                            │       │
                     Prisma │       │ Cloudinary SDK/API
                            │       │
                            ▼       ▼
                    ┌──────────┐  ┌────────────┐
                    │  Neon    │  │ Cloudinary │
                    │PostgreSQL│  │   Media    │
                    └──────────┘  └────────────┘
```

Posteriormente:

```text
Next.js ───────┐
               │
React Native ──┼──> Express API
               │
Otros clientes ┘
```

El backend NO debe depender de componentes de Next.js.

---

# 4. ESTRUCTURA DEL PROYECTO

Utilizar una estructura modular:

```text
backend/
├── src/
│   ├── config/
│   │   ├── env.ts
│   │   ├── database.ts
│   │   └── cloudinary.ts
│   │
│   ├── middleware/
│   ├── modules/
│   │   ├── auth/
│   │   ├── tenants/
│   │   ├── admins/
│   │   ├── games/
│   │   ├── library/
│   │   ├── categories/
│   │   ├── genres/
│   │   ├── platforms/
│   │   ├── media/
│   │   ├── pricing/
│   │   ├── catalog/
│   │   ├── dashboard/
│   │   ├── audit/
│   │   ├── backups/
│   │   └── system/
│   ├── services/
│   ├── controllers/
│   ├── repositories/
│   ├── routes/
│   ├── schemas/
│   ├── utils/
│   ├── lib/
│   ├── app.ts
│   └── server.ts
│
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
│
├── tests/
│   ├── unit/
│   └── integration/
│
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── README.md
└── Dockerfile
```

Separar routes, controllers, services, schemas/DTOs y repositories cuando aporten valor. No meter lógica de negocio compleja en controllers.

La estructura puede modificarse ligeramente si existe una razón técnica clara.

---

# 5. MODELO DE DATOS

Modelos principales (los auxiliares adicionales se permiten si son necesarios):

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

## 5.1 Tenant

```text
id
name
slug
isActive
createdAt
updatedAt
```

Un tenant representa un negocio/cliente (ej. Javier). `SUPER_ADMIN` puede crear, editar, activar/desactivar y consultar tenants. Los datos demo no se hardcodean: pertenecen al seed.

## 5.2 TenantSettings

Configuración por tenant (branding, opciones operativas, etc.). Aislada por `tenantId`.

## 5.3 AdminUser

Campos:

```text
id
username
passwordHash
role
tenantId
isActive
createdAt
updatedAt
lastLoginAt
```

Requisitos:

- `id`: UUID.
- `username`: único.
- `passwordHash`: nunca almacenar password en texto plano.
- `role`: enum.
- `tenantId`: `null` para `SUPER_ADMIN` (contexto global); obligatorio para `ADMIN`.
- `isActive`: permite desactivar una cuenta sin eliminarla.
- `lastLoginAt`: actualizar después de login exitoso.

Roles:

```text
SUPER_ADMIN
ADMIN
```

`SUPER_ADMIN`: propietario de la plataforma; administra tenants, biblioteca base, administradores y operaciones críticas.

`ADMIN`: administra únicamente su tenant.

Debe soportar al menos 3 administradores.

No establecer artificialmente un límite de administradores.

## 5.4 AdminSession

```text
id
adminId
tokenHash
expiresAt
revokedAt
createdAt
lastUsedAt
userAgent
ipAddress
```

## 5.5 BaseGame

Juego de la biblioteca base de la plataforma (propiedad de Luismi, +1000 juegos). No pertenece a un tenant.

```text
id
title
slug
description
sizeValue
sizeUnit
releaseYear
categoryId
genreIds / relación
platformIds / relación
minimumRequirements
recommendedRequirements
createdAt
updatedAt
deletedAt
```

`SUPER_ADMIN` administra los activos globales de la biblioteca; `ADMIN` no puede modificar libremente la biblioteca global.

## 5.6 TenantGame

Publicación de un juego dentro de un tenant. Es el modelo principal del catálogo.

```text
id
tenantId
baseGameId          (nullable)
origin              BIBLIOTECA | PERSONALIZADO
title
slug
description
priceMode           (RULE | MANUAL, ver sección 84)
price               (solo MANUAL; Decimal)
availability        (boolean)
sizeValue
sizeUnit
releaseYear
categoryId
genreIds / relación
platformIds / relación
minimumRequirements
recommendedRequirements
createdBy
updatedBy
deletedBy
createdAt
updatedAt
deletedAt
```

- Origen biblioteca: `origin = BIBLIOTECA` y relación con `BaseGame`.
- Origen personalizado: `origin = PERSONALIZADO` y `baseGameId = null`.
- Slug único en el contexto del tenant.

## 5.7 Categorías, géneros y plataformas

`Category`, `Genre` y `Platform` son **tenant-aware** (pertenecen al tenant; ver sección 81). Relaciones N:N con el juego mediante tablas puente (`GamePlatform`, etc.) con claves únicas compuestas.

> **Decisión de diseño a confirmar antes de modelar:** cómo se relaciona la taxonomía de la biblioteca base (`BaseGame`, taxonomía de plataforma) con la taxonomía propia del tenant al incorporar un juego. Opción recomendada: taxonomía base global (`tenantId = null`) usada por `BaseGame` + taxonomía propia por tenant, con mapeo al incorporar a `TenantGame`.

## 5.8 GameMedia

Referencias y metadatos de imágenes (los binarios viven en Cloudinary):

```text
id
tenantId
gameId               (TenantGame)
kind                 COVER | SHOT
url
publicId
sortOrder
status               OK | PENDING | ERROR | ORPHAN
createdAt
createdBy
```

Límites: 1 cover y hasta 4 screenshots por juego.

## 5.9 PricingRule

```text
id
tenantId
minSize
maxSize              (nullable)
price
active
createdAt
updatedAt
```

Los precios son propiedad del tenant. El backend es la autoridad del precio (sección 84).

## 5.10 CatalogMetadata

Versión del catálogo **por tenant**:

```text
id
tenantId
version
updatedAt
```

## 5.11 AuditLog

```text
id
actorId
actorRole
tenantId
action
entity
entityId
metadata
ipAddress
userAgent
timestamp
```

---

# 6. AUTENTICACIÓN

Implementar:

```text
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
GET  /api/v1/auth/me
```

El JWT/access token debe incorporar `role` y, si aplica, `tenantId`. El contexto de tenant siempre deriva de la sesión autenticada (ver sección 91).

Nunca devolver:

- password
- passwordHash
- refresh token en JSON si se utiliza cookie segura.

---

# 7. JWT

Implementar:

## Access Token

Vida corta.

Ejemplo recomendado:

```text
15 minutos
```

## Refresh Token

Vida más larga.

Ejemplo:

```text
30 días
```

Debe existir rotación de refresh tokens.

No crear JWT eternos.

No guardar access tokens administrativos en localStorage.

Preferir:

- access token en memoria
- refresh token en cookie HttpOnly + Secure + SameSite apropiado.

La arquitectura debe permitir que posteriormente el cliente móvil use una estrategia compatible sin cambiar la lógica del servidor.

---

# 8. REFRESH TOKEN SECURITY

Crear una tabla de sesiones/refresh tokens.

Ejemplo:

```text
AdminSession
├── id
├── adminId
├── tokenHash
├── expiresAt
├── revokedAt
├── createdAt
├── lastUsedAt
├── userAgent
└── ipAddress
```

Nunca almacenar el refresh token crudo.

Guardar solamente un hash.

Implementar:

- rotación
- revocación
- expiración
- detección de reuse
- logout
- invalidación de sesiones.

Si se detecta reuse de un refresh token rotado:

```text
revocar la familia/sesiones correspondientes
```

---

# 9. PASSWORDS

Usar:

```text
Argon2id
```

si es viable en el entorno de Render.

Alternativa:

```text
bcrypt
```

Nunca:

```text
MD5
SHA1
SHA256 directo
texto plano
```

Implementar política mínima:

- longitud mínima razonable
- nunca almacenar contraseña original
- evitar mensajes de login que permitan enumerar usuarios.

---

# 10. TENANTGAME (JUEGOS)

El modelo principal del catálogo será `TenantGame` (sección 5.6):

```text
TenantGame
├── id
├── tenantId
├── baseGameId
├── origin
├── title
├── slug
├── description
├── priceMode
├── price
├── availability
├── sizeValue
├── sizeUnit
├── releaseYear
├── categoryId
├── createdBy
├── updatedBy
├── deletedBy
├── createdAt
├── updatedAt
└── deletedAt
```

Soft delete obligatorio (sección 22).

## Precio

- Moneda exclusiva: `CUP` (pesos cubanos). Ejemplo: `2500 CUP`.
- El backend es la **autoridad del precio**: el cálculo sale de `PricingRule` mediante `PricingService` (sección 84). El frontend nunca es fuente de verdad.
- `priceMode = RULE` (por defecto): el precio se calcula por tamaño según las reglas activas del tenant.
- `priceMode = MANUAL`: permite fijar un precio puntual en el campo `price` (soporte requerido por Admin V2; ver sección 90).
- Tipo numérico apropiado para evitar errores de floating point: `Decimal` en PostgreSQL/Prisma.
- No almacenar `"$2500"` ni `"2500 CUP"` en la columna numérica.

Editar una regla de precio **NO** cambia silenciosamente los juegos: requiere la acción explícita **Aplicar nuevas reglas al catálogo** (sección 84).

---

# 11. DISPONIBILIDAD

Campo booleano:

```text
availability = true | false
```

Regla:

Un juego con `availability = false`:

- no aparece en catálogo público.
- continúa almacenado.
- continúa disponible para administración.
- puede volver a estar disponible.

NO eliminar el juego simplemente porque no está disponible.

---

# 12. SIZE

El tamaño debe ser flexible.

Ejemplo:

```text
85.4 GB
```

Modelo:

```text
sizeValue = 85.4
sizeUnit = GB
```

Permitir:

```text
MB
GB
TB
```

Validar valores positivos.

La respuesta pública puede incluir:

```json
{
  "size": {
    "value": 85.4,
    "unit": "GB",
    "formatted": "85.4 GB"
  }
}
```

---

# 13. RELEASE YEAR

Campo:

```text
releaseYear
```

Debe aceptar años válidos.

No aceptar años absurdos.

La validación debe estar preparada para juegos nuevos sin imponer un año máximo demasiado rígido.

---

# 14. CATEGORIES

Entidad **tenant-aware** (cada tenant tiene sus propias categorías; ver sección 81):

```text
Category
├── id
├── tenantId
├── name
├── slug
├── description
├── createdAt
├── updatedAt
├── deletedAt
├── createdBy
├── updatedBy
└── deletedBy
```

Los administradores pueden hacer CRUD dentro de su tenant.

No hardcodees categorías: pertenecen al seed/configuración.

No permitir eliminar una categoría utilizada por juegos sin resolver primero la relación.

Preferir:

- soft delete
- o impedir eliminación si tiene relaciones activas.

---

# 15. GENRES

Entidad independiente y **tenant-aware** (`tenantId`).

Un juego puede tener múltiples géneros.

Relación:

```text
TenantGame N:N Genre
```

CRUD completo para administradores, dentro de su tenant. No hardcodees géneros.

---

# 16. PLATFORMS

Entidad independiente y **tenant-aware** (`tenantId`).

Un juego puede tener múltiples plataformas (ej. PC + PS4 + PS5).

Relación:

```text
TenantGame N:N Platform
```

Ejemplos iniciales (solo seed, no hardcodear en el código):

```text
PC
PS4
PS5
Xbox One
Xbox Series X|S
Nintendo Switch
```

No limitar el sistema a esas plataformas ni hardcodear Xbox ni plataformas futuras.

El admin podrá crear nuevas plataformas.

---

# 17. RELACIONES

Diseñar Prisma con relaciones normalizadas.

Para TenantGame ↔ Genre:

```text
TenantGameGenre
├── tenantGameId
└── genreId
```

Para TenantGame ↔ Platform:

```text
GamePlatform
├── tenantGameId
└── platformId
```

Usar claves únicas compuestas donde corresponda.

Todas las entidades operativas llevan `tenantId` y las consultas deben quedar scoped por tenant (sección 91).

---

# 18. IMÁGENES

Cada juego tendrá:

## Portada

Una única portada.

## Capturas

Máximo:

```text
4
```

Usar la entidad `GameMedia` (sección 5.8):

```text
GameMedia
├── id
├── tenantId
├── gameId
├── kind          COVER | SHOT
├── url
├── publicId
├── sortOrder
├── status        OK | PENDING | ERROR | ORPHAN
├── createdAt
└── createdBy
```

Restricción:

```text
1 <= screenshots <= 4
```

`sortOrder`:

```text
0
1
2
3
```

## Manifest, retry y huérfanos

- Manifest multimedia por juego para verificar estado de sincronización.
- Estados de error y retry cuando falle la subida.
- Detección de media huérfana (registro DB sin asset o asset sin registro).
- Gestionar consistencia DB/Cloudinary con acciones compensatorias (sección 67).

---

# 19. CLOUDINARY

Usar Cloudinary para almacenamiento de imágenes.

Estructura lógica obligatoria (aislamiento por tenant):

```text
tenants/{tenantId}/games/{slug}/cover
tenants/{tenantId}/games/{slug}/shot-1
tenants/{tenantId}/games/{slug}/shot-2
tenants/{tenantId}/games/{slug}/shot-3
tenants/{tenantId}/games/{slug}/shot-4
```

Soporta: upload, reemplazo, eliminación, manifest, retry, errores y detección de media huérfana.

El backend debe conservar:

```text
url
publicId
```

Esto permite eliminar/reemplazar correctamente los assets.

El `api_secret` de Cloudinary:

- solo backend
- nunca frontend
- nunca Git
- nunca respuesta API.

La DB guarda referencias y metadatos; nunca binarios en PostgreSQL.

---

# 20. MEDIA API

Implementar (bajo `/api/v1/admin/*`, con tenant scope):

```text
POST   /api/v1/admin/games/:gameId/cover
DELETE /api/v1/admin/games/:gameId/cover

POST   /api/v1/admin/games/:gameId/screenshots
DELETE /api/v1/admin/games/:gameId/screenshots/:screenshotId
PATCH  /api/v1/admin/games/:gameId/screenshots/reorder
```

Validar:

- MIME type
- extensión
- tamaño
- cantidad
- ownership
- tenant scope
- autenticación
- autorización.

No permitir que una petición cree una quinta captura.

---

# 21. AUDITORÍA

Todo juego registra `createdBy`, `updatedBy`, `deletedBy` y `createdAt`, `updatedAt`, `deletedAt`, relacionados con `AdminUser`.

Además, toda acción administrativa relevante genera un registro en `AuditLog` (sección 5.11) con: actor, rol, tenant, acción, entidad, `entityId`, timestamp y metadata; IP/user-agent cuando sea apropiado.

Acciones mínimas a registrar:

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
IMPORT_STARTED
IMPORT_COMPLETED
BACKUP_CREATED
RESTORE_COMPLETED
SESSION_REVOKED
```

---

# 22. SOFT DELETE

Los juegos NO deben eliminarse físicamente inmediatamente.

Implementar:

```text
deletedAt
deletedBy
```

Las consultas públicas deben excluir automáticamente los registros eliminados.

El panel administrativo podrá:

- listar eliminados
- restaurar
- eliminar permanentemente si se decide habilitar esta capacidad.

La eliminación permanente debe estar protegida y no ser el comportamiento normal.

---

# 23. CATALOG VERSION

`CatalogMetadata` guarda versión **por tenant** (sección 5.10):

```text
CatalogMetadata
├── id
├── tenantId
├── version
└── updatedAt
```

Cada modificación que afecte al catálogo público del tenant debe:

```text
incrementar version
actualizar updatedAt
```

Incrementar la versión cuando cambie: juegos, disponibilidad, precio, categoría/género/plataforma, restauración/eliminación y media relevante.

Debe hacerse dentro de una transacción cuando sea apropiado.

`GET /api/v1/catalog/version` permite al frontend saber si su cache está actualizada.

---

# 24. CATALOG SYNC

Endpoints:

```text
GET /api/v1/catalog
GET /api/v1/catalog/version
GET /api/v1/catalog/sync
```

`GET /api/v1/catalog` devuelve solamente datos públicos necesarios y optimizados del tenant correspondiente.

## Version

```json
{
  "version": 42,
  "updatedAt": "2026-10-05T20:00:00.000Z"
}
```

El catálogo público no debe devolver información administrativa.

---

# 25. SINCRONIZACIÓN DEL CLIENTE

El backend debe estar preparado para que el cliente implemente localStorage, pero el backend no debe depender de localStorage.

Flujo:

```text
OPEN APP
   │
   ▼
read local cache
   │
   ├── valid ───────► show catalog immediately
   │
   ▼
GET /catalog/version
   │
   ├── same version ─────► keep cache
   │
   └── different ────────► synchronize
```

---

# 26. ESTRUCTURA LOCALSTORAGE FUTURA

No implementar todavía el frontend.

Contrato sugerido:

```json
{
  "schemaVersion": 1,
  "catalogVersion": 42,
  "updatedAt": "2026-10-05T20:00:00.000Z",
  "cachedAt": "2026-10-05T20:05:00.000Z",
  "expiresAt": "2026-10-12T20:05:00.000Z",
  "data": {
    "games": []
  }
}
```

## Reglas

### schemaVersion

Permite migrar el formato local.

### catalogVersion

Determina si los datos están actualizados.

### cachedAt

Determina cuándo fueron guardados.

### expiresAt

Implementar TTL razonable.

El TTL NO significa que el catálogo deba desaparecer inmediatamente cuando expire.

Significa:

```text
cache stale
```

El cliente puede seguir mostrándolo mientras intenta sincronizar.

### Recuperación ante corrupción

Si `JSON.parse()` falla o la estructura no valida:

```text
delete corrupted cache
request fresh catalog
```

Nunca dejar que una cache corrupta rompa la aplicación.

---

# 27. API PÚBLICA

Diseñar endpoints versionados:

```text
/api/v1/...
```

Ejemplos:

```text
GET /api/v1/games
GET /api/v1/games/:id
GET /api/v1/catalog
GET /api/v1/catalog/version
GET /api/v1/categories
GET /api/v1/genres
GET /api/v1/platforms
GET /api/v1/health
```

---

# 28. BÚSQUEDA

`GET /api/v1/games`

Debe soportar:

```text
?q=
&category=
&genre=
&platform=
&availability=
&sort=
&page=
&limit=
```

La búsqueda debe ser case-insensitive.

Evitar SQL injection mediante Prisma y validación.

---

# 29. PAGINACIÓN

Implementar paginación.

Respuesta (formato `meta` — prevalece V2):

```json
{
  "success": true,
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 1024,
    "totalPages": 52
  }
}
```

Definir:

```text
default limit = 20
maximum limit = 100
```

---

# 30. ORDENAMIENTO

Permitir al menos:

```text
title ASC
title DESC
createdAt DESC
updatedAt DESC
price ASC
price DESC
releaseYear DESC
```

Nunca aceptar directamente un campo arbitrario desde query parameters sin whitelist.

---

# 31. ADMIN API

Proteger todas las rutas administrativas:

```text
/api/v1/admin/*
```

CRUD de juegos de ejemplo:

```text
POST   /api/v1/admin/games
GET    /api/v1/admin/games
GET    /api/v1/admin/games/:id
PATCH  /api/v1/admin/games/:id
DELETE /api/v1/admin/games/:id
POST   /api/v1/admin/games/:id/restore
```

Cobertura mínima bajo `/api/v1/admin/*`:

- dashboard
- juegos: CRUD / soft-delete / restore / duplicate / search / filter / pagination
- biblioteca base
- categorías
- géneros
- plataformas
- multimedia
- administradores
- auditoría
- sesiones
- negocios/tenants (solo `SUPER_ADMIN`)
- configuración
- precios
- datos/importación
- backups
- sistema

Categorías, géneros, plataformas y administradores deben tener CRUD equivalente.

---

# 32. ADMIN MANAGEMENT

Solo `SUPER_ADMIN` debe administrar otros administradores y tenants.

`SUPER_ADMIN`:

- puede crear, editar, activar/desactivar y consultar tenants;
- puede crear/editar/activar/desactivar administradores, cambiar rol, asignar tenant y revocar sesiones;
- administra biblioteca base;
- todo lo que hace `ADMIN`;
- operaciones destructivas sensibles.

`ADMIN`:

- puede administrar juegos, categorías, géneros, plataformas e imágenes **de su tenant**;
- opera según sus permisos;
- `Negocios/Tenants` únicamente para `SUPER_ADMIN`.

Nunca permitir que un admin normal se convierta a sí mismo en `SUPER_ADMIN`.

Ver también: aislamiento de tenants (sección 91) y prohibiciones de hardcode (sección 92).

---

# 33. VALIDACIÓN

Usar Zod.

Validar:

- body
- params
- query
- headers cuando sea necesario
- archivos
- UUID
- URLs
- enums
- precios
- tamaños
- años
- cantidad de screenshots.

Nunca confiar directamente en datos provenientes del cliente.

---

# 34. ERROR HANDLING

Respuesta consistente:

```json
{
  "success": false,
  "error": {
    "code": "GAME_NOT_FOUND",
    "message": "Game not found",
    "details": null
  }
}
```

Códigos:

```text
400 validation
401 unauthenticated
403 forbidden
404 not found
409 conflict
422 unprocessable entity
429 rate limited
500 internal error
```

Mantener el mismo formato para todos ellos. No devolver stack traces en producción.

---

# 35. RESPONSE FORMAT

Éxito:

```json
{
  "success": true,
  "data": {}
}
```

Colecciones:

```json
{
  "success": true,
  "data": [],
  "meta": {"page": 1, "pageSize": 20, "total": 0, "totalPages": 0}
}
```

---

# 36. SECURITY

Implementar como mínimo:

- Helmet
- CORS restrictivo
- rate limiting
- body size limits
- input validation
- secure cookies
- JWT rotation
- password hashing
- authorization middleware
- request IDs
- logging
- secure headers
- protección de rutas admin
- protección contra brute force en login
- no secrets en Git
- no secrets en respuestas.

El endpoint de login debe tener un límite más estricto que los endpoints públicos.

---

# 37. CORS

No usar `*` en producción para endpoints administrativos.

Utilizar:

```text
CORS_ORIGIN
```

mediante environment variables.

---

# 38. ENVIRONMENT VARIABLES

Crear `.env.example`:

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

CORS_ORIGIN=

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

CLOUDINARY_FOLDER=game-catalog

RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
```

`CORS_ORIGIN` puede contener orígenes separados por comas. No incluir valores reales.

---

# 39. DATABASE URL

Neon será la base de datos de producción.

Prisma debe estar configurado correctamente para Neon.

Usar `DATABASE_URL` para runtime y `DIRECT_DATABASE_URL` si se requiere conexión directa para migraciones/CLI.

Verificar documentación actual de Prisma + Neon antes de decidir la configuración final.

---

# 40. PRISMA

Crear:

```text
prisma/schema.prisma
```

Implementar:

- enums
- relaciones
- índices
- unique constraints
- timestamps
- soft delete
- auditoría.

Crear migrations.

No utilizar `prisma db push` como estrategia de producción.

Producción:

```text
prisma migrate deploy
```

Desarrollo:

```text
prisma migrate dev
```

---

# 41. ÍNDICES

Agregar índices apropiados para:

- tenantId
- title
- slug
- status / availability
- categoryId
- createdAt
- updatedAt
- deletedAt
- releaseYear.

Para relaciones:

- gameId / tenantGameId
- genreId
- platformId.

Índices especialmente relevantes: `tenantId`, `slug`, `deletedAt`, `availability`, `categoryId`, `genreId`, `createdAt`, `updatedAt`.

Usar índices compuestos donde realmente ayuden (por ejemplo `tenantId + slug`, `tenantId + deletedAt`).

---

# 42. SEED

Crear:

```text
prisma/seed.ts
```

Seed reproducible que debe poder crear:

- `SUPER_ADMIN` de desarrollo (`tenantId = null`)
- tenant Javier
- `ADMIN` de Javier
- categorías
- géneros
- plataformas
- reglas de precios iniciales del tenant
- biblioteca base de ejemplo (`BaseGame`)
- juegos de tenant (`TenantGame`, origen biblioteca y personalizado)
- media de ejemplo sin secretos reales.

Las credenciales de seed deben venir de environment variables:

```env
SEED_ADMIN_USERNAME=
SEED_ADMIN_PASSWORD=
```

Nunca subir una contraseña real. Credenciales de desarrollo mediante variables de entorno; nunca credenciales reales.

No hardcodear en el código lo que pertenece al seed (Javier, precios, categorías, etc.).

---

# 43. HEALTH CHECK

Implementar:

```text
GET /api/v1/health
```

Respuesta:

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "database": "ok",
    "timestamp": "..."
  }
}
```

Este endpoint será utilizado por Render.

---

# 44. GRACEFUL SHUTDOWN

Implementar cierre correcto ante:

```text
SIGTERM
SIGINT
```

Cerrar:

- HTTP server
- Prisma
- conexiones externas.

---

# 45. LOGGING

Usar logging estructurado.

Registrar:

- request ID
- método
- path
- status
- duración
- errores
- eventos de autenticación importantes.

No registrar:

- passwords
- JWT
- refresh tokens
- API secrets
- cookies completas.

---

# 46. TESTING

Implementar pruebas unitarias, integración y seguridad.

**Auth:** login, credenciales inválidas, refresh, logout, revocación, expiración, token inválido/expirado, usuario desactivado, rate limiting en login.

**Multi-tenant:** `ADMIN` no puede leer/modificar otro tenant; `SUPER_ADMIN` puede administrar según permisos; nunca se confía en `tenantId` del cliente.

**Games:** CRUD, soft delete, restore, duplicate, filtros, búsqueda, paginación.

**Pricing:** cálculo, límites, reglas activas, preview y apply.

**Media:** límites (1 cover / 4 screenshots), errores, retry y consistencia DB/Cloudinary.

**Import:** validación, preview, backup, import y auditoría.

**Catálogo:** version increment y aislamiento por tenant; endpoints públicos excluyen no disponibles y eliminados.

**Seguridad/otros:**

- password hashing
- JWT
- validation
- catalog version
- permisos (`ADMIN` intentando administrar admins)
- acceso sin token
- input inválido
- el catálogo público nunca expone información administrativa.

---

# 47. DOCUMENTACIÓN API

Generar documentación preferentemente con OpenAPI/Swagger.

Documentar:

- endpoints
- parámetros
- body
- respuestas
- errores
- autenticación
- ejemplos.

Áreas a cubrir: auth, games, catalog, library, categories, genres, platforms, media, pricing, admins, tenants, audit, backups/imports, system.

Los schemas deben corresponder a los DTO reales.

---

# 48. DOCKER

Crear Dockerfile para producción.

Objetivo:

```text
npm ci
npm run build
npm run start
```

Usar multi-stage build si aporta valor.

---

# 49. RENDER

Backend desplegado en Render.

El servidor debe escuchar en `process.env.PORT`; no asumir un puerto fijo en producción.

Configurar build/start según el `package.json` final.

Asegurar:

```text
prisma migrate deploy
```

en un pre-deploy command apropiado. No ejecutar migraciones destructivas automáticamente.

Configurar:

- environment variables
- build command
- start command
- health check
- HTTPS
- CORS
- production NODE_ENV.

No diseñar el sistema suponiendo disponibilidad 24/7 de un plan gratuito.

---

# 50. GITHUB

Inicializar:

```bash
git init
```

Crear rama principal:

```text
main
```

Crear `.gitignore` antes del primer commit.

Ignorar:

```text
node_modules
.env
.env.*
!.env.example
dist
coverage
.DS_Store
*.log
```

---

# 51. GITHUB CLI

Verificar:

```bash
gh --version
```

Autenticar:

```bash
gh auth login
```

Comprobar:

```bash
gh auth status
```

Crear commit inicial:

```bash
git add .
git commit -m "feat: initialize backend architecture"
```

Crear repositorio privado:

```bash
gh repo create game-catalog-backend --private --source=. --remote=origin --push
```

Verificar:

```bash
gh repo view
```

No crear repositorio público por defecto.

---

# 52. GITHUB ACTIONS

Crear:

```text
.github/
└── workflows/
    ├── ci.yml
    └── deploy.yml
```

CI:

```text
install
typecheck
lint
test
build
```

No ejecutar tests destructivos contra producción.

---

# 53. GITHUB SECRETS

Usar GitHub Secrets para:

```text
DATABASE_URL
DIRECT_DATABASE_URL
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
```

Nunca escribirlos directamente en:

- workflow YAML
- source code
- README
- documentación.

---

# 54. GITHUB ACTIONS + RENDER

Preferir integración segura.

Si Render tiene deploy automático desde GitHub:

```text
push main
   ↓
GitHub
   ↓
Render deploy
```

El CI debe validar el código antes del despliegue cuando sea posible.

---

# 55. MCP — PRINCIPIOS

MCPs principales:

```text
Neon
Cloudinary
Render
```

No instalar un número enorme de MCPs sin necesidad.

No usar MCP para reemplazar el código normal del proyecto.

No convertir MCP en dependencia runtime de producción: es una herramienta de desarrollo/operación.

---

# 56. OPENCODE MCP

OpenCode permite gestionar MCPs mediante:

```bash
opencode mcp
```

Comandos útiles:

```bash
opencode mcp add
opencode mcp list
opencode mcp auth
opencode mcp logout
```

---

# 57. NEON MCP

Usar el MCP oficial de Neon.

Endpoint:

```text
https://mcp.neon.tech/mcp
```

Configurar:

```bash
opencode mcp add neon --url https://mcp.neon.tech/mcp
```

Si requiere autenticación OAuth:

```bash
opencode mcp auth neon
```

Comprobar:

```bash
opencode mcp list
```

Usarlo para:

- inspeccionar proyectos
- consultar esquema
- verificar tablas
- operaciones de desarrollo autorizadas
- revisar estado
- ayudar con migraciones.

No permitir operaciones destructivas de producción sin confirmación explícita.

---

# 58. CLOUDINARY MCP

Cloudinary ofrece MCPs remotos oficiales.

MCP principal:

```text
Asset Management
```

Endpoint:

```text
https://asset-management.mcp.cloudinary.com/mcp
```

Configurar mediante OpenCode:

```bash
opencode mcp add cloudinary-assets --url https://asset-management.mcp.cloudinary.com/mcp
```

Autenticar mediante el mecanismo soportado por OpenCode/Cloudinary.

Utilizarlo para:

- assets
- carpetas
- búsquedas
- imágenes
- metadata
- operaciones de media.

No exponer Cloudinary API Secret.

---

# 59. CLOUDINARY MCP ADICIONALES

NO habilitar inicialmente:

```text
Environment Config
Structured Metadata
Analysis
MediaFlows
```

a menos que una tarea concreta lo requiera.

---

# 60. RENDER MCP

Usar el MCP oficial de Render.

Endpoint:

```text
https://mcp.render.com/mcp
```

Configurar:

```bash
opencode mcp add render --url https://mcp.render.com/mcp
```

Si requiere API key, mantenerla fuera del repositorio.

Utilizarlo para:

- consultar servicios
- deployments
- logs
- métricas
- operaciones de infraestructura.

Las operaciones destructivas requieren confirmación.

---

# 61. MCP VERIFICATION

Después de configurar:

```bash
opencode mcp list
```

Esperado:

```text
neon       connected
cloudinary connected
render     connected
```

Si falla:

1. revisar autenticación
2. revisar endpoint
3. revisar permisos
4. revisar logs
5. no introducir credenciales en el repositorio.

---

# 62. OPTIONAL CONTEXT7

Context7 NO es obligatorio.

Puede añadirse si aporta valor para documentación actual de:

- Prisma
- Express
- Zod
- Cloudinary
- Neon
- Render.

No añadirlo automáticamente.

---

# 63. FREE-TIER REQUIREMENT

Diseñar para:

```text
Neon Free
Cloudinary Free
Render Free
GitHub Free
Cloudflare Free
GitHub Actions Free allowance
```

No asumir límites gratuitos ilimitados.

Minimizar:

- queries
- transferencia
- almacenamiento duplicado
- logs
- requests constantes
- procesamiento innecesario.

---

# 64. CLOUDINARY OPTIMIZATION

Las imágenes deben servirse optimizadas.

Utilizar transformaciones apropiadas para:

- thumbnails
- portada
- capturas.

No descargar imágenes gigantes si el cliente necesita una miniatura.

---

# 65. DATABASE OPTIMIZATION

No utilizar `SELECT *` indiscriminadamente.

Seleccionar solamente los campos necesarios.

Evitar N+1 queries.

Usar `select`, `include` y relaciones conscientemente.

El catálogo público nunca debe devolver información administrativa.

---

# 66. TRANSACTIONS

Las operaciones relacionadas deben utilizar transacciones.

Crear juego:

```text
Create Game
+
Relations
+
Cover metadata
+
Audit
+
Catalog version increment
```

debe ser consistente.

Las operaciones Cloudinary son externas a PostgreSQL y deben manejarse mediante estrategias de compensación cuando sea necesario.

---

# 67. CLOUDINARY + DATABASE CONSISTENCY

Nunca asumir que PostgreSQL y Cloudinary forman una misma transacción.

Ejemplo:

```text
1. Upload Cloudinary
2. Obtener publicId/url
3. Crear registro DB
4. Si DB falla:
   eliminar asset Cloudinary
```

Para reemplazo:

```text
upload new
↓
update DB
↓
delete old asset
```

---

# 68. SLUGS

Crear slugs únicos para:

- games
- categories
- genres
- platforms.

No depender del título como ID.

---

# 69. PUBLIC GAME RESPONSE

Ejemplo (solo datos públicos del tenant, precio ya calculado por el backend):

```json
{
  "id": "uuid",
  "title": "The Witcher 3",
  "slug": "the-witcher-3",
  "description": "...",
  "price": 2500,
  "currency": "CUP",
  "availability": true,
  "size": {
    "value": 85.4,
    "unit": "GB",
    "formatted": "85.4 GB"
  },
  "releaseYear": 2015,
  "category": {
    "id": "uuid",
    "name": "RPG"
  },
  "genres": [],
  "platforms": [],
  "coverImage": {
    "url": "...",
    "alt": "The Witcher 3"
  },
  "screenshots": [],
  "requirements": {
    "minimum": {},
    "recommended": {}
  }
}
```

Nunca incluir información administrativa en la respuesta pública (`tenantId` interno, `priceMode`, audit fields, etc.).

---

# 70. API VERSIONING

Usar:

```text
/api/v1
```

desde el principio.

---

# 71. README

Crear README completo con:

- descripción
- arquitectura
- requisitos
- instalación
- environment variables
- Neon
- Prisma
- Cloudinary
- ejecución local
- migraciones
- seed
- tests
- build
- Render
- GitHub Actions
- MCP
- seguridad.

---

# 72. NPM SCRIPTS

Crear scripts claros para:

```text
dev
build
start
lint
typecheck
test
test:watch
prisma:generate
prisma:migrate
prisma:deploy
prisma:seed
```

Verificar los comandos finales antes de documentarlos.

---

# 73. DEFINITION OF DONE

El backend NO se considera terminado hasta que:

**Compilación y calidad**

- [ ] TypeScript compila sin errores.
- [ ] ESLint pasa.
- [ ] Tests pasan.
- [ ] Prisma schema válido.
- [ ] Migrations creadas.
- [ ] Seed funcional.

**Auth y seguridad**

- [ ] Login funcional.
- [ ] Refresh tokens funcionales (rotación, revocación, detección de reuse).
- [ ] Logout funcional.
- [ ] Roles funcionales (`SUPER_ADMIN` / `ADMIN`).
- [ ] RBAC funciona.
- [ ] Tenant isolation está probado.
- [ ] No se confía en `tenantId` del frontend.
- [ ] No existe lógica hardcodeada para Javier ni precios hardcodeados fuera de seed/configuración.
- [ ] No hay secretos en Git.
- [ ] CORS / Helmet / Rate limiting configurados.
- [ ] `.env.example` creado.

**Catálogo**

- [ ] CRUD de juegos funciona (incl. duplicate, search, filter, pagination).
- [ ] Biblioteca base funciona (`BaseGame` → `TenantGame`).
- [ ] Juegos personalizados funcionan.
- [ ] Categorías / géneros / plataformas funcionan (tenant-aware).
- [ ] Requirements (minimum / recommended / copy) funcionan.
- [ ] Soft delete / restore funciona.
- [ ] API pública excluye juegos no disponibles y eliminados.
- [ ] Búsqueda, filtros y paginación funcionan.

**Media y precios**

- [ ] Cloudinary funciona (1 cover / 4 screenshots, manifest, retry, huérfanos).
- [ ] Consistencia DB/Cloudinary manejada con compensaciones.
- [ ] Pricing funciona (`PricingRule`, `PricingService`).
- [ ] Preview / apply pricing funciona con auditoría e incremento de versión.
- [ ] El backend es la autoridad del precio.

**Operación**

- [ ] Catalog version (por tenant) funciona.
- [ ] Dashboard funciona.
- [ ] Audit funciona.
- [ ] Sessions funciona (revocación incluida).
- [ ] Tenants funcionan (CRUD solo `SUPER_ADMIN`).
- [ ] Import / export funciona (validar → preview → backup → import → auditar).
- [ ] Backup / restore funciona según alcance.
- [ ] Health check funcional.
- [ ] Graceful shutdown (SIGTERM/SIGINT).

**Documentación e infra**

- [ ] OpenAPI funciona.
- [ ] README completo y actualizado.
- [ ] Dockerfile funcional.
- [ ] Render preparado (`process.env.PORT`).
- [ ] GitHub Actions funciona (install, lint, typecheck, test, build).
- [ ] MCPs Neon/Cloudinary/Render configurados/documentados (si aplica).
- [ ] Backend independiente del frontend.
- [ ] Admin V2 puede conectarse sin rediseñar el backend (sección 90).

---

# 74. ORDEN DE IMPLEMENTACIÓN

Orden canónico (V2, multi-tenant-aware):

## FASE 1 — Inspección y base

- inspeccionar repo y documentos;
- Prisma, DB, config, health;
- estructura modular.

## FASE 2 — Seguridad

- Tenant, AdminUser, Auth, Sessions, RBAC;
- tenant isolation.

## FASE 3 — Catálogo

- BaseGame, TenantGame;
- juegos, categorías, géneros, plataformas;
- requirements.

## FASE 4 — Media

- Cloudinary, cover, screenshots;
- manifest, errores, retry;
- orphan detection.

## FASE 5 — Pricing

- PricingRule, PricingService;
- preview, apply;
- auditoría.

## FASE 6 — Catálogo público

- CatalogMetadata;
- catálogo público, versioning y endpoints de cache.

## FASE 7 — Admin APIs

- dashboard;
- tenants, admins, audit, sessions.

## FASE 8 — Data management

- import, export, backup, restore;
- history y duplicate.

## FASE 9 — Tests, docs y despliegue

- tests, OpenAPI;
- Docker, Render, GitHub Actions;
- GitHub repo/CLI, MCP, README.

## FASE 10 — Revisión final

- seguridad;
- tenant isolation;
- índices;
- errores;
- consistencia DB/Cloudinary.

---

# 75. GIT WORKFLOW

Trabajar con commits pequeños y descriptivos.

Ejemplos:

```text
feat: initialize express backend
feat: add prisma database schema
feat: implement admin authentication
feat: implement games crud
feat: add cloudinary media management
feat: add catalog versioning
test: add authentication integration tests
ci: add github actions
docs: add deployment documentation
```

No realizar un único commit gigante.

---

# 76. GITHUB CLI WORKFLOW

Después de tener el proyecto funcional:

```bash
gh auth status
git status
git add .
git commit -m "feat: initialize backend"
gh repo create game-catalog-backend --private --source=. --remote=origin --push
```

Después:

```bash
git checkout -b feat/backend-core
```

Para Pull Requests:

```bash
gh pr create --fill
```

---

# 77. MCP COMMANDS REFERENCE

```bash
opencode mcp list
```

Neon:

```bash
opencode mcp add neon --url https://mcp.neon.tech/mcp
```

Cloudinary:

```bash
opencode mcp add cloudinary-assets --url https://asset-management.mcp.cloudinary.com/mcp
```

Render:

```bash
opencode mcp add render --url https://mcp.render.com/mcp
```

Después:

```bash
opencode mcp list
```

Si el flujo de autenticación requiere OAuth:

```bash
opencode mcp auth neon
opencode mcp auth cloudinary-assets
opencode mcp auth render
```

No asumir que todos los servidores utilizan exactamente el mismo método de autenticación.

---

# 78. IMPORTANT: NO FRONTEND YET

Esta fase termina exclusivamente con:

```text
Backend
+
Database
+
Cloudinary integration
+
Authentication
+
API
+
Infrastructure
+
CI/CD
```

NO implementar todavía:

```text
Next.js
React
React Native
UI
Dashboard visual
Cards
Navbar
CSS
Tailwind
```

El frontend será especificado posteriormente en:

```text
Frontend.md
```

---

# 79. FUTURE REACT NATIVE COMPATIBILITY

El backend debe permanecer agnóstico al cliente.

No utilizar:

- Next.js server actions
- Next.js API routes
- NextAuth específico
- browser-only APIs
- localStorage en backend.

La comunicación debe ser:

```text
HTTP/HTTPS
JSON
REST
JWT/cookies según cliente
```

React Native debe poder consumir la API sin modificar la lógica de negocio.

---

# 80. FINAL AGENT RULE

No apresurarse a escribir código antes de entender toda la arquitectura.

Primero:

1. inspeccionar el proyecto y los archivos de especificación.
2. comprobar Node/npm/Git/gh/OpenCode.
3. comprobar MCPs y autenticación de proveedores.
4. resumir qué existe e identificar qué ya está implementado.
5. identificar qué falta para Backend V2 y proponer los cambios.
6. inicializar Git si aplica.
7. crear estructura.
8. implementar por fases.
9. ejecutar tests después de cada fase; corregir errores.
10. revisar seguridad, tenant isolation, Prisma/migrations y compatibilidad con Admin V2.
11. hacer commit.
12. actualizar README.
13. continuar.

Si falta una credencial externa:

**NO inventarla.**

Crear `.env.example` y explicar exactamente qué variable falta.

Si una API de un proveedor cambió:

- utilizar documentación oficial actualizada
- no seguir una integración obsoleta.

Si una operación MCP es destructiva:

**detenerse y pedir confirmación antes de ejecutarla.**

Al finalizar, entregar:

```text
1. resumen de arquitectura
2. estructura final
3. archivos creados/modificados
4. comandos ejecutados
5. variables de entorno necesarias
6. migraciones realizadas
7. endpoints implementados
8. tests ejecutados
9. estado de Neon / Cloudinary / Render / GitHub / MCPs
10. pasos para ejecutar
11. pasos pendientes
```

**Regla absoluta: no inventes que algo está implementado. Verifícalo en el código.**

El resultado debe ser un backend profesional, seguro, mantenible, multi-tenant y preparado para que posteriormente `Frontend.md` defina el cliente Next.js y, más adelante, React Native.

---

# 81. SAAS MULTI-TENANT

Luismi es el propietario de la plataforma (`SUPER_ADMIN`). Javier es solamente el primer tenant/cliente (`ADMIN`).

No hardcodees Javier, tenantId, precios, categorías, géneros, plataformas, credenciales ni carpetas de Cloudinary.

**Regla central:** el backend debe imponer el contexto del tenant a partir de la sesión/JWT autenticado. Nunca confiar en un `tenantId` enviado por frontend.

Modelos mínimos (detallados en sección 5): `Tenant`, `TenantSettings`, `AdminUser`, `AdminSession`, `BaseGame`, `TenantGame`, `Category`, `Genre`, `Platform`, `GamePlatform`, `GameMedia`, `PricingRule`, `CatalogMetadata`, `AuditLog`.

Cada tenant tiene sus propios: juegos, categorías, géneros, plataformas, precios, configuración, media, administradores, sesiones y auditoría.

---

# 82. BIBLIOTECA BASE

La plataforma contiene una biblioteca base de más de 1000 juegos mantenida por Luismi. Un tenant puede:

- agregar juegos de la biblioteca a su catálogo;
- crear juegos personalizados.

`BaseGame` pertenece a la plataforma. `TenantGame` representa su publicación dentro de un tenant:

```text
BaseGame
    │
    ├── TenantGame (Javier)
    ├── TenantGame (Tenant B)
    └── TenantGame (Tenant C)
```

- Para biblioteca: `origin = BIBLIOTECA` y relación con `BaseGame` (el juego conserva la referencia).
- Para personalizado: `origin = PERSONALIZADO` y sin `BaseGame`.

`SUPER_ADMIN` administra activos globales. `ADMIN` no puede modificar libremente la biblioteca global.

---

# 83. REQUIREMENTS

Minimum y Recommended, cada uno con:

- CPU
- GPU
- RAM
- OS
- DirectX
- storage

Presets:

```text
Intel i3/i5/i7/i9
AMD Ryzen 3/5/7/9
GTX / RTX / RX / Intel Arc
Other / manual
RAM: 2 / 4 / 6 / 8 / 12 / 16 / 32 / 64 GB
Windows 10/11 64-bit
DirectX 10/11/12
HDD / SSD
```

Debe existir copia de Minimum → Recommended al crear.

Principio: **todo lo repetitivo se selecciona; todo lo excepcional se escribe.**

---

# 84. PRICING

`PricingRule` (sección 5.9): `id`, `tenantId`, `minSize`, `maxSize` (nullable), `price`, `active`, `createdAt`, `updatedAt`.

Ejemplo inicial de seed (configuración, no valores universales):

```text
1–10 GB        → 40 CUP
10.01–50 GB    → 50 CUP
50.01–100 GB   → 70 CUP
100.01+ GB     → 100 CUP
```

Implementar `PricingService` para: listar, crear, editar, eliminar, activar/desactivar, validar rangos, calcular, previsualizar y aplicar.

Reglas:

- Los precios son propiedad del tenant.
- El backend es la autoridad del precio. El frontend nunca debe convertirse en fuente de verdad.
- Editar una regla NO debe cambiar silenciosamente todos los juegos. Debe existir una acción explícita **Aplicar nuevas reglas al catálogo** (`PRICES_APPLIED`) con:
  - conteo de juegos afectados;
  - preview;
  - confirmación;
  - aplicación transaccional cuando sea posible;
  - auditoría;
  - incremento de versión de catálogo.
- `priceMode = RULE` calcula por tamaño; `priceMode = MANUAL` usa el precio puntual del juego.

Flujo de autoridad:

```text
Frontend → API → PricingService → PricingRule → PostgreSQL
```

---

# 85. PERFORMANCE / CUBA

Optimizar para conexiones lentas:

- metadata ligera;
- imágenes separadas del JSON;
- thumbnails vía transformaciones Cloudinary;
- CDN;
- lazy loading en frontend;
- cache local + version check;
- paginación y filtros.

No enviar imágenes binarias desde el API. No descargar todas las imágenes automáticamente.

---

# 86. DASHBOARD

`GET /api/v1/admin/dashboard` debe poder devolver:

```text
totalGames
availableGames
unavailableGames
libraryGames
customGames
mediaErrors
orphanMedia
activeSessions
recentAuditEvents
catalogVersion
```

Evitar consultas innecesariamente costosas (agregaciones/index, no recorrer tablas completas).

---

# 87. IMPORT / EXPORT

Implementar: exportar catálogo, exportar manifest multimedia, importar catálogo, validar, preview, comparar cambios, backup antes de importar, confirmar, importar, auditar.

Flujo:

```text
1. seleccionar archivo
2. validar
3. errores
4. comparar
5. preview
6. backup
7. confirmar
8. importar
9. auditoría (IMPORT_COMPLETED)
10. incrementar versión
```

No realizar operaciones destructivas silenciosas. No hay importaciones destructivas sin confirmación explícita.

---

# 88. BACKUPS / RESTORE

- Implementar historial de backups y estado.
- Restore protegido y auditado; operaciones críticas preferiblemente solo `SUPER_ADMIN`.
- Si no existe un dump PostgreSQL real, usar nombres como `Exportar catálogo`, `Exportar datos` o `Backup de catálogo`, no `Exportar DB`.
- Cloudinary se respalda mediante referencias/manifest; un JSON no contiene binarios.
- No exponer SQL console, credenciales, secretos ni dumps privados al usuario público.

---

# 89. HISTORIAL / DUPLICATE

- Implementar historial de cambios cuando sea útil.
- Duplicación segura de juegos: duplicar siempre crea una nueva entidad/ID.
- Slug único en el contexto apropiado (por tenant).

---

# 90. COMPATIBILIDAD CON ADMIN V2

`adminv2.html` es referencia visual/funcional aprobada, **no autoridad de seguridad**.

Debe existir soporte backend para:

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
Negocios/Tenants
Configuración
Precios
Datos/importación
Backups
Sistema
```

Los arrays demo del HTML deben desaparecer al conectar producción. La fuente de verdad será API + PostgreSQL + Cloudinary.

`Negocios` únicamente para `SUPER_ADMIN`.

---

# 91. REGLA CRÍTICA DE TENANT ISOLATION

Aunque el frontend envíe `tenantId: t_javier`, el backend no debe confiar en ello.

Flujo obligatorio:

```text
JWT/session
  ↓
Authenticated AdminUser
  ↓
role + tenantId
  ↓
authorization middleware
  ↓
service/repository
  ↓
query scoped by tenant
```

- Para `ADMIN`, el `tenantId` siempre deriva del usuario autenticado.
- Para `SUPER_ADMIN` puede existir contexto administrativo global, pero el tenant objetivo debe ser explícito al operar sobre un tenant.
- El frontend puede conocer el tenant actual para mostrar contexto, pero nunca debe poder imponer un tenant diferente.

Nunca:

```text
frontend tenantId → DB
```

---

# 92. PROHIBICIONES DE HARDCODE

Nunca:

```ts
if (tenantId === "t_javier") {}
```

Nunca:

```ts
const JAVIER_TENANT_ID = ...
```

Nunca:

```ts
const PRICE_1_10 = 40
```

Los datos demo pertenecen al seed/configuración. El frontend tampoco debe definir la verdad del precio.

---

# 93. SCRIPTS Y README

Scripts mínimos:

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

Adaptar nombres si el proyecto ya tiene una convención válida. Verificar los comandos finales antes de documentarlos.

El README debe cubrir: arquitectura, instalación, variables de entorno, Prisma, migrations, seed, API, auth, multi-tenancy, Cloudinary, pricing, tests, Docker, Render y GitHub Actions.

Documentar explícitamente:

> El backend es la autoridad de autenticación, autorización, tenant isolation, precios y estado del catálogo.
