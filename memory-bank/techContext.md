# Tech Context

## Tech Stack

### Languages
- TypeScript (ESM, `"type": "module"`), Node.js >= 22

### Frameworks & Libraries
- Express 5 + helmet + cors + cookie-parser + express-rate-limit
- jose (JWT), argon2 (hash de contraseñas), zod (validación)
- Prisma 7 con adapter-pg (driver adapter, no engine tradicional)
- pino (logging con redacción)
- multer (upload multipart en memoria, 8 MB) + @types/multer; Cloudinary vía REST/fetch (sin SDK)

### Frontend
- **Next.js 16.3.8** (App Router, Turbopack) + **React 19.1.7** + TypeScript 6.0.3
- **`@opennextjs/cloudflare` 1.20.10** + **wrangler 4.149.0** (build a Cloudflare Worker)
- ESLint flat + eslint-config-next (core-web-vitals + typescript)
- Tests con `node --test` (Node 26 type-stripping), sin framework externo
- ⚠️ **`next` está fijado en 16.3.8 a propósito** — no subir sin verificar que OpenNext conoce los manifiestos de la nueva versión (ver `systemPatterns.md`)

### Database
- PostgreSQL en Neon. ORM Prisma. Cliente generado en `src/generated/` (commiteado).

### Infrastructure
- GitHub (repo `WwolfieLuisM/saas-catalogo`, público).
- **GitHub Actions**: `ci.yml` (frontend+backend checks en push/PR a `main`), `deploy-frontend.yml` (auto-deploy a Cloudflare Workers en push a `main` con paths `frontend/**`).
- **Render** — backend `saas-catalogo-api`: `https://saas-catalogo-api.onrender.com` (autoDeploy activo).
- **Cloudflare Workers** — frontend `saas-catalogo-frontend`: `https://saas-catalogo-frontend.luisiking89.workers.dev` (el único despliegue vivo del frontend; ver `systemPatterns.md`).
- **Cloudflare Pages** — proyecto `saas-catalogo` (ID `034b0836-eb79-431c-af4b-4107c678e7d3`): **abandonado**, en desuso. Borrado pendiente de visto bueno del usuario.
- Cloudinary (media), Neon (DB).


## Development Setup

### Prerequisites
- Node.js >= 22, npm, Git.

### Getting Started
```bash
# Backend
cd backend
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run dev            # backend en PORT (default 3000)

# Frontend (instalación OFFLINE — npm se cuelga con árboles grandes)
cd ../frontend
powershell -File tools/install-offline.ps1
npm run dev            # localhost:3000 (puerto fijo: CORS de Render solo admite 3000)
```

### Environment Variables
Backend (`backend/.env`):
| Variable | Purpose |
|----------|---------|
| DATABASE_URL | Conexión PostgreSQL (Neon) |
| JWT_ACCESS_SECRET | Secret HS256 access tokens (min 32) |
| JWT_REFRESH_SECRET | Declarada pero NO usada (refresh es opaco) |
| ACCESS_TOKEN_EXPIRES_IN | Default 15m |
| REFRESH_TOKEN_EXPIRES_IN | Default 30d |
| COOKIE_SECURE / COOKIE_SAME_SITE / COOKIE_DOMAIN | Flags de cookie refresh |
| CORS_ORIGIN | Orígenes permitidos (coma-separados) |
| CLOUDINARY_* | Cloud name, API key, secret, folder |
| RATE_LIMIT_* / LOGIN_RATE_LIMIT_MAX | Ventana y límites de rate limit |
| SEED_ADMIN_* / SEED_JAVIER_ADMIN_* | Usuarios seed |

Frontend (`frontend/.env.local`, gitignored; plantilla en `.env.example`):
| Variable | Purpose |
|----------|---------|
| NEXT_PUBLIC_API_URL | Base del backend (Render). Se usa en `rewrites()` y en el cliente |
| NEXT_PUBLIC_TENANT_SLUG | Slug del tenant público (`javier`) |
| NEXT_PUBLIC_DEMO | `true` permite mostrar datos stale en vez de error |
| NEXT_PUBLIC_SITE_URL | URL canónica/OG (producción: el Worker de Cloudflare) |

## Dependencies
- `argon2` nativo (requiere build; permite `allowScripts` en package.json).
- `pg` + `@prisma/adapter-pg`: Prisma sobre driver pg estándar.
- `jose`: JWT moderno ESM-friendly (verifica HS256 con `algorithms` fijado).

## Tool Configuration
- **Backend**: ESLint (flat `eslint.config.mjs`) + typescript-eslint, Prettier (`.prettierrc`), Vitest (`vitest.config.ts`), build `tsc -p tsconfig.build.json` → `dist/`. **575 tests**.
- **Frontend**: ESLint flat + eslint-config-next, build `next build`, `npm run cf:build` (OpenNext → `.open-next/worker.js`), tests `node --test` (Node 26 type-stripping, sin framework). **80 tests**.
- **4 gates del frontend** (todos deben estar verdes antes de tocar nada): `node --test`, `tsc --noEmit`, `eslint .`, `next build`. Más `npm run cf:build` para validar el bundle del Worker.
- `eslint.config.mjs` incluye `.open-next/**` en `globalIgnores` — sin eso, eslint linteara los artefactos de build y daba ~937 falsos errores locales.

## Technical Constraints
- Multi-tenant: todo query de tenant-scoped debe filtrar por `tenantId` derivado del JWT, nunca del body.
- Frontend no debe hablar directo con Prisma/DB (README §35).
- Secrets nunca en Git (.env ya presente en disco, fuera del repo por .gitignore).
- `trust proxy` solo en producción (Render delante).
- **El frontend debe correr siempre en el puerto 3000** — el `CORS_ORIGIN` de Render solo admite `localhost:3000` (y `10.215.0.119:3000` para la LAN local).
- **No subir `next` sin comprobar la compatibilidad con `@opennextjs/cloudflare`** (ver `systemPatterns.md`).
- La instalación de dependencias del frontend es **offline** por diseño (`tools/install-offline.ps1` + `vendor/`); npm se cuelga con árboles grandes en esta máquina.


## Development Conventions
- Mensajes de error y UI admin en español; código y nombres en inglés. Comentarios en código: ninguno.
- Mutaciones sensibles siempre en `$transaction` con `AuditLog` (`auditData()` incluido en la misma transacción).
- Endpoints admin bajo `/api/v1/admin/*` con `authenticate` + `requireRoles`.
- Soft delete en taxonomía/BaseGame/TenantGame; slug inmutable y **reservado** tras borrar (409 `*_SLUG_EXISTS`).
- Campos JSON de Prisma: usar helper `jsonValue()` (devuelve `InputJsonValue | NullableJsonNullValueInput`); `null` plano falla de asignación.
- `@default(uuid())`/`@updatedAt` de Prisma son **client-side**: inserts SQL crudos deben proveer `id` y `updatedAt` (solo `createdAt` tiene default en DB).
- zod v4: no existe `z.ZodIssueCode` — usar `code: 'custom'` en `ctx.addIssue`; `superRefine` solo corre si la base parsea.
- Seed idempotente: `findFirst` → create/update explícito (nada de upsert con compuestos que puedan ser `null`).
- Regla MCP Neon: solo SQL auto-rollback/lectura; un statement por llamada (prepared statements) — checks complejos en un solo `DO ... RAISE EXCEPTION 'CHECKS-ALL-OK-ROLLBACK'`.
- Media: multer valida en el middleware (fileFilter MIME+ext, límite 8 MB) y el servicio revalida (defensa en profundidad); subidas con `withRetry(3)`; `publicId` = `tenants/{tenantId}/games/{slug}/cover|shot-N` (§19, estructura exacta, slug inmutable).
- En tests de media: `vi.mock('../../src/config/cloudinary.js')` con `assets` Set en memoria y contadores de fallo; `NODE_ENV=test` pone el backoff de `withRetry` a 0.
- Pricing: `PricingRule`/`CatalogMetadata` sin defaults de DB para `id`/`updatedAt` (Prisma client-side, igual que el resto); migración generada con `prisma migrate diff --from-schema --to-schema --script` (Prisma 7 eliminó `--from-schema-datamodel`) y aplicada a Neon statement por statement + verificación DO-block; seed idempotente por `(tenantId, minSize)` con `findFirst` → create/update; columnas camelCase entrecomilladas en SQL crudo (`"minSize"`, `"priceMode"`).
- Catálogo público: sin `authenticate`, identidad por slug (`tenant`, nunca `tenantId`); ETag `"v<version>"` solo en `/` y `/version` (304 con `If-None-Match`), `/sync` sin ETag — `app.set('etag', false)` desactiva el etag weak automático de Express; instantánea en `$transaction` `RepeatableRead`; bumps con `planCatalogBump` (desde la auditoría 2026-10-09: `upsert` atómico con `increment`, sin pre-read; write como `{op}` pusheado a `ops` — nunca hacer `await` directo de un `Promise<PrismaPromise>`); fakeDb `$transaction` acepta array **y** callback `(tx) => ...` (opcionalmente con `_options`).
