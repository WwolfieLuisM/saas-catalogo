# AGENTS.md — SaaS Catálogo (Javier PC)

Monorepo: **backend** (Express + Prisma + Neon Postgres + Cloudinary) y **frontend** (Next 16 + React 19).
Modelo: **biblioteca global** (`BaseGame` + `BaseGamePlatform` + `LibraryMedia`) y **ofertas por tenant** (`TenantGame`), con herencia de valor final (`resolveFinal`).

Plan vigente: `tasks/plan-detallado.md` · Estado: `tasks/todo.md` · Decisiones: `tasks/Decisiones-Arquitectonicas-v1.md` · Contexto de sesión: `memory-bank/activeContext.md`.

## 1. Skills: cargar antes de trabajar

Al recibir una tarea, identifica su fase con el árbol de `using-agent-skills` y **carga la skill correspondiente**. No es opcional: cada una codifica un proceso que evita un fallo concreto.

| Tipo de trabajo | Skills a cargar |
|---|---|
| **Cualquier implementación** | `incremental-implementation` + `test-driven-development` (RED primero, siempre) |
| **Decisión no trivial** (ramificación, invariantes, datos, concurrencia) | `doubt-driven-development` (revisor adversarial de contexto fresco) |
| **UI, páginas, componentes** | `frontend-ui-engineering` + `browser-testing-with-devtools` para verificar en runtime |
| **Contratos API, tipos, errores** | `api-and-interface-design` |
| **Bugs / algo roto** | `debugging-and-error-recovery` (reproducir → localizar → corregir → guardia) |
| **Datos no confiables** (importadores, descargas, media, uploads) | `security-and-hardening` |
| **Esquema / migraciones** | `deprecation-and-migration` (expandir y contraer) |
| **Antes de commitear** | `code-review-and-quality` + `code-simplification` |
| **Decisiones que marcan en el tiempo** | `documentation-and-adrs` → `tasks/Decisiones-Arquitectonicas-v1.md` |
| **Git** | `git-workflow-and-versioning` |

### Comportamientos no negociables (de `using-agent-skills`)

1. **Enuncia los supuestos** antes de implementar algo no trivial y da opción de corregirlos.
2. **Deténte ante la confusión**: si el plan y el código se contradicen, nombra la contradicción; no elijas en silencio.
3. **Empuja cuando toque**: si una decisión tiene un coste concreto, dilo con el número; la decisión es del usuario.
4. **Simplicidad**: si un staff engineer diría "esto eran 100 líneas, ¿por qué 1000?", rehazlo.
5. **Disciplina de alcance**: nada de refactors oportunistas ni de tocar lo que no es la tarea.
6. **Verifica, no supongas**: una tarea no está hecha hasta que hay evidencia (tests, build, runtime).

## 2. Reglas del proyecto

- **Sin comentarios en el código.**
- **No modificar `docs/`.** La documentación de trabajo vive en `tasks/`.
- **No commitear** `.gitignore`, `backend/scripts/` ni el archivo `ADMIN`.
- **No imprimir** `DATABASE_URL` ni secretos.
- **Sin push, deploy ni commit** sin permiso explícito del usuario.
- **No tocar** el proyecto Neon `Market-Place-Moa`.
- **Orden de escritura de operaciones de datos**: primero la biblioteca global, luego las ofertas de tenant. La biblioteca **nunca** escribe en tablas de tenant.

### Backend

- Los tests corren contra `fakeDb` (`tests/helpers/fakeDb.ts`), **nunca** contra la base de datos real.
- `npx eslint src tests` (el `npm run lint` del backend arrastra errores preexistentes de `backend/scripts/*.mjs`: **no tocarlos**).
- Errores de `tsc` conocidos y diferidos a Fase 6 (no son nuevos): `prisma/seed.ts`, `games.service.ts`, `data-transfer.service.ts` (3 errores `platformId`).
- Patron de rutas: `router.use(authenticate, requireRoles(...))`, validación Zod en la ruta, respuesta `{ success: true, data }`, `AppError` con código estable.

### Frontend

- Sistema de diseño en `src/styles/admin.css`: **reutiliza los tokens existentes** (`panel`, `hint`, `note`, `btn pri/sm`, `bd2 ok/wn/bd/au/in`, `stats/st`, `list/lh/li`, `details.fs`, `state`) y los componentes de `components/admin/ui.tsx`. No inventes colores, tonos ni clases.
- **Orden de la información**: respeta el de las pantallas hermanas (p. ej. en `configuracion/datos`: avisos → exportaciones → importaciones). La consistencia del orden importa tanto como la visual.
- Los tests son de **lógica pura** en `src/lib/**` con `node --test`. Los módulos importados por un test usan **extensión explícita** (`.ts`): `node --test` no resuelve el alias `@/`.
- Accesibilidad: elementos interactivos reales (`<button>`), `label` en inputs, estados vacío/cargando/error/permiso explícitos, y **nunca comunicar solo con color** (badge con texto).

### Frontend admin: reglas que/learn de los bugs de 2026-10-16

Estas cinco reglas nacen de bugs reales encontrados en navegador. No son estilo: cada una rompió algo.

1. **Nunca `fetch` crudo para llamar a la API del panel.** Usa siempre `adminFetch` / `adminFetchRaw` de `@/lib/admin/adminApi`. Razón: `ADMIN_API_BASE = '/api/v1'` y el rewrite de `next.config.ts` solo cubre `/api/v1/:path*`; un `fetch('/admin/...')` se va al origen de Next y devuelve **404**, no un error de API. Esto dejó **rotos** los botones de exportar catálogo y manifiesto, y todo el importador de catálogo (`page.tsx`). El test que cubría el prefijo probaba `adminApi`, no las funciones del componente: **test verde con la app rota**.
2. **Probar las funciones de los componentes, no solo el cliente.** Si un componente hace la llamada, necesita su propia prueba; si no es posible con `node --test`, queda explícitamente **verificado en navegador** en `tasks/todo.md`.
3. **`.brand` es una clase global de `feed.css`** (`height` fijo + `overflow:hidden`, pensada para el wordmark del sitio público). `admin.css` reutiliza ese nombre → colisión: la marca del admin se recortaba (caja 36px con 91px de contenido) tanto en el login como en el sidebar. Al tocar la marca del admin, **mide** caja vs contenido; no confíes en el aspecto. Regla vigente: `.adm .brand{height:auto;overflow:visible}`.
4. **Un solo contenedor de scroll.** `.app` es `height:100dvh;overflow:hidden`, `.main` scrollea, el sidebar es fijo y `.nav` lleva `min-height:0;overflow-y:auto;overscroll-behavior:contain`. Sin esto había scroll doble (página + sidebar) y la rueda movía los dos.
5. **Mide en el DOM, no a ojo.** `getBoundingClientRect`, `scrollHeight` vs `clientHeight`, `getComputedStyle`. Los tres bugs se detectaron en segundos; la inspección visual sola no los vio. En `chrome-devtools_evaluate_script` devuelve JSON, no print.

**Protocolo de revisión en navegador** (ver `tasks/ui-admin.md` para el detalle): backend en `:3000` (`npx tsx src/server.ts`), frontend en `:3001` con `NEXT_PUBLIC_API_URL=http://localhost:3000`, entrar como `javier-admin` **a mano** (nunca rellenar la contraseña con la herramienta: queda en la transcripción), y copiar los ficheros a subir a `C:\Users\Luis\AppData\Local\Temp\opencode\review\` porque `upload_file` solo acepta rutas del workspace.

### Entorno (PowerShell 5.1)

- Sin `&&`; usa `;` o `if ($?)`. Para rutas con espacios, comillas o el parámetro `workdir`; **nunca** `cd` inline.
- `rg` no existe: usa `Select-String`.
- `node -e` no funciona: escribe un fichero.
- **PROHIBIDO reescribir ficheros UTF-8 con PowerShell.** El peligro está en la **lectura**: `Get-Content -Raw` (y `Set-Content`) decodifican con el ANSI del sistema, y `WriteAllText` con `UTF8Encoding($false)` guarda después ese texto **ya corrupto como UTF-8 válido** — o sea que el fichero queda mal y no se ve ni un carácter roto. Pasos: usa `edit`/`write`, que preservan UTF-8. Si aun así hay que usar PowerShell, lee con `[System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8)` y **verifica** con `node scripts/check-encoding.mjs` antes de dar nada por bueno.
- **`scripts/check-encoding.mjs`** barre el repo buscando mojibake (Latin Extended, griego, cirílico, U+FFFD) y sale con código 1 si encuentra algo. Se ejecuta en `<raíz del repo>`. Está probado en las dos direcciones. Ejecútalo **siempre** que hayas tocado ficheros con acentos y antes de commitear.
- Ojo también con `Set-Location` + rutas relativas en llamadas .NET (`[System.IO.File]::WriteAllText`): ignoran la ubicación de PowerShell. Usa rutas absolutas.

## 3. Definition of Done

Una tarea está terminada cuando, y solo cuando:

1. Los **gates** pasan: backend `npx vitest run` + `npx tsc --noEmit` + `npx eslint src tests`; frontend `npm run typecheck` + `npm run lint` + `npm test` + `npm run build`; y `node scripts/check-encoding.mjs` sale con código 0.
2. **Sin regresiones**: los fallos nuevos se distinction de los preexistentes y están explicados.
3. El **comportamiento está verificado en runtime**, no solo "parece correcto".
4. **Documentado** lo que decida el futuro: decisiones en `tasks/Decisiones-Arquitectonicas-v1.md`, contratos en su fichero de `tasks/`, estado en `tasks/todo.md`.
5. Las **decisiones destructivas y los cambios de alcance** se han pedido antes, no después.