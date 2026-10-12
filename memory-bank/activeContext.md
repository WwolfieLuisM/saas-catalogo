# Active Context

## Last Updated
2026-10-12 — Incidente `1101` de Cloudflare Workers **resuelto y en producción**; documentación del memory bank completada.

## Current State

Monorepo **Saas Catalogo** en estado de producto cerrado y desplegado:

- **Backend** — Express 5 + TypeScript (ESM) + Prisma 7 (adapter-pg) sobre PostgreSQL (Neon). Fases 0–13 completas. **575/575 tests** en verde. Desplegado en **Render**: `https://saas-catalogo-api.onrender.com`.
- **Frontend** — Next.js App Router + React. Fidelidad visual/funcional completa (feed Javier PC + admin Luismi Platform · Admin V2). **80/80 tests** en verde. Desplegado en **Cloudflare Workers**: `https://saas-catalogo-frontend.luisiking89.workers.dev`.
- **CI/CD** — `ci.yml` (frontend+backend checks) y `deploy-frontend.yml` (auto-deploy a Workers en push a `main` con paths `frontend/**`). Backend con autoDeploy en Render.

**Los 4 gates del frontend están en verde**: `node --test` 80/80, `tsc --noEmit` 0, `eslint .` 0 errores, `next build` 28 rutas + `npm run cf:build` (OpenNext).

## Active Decisions And Considerations

- **Despliegue: SOLO Cloudflare Workers.** Cloudflare Pages quedó **abandonado**. Ver "Cloudflare Workers (CD de frontend)" en `systemPatterns.md` para el porqué y el estado de limpieza.
- **Compatibilidad Next ↔ OpenNext es una restricción dura.** No subir la versión de `next` sin verificar que `@opennextjs/cloudflare` conoce los manifiestos que esa versión genera. Detalle en `systemPatterns.md` → "Key Technical Decisions".
- **Diferido, NO tocar sin visto bueno del usuario**: (a) borrar el proyecto Pages `saas-catalogo`; (b) borrar el Worker huérfano `saas-catalogo`; (c) rotar las credenciales Cloudflare expuestas en el chat.
- Revisar el issue upstream **OpenNext #1355 / #1448** antes de任何 subida de Next. Cuando `@opennextjs/cloudflare` publique soporte para `preview-props.json`, se puede volver a 16.4+.

## Incidente resuelto: `1101` en Cloudflare Workers (2026-10-12)

### Síntoma
Toda ruta del frontend devolvía **`Error 1101`** de Cloudflare Workers. Solo `/api/v1/*` respondía, porque va por rewrite externo al backend de Render y nunca toca el bundle del Worker.

### Causa raíz
**Next 16.4.0** introdujo un manifiesto nuevo en el build: **`.next/server/preview-props.json`** (soporte de preview props en App Router).

`@opennextjs/cloudflare@1.20.10` tiene una **whitelist de manifiestos** que copia al generar el bundle del Worker
(`node_modules/@opennextjs/cloudflare/dist/cli/build/patches/plugins/load-manifest.js`). `preview-props.json` **no está en esa lista**.
Al importar `handler.mjs` en el Worker se produce:

```
Unexpected loadManifest(/.next/server/preview-props.json) call!
```

Ese `throw` mata el módulo en tiempo de arranque → Cloudflare responde **1101** en todas las rutas.

Issues upstream: **OpenNext #1355** y **#1448**. `@opennextjs/cloudflare@1.20.10` era ya la última versión disponible, así que **no había fix de dependencia**.

### Evidencia
| Versión | Apariciones de `preview-props.json` |
|---|---|
| Next **16.4.0** | 1 |
| Next **16.3.8** | **0** |

Verificación empírica tras el fix (build real):
- `preview-props.json` **no existe** en `.next/` ni en `.open-next/`.
- Manifiestos generados = **7**, todos en la whitelist: `app-paths`, `functions-config`, `middleware`, `next-font`, `pages`, `prefetch-hints`, `server-reference`.
- Única mención de "preview-props" en `handler.mjs` es el módulo interno `get-edge-preview-props.js` (inofensivo, no es el manifiesto).

### Solución aplicada
Degradar a **Next 16.3.8** (la última versión anterior al cambio). Pasos:

1. Regenerado `frontend/package-lock.json` con next 16.3.8 y restaurado `npm ci` en `ci.yml` y `deploy-frontend.yml` (commit `5dcb391`).
2. Instalación **offline** extrayendo `C:\Users\Luis\Desktop\next-16.3.8.tgz` a `frontend/node_modules/next` (npm se cuelga con árboles grandes en esta máquina; el proyecto ya usa instalación offline por diseño). Versiones alineadas: `next` 16.3.8, `@next/swc-win32-x64-msvc` 16.3.8, `@next/env` 16.3.8, react/react-dom 19.1.7, eslint 9.39.2, typescript 6.0.3, `@opennextjs/cloudflare` 1.20.10, wrangler 4.149.0.
3. **Fix de lint**: añadido `.open-next/**` a `globalIgnores` en `frontend/eslint.config.mjs` — antes eslint linteara los artefactos de build y daba 937 errores locales (en CI pasaba solo porque el checkout era limpio). Commit `74520b6`.
4. Revertido `frontend/next-env.d.ts` (artefacto del dev server que apuntaba a `.next/dev/types/`).

### Resultado
- **PR #5 fusionado** a `main` con merge commit **`1346f22`** (incluye `63204e9`, `5182378`, `5dcb391`, `74520b6`).
- **Deploy automático exitoso**: workflow `Deploy frontend a Cloudflare` run **`38309988424`**. Worker Version ID **`39e76e93-f64e-48ba-915d-0df034580062`**.
- **Producción verificada**: `/`, `/admin`, `/admin/login`, `/admin/juegos`, `/robots.txt`, `/sitemap.xml` → **200**. Sin `1101`, sin `loadManifest`. `/api/v1/health` → 200 JSON desde Render.

### Nota sobre la fidelidad de ChatGPT
El usuario confirmó que la fidelidad (feed Javier PC + admin Luismi Platform · Admin V2) **ya estaba íntegra en `main`**: todos los archivos de frontend (`styles/feed.css`, `feed/Catalog.tsx`, `feed/GameCard.tsx`, `globals.css`, `lib/admin/dashboardView.ts`) son **byte a byte idénticos** entre `origin/main` y `origin/feat/fidelidad-luismi-platform-javier-pc`. Solo diferían archivos de config/CI. **No hubo que traer nada** de esa rama.

## Project

### Important Directives
- **NO comentarios en el código.**
- **NO modificar `docs/`.**
- **NO commitear**: `.gitignore`, `backend/scripts/`, archivo `ADMIN`.
- PowerShell 5.1: sin `&&` (usar `;`); paths con espacios siempre entrecomillados.
- npm tiende a `ECONNRESET`/timeouts → el proyecto usa instalación offline (`tools/install-offline.ps1` + `vendor/`).
- `main` local puede quedar **desactualizado** respecto a `origin/main`; siempre hacer `git pull` antes de trabajar.
- Repo público `WwolfieLuisM/saas-catalogo`. `main` **sin protección de rama** → checks fallidos no bloquean merges.

### Credenciales seed (solo locales)
- `dev-admin` / `change-me-in-local-only` → SUPER_ADMIN
- `javier-admin` / `change-me-javier-local-only` → ADMIN

### URLs
- Frontend (vivo): `https://saas-catalogo-frontend.luisiking89.workers.dev`
- Backend (Render): `https://saas-catalogo-api.onrender.com`
- Pages (en desuso): `https://saas-catalogo.pages.dev`

### Workers en la cuenta Cloudflare
| Worker | Estado |
|---|---|
| `saas-catalogo-frontend` | **el vivo** (nuestro) |
| `saas-catalogo` | **huérfano**, sin dominios, subdominio desactivado → es el del check fallido `Workers Builds: saas-catalogo` |
| `moa-frontend`, `spring-lake-0bfe` | ajenos al proyecto |

## Next Steps

**Pendiente de decisión del usuario (NO tocar sin su visto bueno):**
1. Borrar el proyecto **Pages** `saas-catalogo` (ID `034b0836-eb79-431c-af4b-4107c678e7d3`, conectado al repo con `preview_deployment_setting: all`).
2. Borrar el Worker **huérfano** `saas-catalogo` (es el que hace fallar el check `Workers Builds: saas-catalogo`).
3. Rotar las credenciales Cloudflare expuestas en el chat (⚠️). GitHub secret `CLOUDFLARE_API_TOKEN` ya está seteado.

**Trabajo funcional pendiente:**
- Revisión manual del piloto IGDB (`correcto_SI_NO` en los CSV).
- Gap de config de contacto (`whatsapp`/`footer`/`publicName`) del admin al feed.
- OpenAPI/Swagger, store de rate limit compartido, revisar D1, Docker backend, monitoring.
