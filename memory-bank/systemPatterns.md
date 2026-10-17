# System Patterns

## Architecture Overview
Monorepo: `backend/` (Fastify + Prisma/Postgres Neon) · `frontend/` (Next.js App Router, ruta de catálogo con prefijo de negocio) · despliegue Render (autoDeploy en push; migraciones Neon ANTES de push).

```
[Frontend Next: feed /admin /catalog] → [Fastify: auth+RBAC → modules] → [Prisma → Neon]
                                              ↘ storage (Cloudinary vía media service)
[Otra OC: prompts en backend/scripts/] → JSON a disk → import endpoints (SUPER_ADMIN)
```

## Design Patterns in Use
- Módulos por dominio en `backend/src/modules/*` (games, base-games, data-transfer, media, tenants…): schema Zod + service + route.
- RBAC con roles (`SUPER_ADMIN`, `ADMIN` de tenant) en guards de ruta.
- Migraciones expand/contract (Primero añadir, usar, validar; retirar después y con respaldo).
- Validación estricta de contratos JSON (Zod) — campos desconocidos = rechazo; datos incompletos = `INCOMPLETE`, nunca placeholder.
- Preview/analyze antes de aplicar + fingerprint de idempotencia en imports.

## Component Relationships
```
BaseGame (identidad: título, slug, año, desc, géneros, media, status)
   └─ BaseGamePlatform (por plataforma: size*, requirements PC, procedencia)
        └─ TenantGame (tenantId, platformId; overrides de precio/dispo/custom)

Tenant ─< TenantPlatform >─ Platform (globales: pc, ps5, ps4, xbox-series-x, xbox-one, switch)
LibraryMedia (portada/screenshots globales) vs GameMedia (override tenant)
```
Resolución final: `TenantGame` (override/limpio) → `BaseGamePlatform` → `BaseGame`; portada: `GameMedia ?? LibraryMedia`.

## Key Technical Decisions
| Decision | Reasoning |
|----------|-----------|
| Modelo A (`TenantGame` por tenant+base+platform) | Precio/dispo por plataforma es la verdad de negocio (Decisiones §1, §6.4) |
| Tricampo de herencia (heredar/personalizar/limpiar) | Nulo ≠ borrar; sin eso, "quitar un valor" taparía la herencia |
| Importador = autoridad; generador se adapta al contrato | El contrato JSON se cierra contra la BD ya modelada (generador-impprtador.md) |
| Taxonomía/diccionario cerrado | Consistencia cross-tenant; entradas nuevas solo con aprobación |
| Herencia de requisitos solo en fila PC | Los requisitos de Steam no aplican a PS/Xbox/Nintendo |
| Steam storage como proxy de tamaño (anotado) | Aceptado y documentado por juego; nunca tamaño de DLC/OST |
| Snapshot único (plan free) | Limitación de cuenta: decisión 12.5 antes de migrar |

## Data Flow
1. Prompt (otra OC) → JSON → `validate` (preview, errores/registro) → `import` (upsert merge, transaccional, audit) → Neon + Cloudinary.
2. Feed: petición público → resolveFinal por juego → respuesta por tenant.

## API Patterns
REST versionado `/api/v1/...` + rutas admin `/admin/...`; Zod en entrada; SUPER_ADMIN para operaciones globales; auditoría de operaciones privilegiadas.

## Error Handling Strategy
Errores por registro en imports (no abortar todo), logs + reintentos para media, nada destructivo sin respaldo/reversión, 403 cross-tenant.

## Testing Strategy
Vitest (unit + integration `backend/tests/integration/*`), tests de permisos, tests maliciosos de SSRF, gates por fase (ver plan-detallado §13). Siempre testear cada tarea.
