# Tech Context

## Tech Stack

### Languages
- TypeScript (backend y frontend, `strict`)

### Frameworks & Libraries
- Backend: Fastify + Zod + Prisma ORM.
- Frontend: Next.js (App Router), CSS propio, `node --test` para tests de frontend.
- Tests: Vitest (backend, 654 tests).

### Database
- Neon Postgres (producción): proyecto `rough-fire-20869032`, rama `main` = `br-misty-salad-b8xwlwmc`.
- `.env` local apunta SIEMPRE a producción (no hay dev DB separado).
- Snapshot plan free limitado a 1 (`snap-proud-leaf-b8q0dezc` "pre-fase1-saas" actual).
- Proyecto Neon `Market-Place-Moa` (`bitter-sea-06796259`) — **NUNCA tocar**.

### Infrastructure
- Despliegue: Render (autoDeploy al push — por eso migración Neon ANTES de push).
- Media: Cloudinary (uploads con firma server-side; entregas por CDN).

## Development Setup

### Prerequisites
- Node LTS, npm. Sin `rg` (usar Select-String/grep). PowerShell 5.1: sin `&&` (usar `;`), separar sentencias con `; if ($?) {...}`.

### Getting Started
```bash
# backend
cd backend; npm install; npx prisma validate; npx vitest run; npx tsc --noEmit
# frontend
cd frontend; npm install; npm run typecheck; npm run lint; npm run test; npm run build; npm run cf:build
```

### Environment Variables
| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon (secretos NUNCA imprimir ni commitear) |
| `CLOUDINARY_*` | credenciales de media |
| `SESSION_SECRET` / claves de auth | sesiones |
| `IGDB_CLIENT_ID/SECRET` | enriquecimiento (autorizado para piloto 50) |

## Dependencies
- Prisma Client generado (`prisma generate` tras tocar schema).
- ESLint/Prettier del repo; eslint solo vía `npm run lint`.

## Tool Configuration
- `node -e` arruinado en esta máquina → scripts auxiliares como ficheros `.mjs`.
- `backend/scripts/` NO se commitea (junto a `.gitignore`, `ADMIN/`, JSON de pilotos).

## Technical Constraints
- Sin comentarios en el código (regla del usuario).
- `docs/` no se modifica.
- Convención de commits: conventional en español; cada commit con aprobación previa.
- No push/deploy sin permiso.
- Orden crítico: migración Neon → (aplicar) → push → Render.

## Development Conventions
- Criterios/decisiones → `tasks/*.md`; estado de sesión → `memory-bank/` (siempre al final).
- Skills cargables: planning-and-task-breakdown, memory-bank, TDD, debugging, security-and-hardening, code-review, etc.
- Arquitectura/migraciones → consultar docs oficiales/skills antes de implementar.
