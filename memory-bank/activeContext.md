# Active Context

## Date
2026-10-16

## Current Focus
**Fases 5, 6 y 7.1 cerradas; 3 commits locales sin push.** Gates: backend **796/796**, `tsc` 0, eslint 0, `check-encoding` OK; frontend **103/103**, `tsc` 0, build OK. La **Fase 6 está verificada en navegador** (3 de 4 puntos; el timeout de 5 min quedó solo verificado por código, pendiente de ejercitar). **Próximo bloque: Fase 8** (gestión de tenants) o el **trabajo conjunto de UI** (admin + feed), que absorbería 7.2 y 7.3.

## Recent Changes
- **2026-10-16 — 6.2-C completa (3 rebanadas).** El importador pasa a ser operable desde el panel: preview (`/import/preview`) solo si el archivo ya es válido (para no perder `details.errors`, que `errorFromResponse` no lee), luego backup + `/import/run` con `confirm: 'IMPORTAR'` y `fingerprint`, y pantalla de resultado. El listado de `/admin/juegos` ya no muestra `—`: se añadió el campo `platform` al DTO (sin tocar `platforms`, que un test asserts vacío a propósito porque la oferta no crea puentes) y `gameView.etiquetaPlataforma()`.
- **2026-10-16 — Verificación en navegador (MCP).** Red: `validate` 200 → `preview` 200 → `backup` **201** → `run` **200**, pantalla "Importación aplicada · 3 ofertas creadas". Caso `409 IMPORT_PREVIEW_STALE` reproducido (bump de `CatalogMetadata.version` entre preview y run) con el mensaje correcto. Listado con PC / PS5 / Switch. En BD: `bg3-ps5` borrado en soft (retirada acotada), `celeste-ps5` creado, todos con `origin: BIBLIOTECA` derivado.
- **Bug encontrado por esa verificación y corregido:** el error del run se pintaba con el título "No se pudo calcular el plan" porque `previewError` se reutilizaba para dos errores distintos. Ahora `previewError` y `runError` van separados.
- **7.1 CRUD `TenantPlatform` (backend).** `GET/PATCH/POST /api/v1/admin/tenant-platforms`. 15 tests. Reutiliza `resolveTenantId` de `games.service.ts`, el `slugSchema` canónico y los códigos de `taxonomy.config.ts`.
- **Bloqueo resuelto:** `TenantPlatform` estaba vacía y no había forma de habilitar plataformas → toda importación fallaba. Ahora la siembra del seed las habilita por defecto para todos los tenants (12 filas aplicadas en dev con aprobación) y 7.1 da el endpoint. Falta la UI (7.2), aplazada al trabajo conjunto.
- **Push: NO hecho, y no se debe hacer todavía.** `.github/workflows/deploy-frontend.yml` despliega a Cloudflare Workers en cada push a `main` con cambios en `frontend/**`. El frontend nuevo llama a endpoints que el backend de Render probablemente no tiene (`/import/preview`, `/import/backup`, `/import/run`, `/tenant-platforms`, y el campo `platform`): un push rompería la importación en producción.
- **Fases 5 y 6 (código):** `library-import@2` con huella, merge transaccional, SSRF-safe en portadas; `catalog@2` con ofertas por plataforma, plataformas globales, `origin` y `clearedFields` derivados, retiradas acotadas, export migrado y roundtrip cerrado.

## Active Decisions
- §12 completa (8 decisiones) — `plan-detallado.md` §12, `dudas.md` §8.
- Decisiones de `catalog@2` documentadas en `tasks/catalog-import-contrato.md` §2.1.1/§4.1/§4.2/§5.1: retiradas acotadas a las plataformas declaradas; el export excluye a `skipped` lo que no puede representar; la identidad de una oferta no se renombra nunca; `clearedFields` presente reemplaza la lista; `origin` derivado y reparado (nunca degrada a `BIBLIOTECA`); ausentes y `null` no borran.
- Decisiones previas vigentes: `publishFromLibrary` sigue sin decidir; `clearedFields` en `TenantGame`; ACTIVE exige título+slug+desc+≥1 plataforma+≥1 size+portada; taxonomía desconocida = error por registro sin auto-crear.
- **Commit 2026-10-16:** 3 commits atómicos (`feat(catalogo)`, `docs(tasks)`, `chore(scripts)`) tras revisar staging: fuera `.gitignore`, `ADMIN` (vacío) y `backend/scripts/` (datos de 500KB).
- Orden: plataforma → respaldos → limpieza → herencia → importador A → importador B → TenantPlatform → tenants → validación → **generador al final**.

## Next Steps
1. **Ejercitar el timeout de 5 min** de `/import/run` (queda solo verificado por código): hace falta una descarga de portada lenta real. El usuario lo aplazó.
2. **Fase 8.1** (`Tenant.deletedAt` + soft delete). Ojo: `Tenant` tiene `isActive` pero **no** `deletedAt`, así que toca **migración de esquema** → requiere aprobación explícita. 8.2 y 8.3 son UI (aplazadas).
3. **Trabajo conjunto de UI (admin + feed)**, que absorbería 7.2 (checklist de plataformas), 7.3 (filtro por plataformas habilitadas) y los 4 pendientes cosméticos de `tasks/ui-admin.md`. **Hallazgo:** el filtro de plataformas del panel se alimenta de `/admin/platforms` (taxonomía por tenant) y desde 6.2-B debería usar `/tenant-platforms` (globales + habilitación).
4. **Push**, solo cuando el backend de producción tenga los endpoints nuevos y esté verificado.
5. Decisión `publishFromLibrary` + demo/revisión humana del checkpoint de Fase 4.

## Open Questions / Blockers
- `/admin/plataformas` sigue con la UI antigua (lista PS5/PC + "Xbox no está soportado") y su copy ("Pertenecen solo a tu negocio") **contradice** el modelo de plataformas globales. Va con 7.2.
- Un tenant nuevo que no pase por el seed queda sin plataformas habilitadas y, por tanto, sin poder importar.
- **Datos de prueba en la BD de dev:** el catálogo de Javier tiene 3 ofertas vivas + 1 soft-deleted, 2 respaldos `PRE_IMPORT` y `CatalogMetadata.version` subido 2 veces (83 → 85). Se puede limpiar para empezar de cero.
- BUG-01.D pendiente de decisión. `LibraryMedia = 0`.
- 9 = criterios de aceptación y revisión de seguridad; 10 = regenerar el piloto (última OC).

## Session Notes
Reglas del usuario: skills según encaje · dudas cruciales antes de seguir · memory-bank+progress al final de sesión o fase · testear cada tarea · "continue" = seguir sin preguntar salvo blocker · migraciones destructivas siempre con aprobación explícita · sin push/commit sin permiso (commit sí autorizado el 2026-10-16) · NO comentarios en código · NO tocar `docs/` · NO commitear `.gitignore`/`backend/scripts/`/ADMIN · NO imprimir secretos · repo Market-Place-Moa intocado · no adelantar 7.2 (UI) · trabajar por fases.
**Lección repetida:** al tocar un fichero UTF-8 usar `edit`/`write`; un `git checkout` ya se llevó trabajo sin commitear una vez. Ya existe `scripts/check-encoding.mjs` (probado en las dos direcciones) y es parte de los gates.
**Lección 2026-10-16:** la consola de PowerShell **no** renderiza bien los acentos; para comprobar corrupción hay que contar code points (`[regex]::Matches($t,'[\u0100-\u04FF]')`), no mirar la salida.