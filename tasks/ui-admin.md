# UI — mapa, hallazgos y trabajo futuro

> Alcance: **panel admin** y **feed público**. Creado 2026-10-16 tras la primera revisión real en navegador.
> Este documento **no** es una lista de sugerencias: es el mapa de la UI, lo que ya se sabe que está mal, y lo que queda para el trabajo conjunto de fase posterior.
> Las reglas que hay que cumplir al tocar la UI están en `AGENTS.md` (sección "Frontend admin: reglas que nacen de los bugs").

## 1. Mapa de la UI

### Panel admin (`frontend/src/app/admin`)

| Ruta | Pantalla | Notas |
|---|---|---|
| `/admin/login` | Login | Marca + formulario. Guarda contra rutas sin sesión |
| `/admin` | Dashboard | |
| `/admin/juegos`, `/admin/juegos/nuevo` | Catálogo del tenant | |
| `/admin/biblioteca` | Biblioteca base | Solo lectura para roles de tenant; filtros (género, plataforma, "en mi catálogo") |
| `/admin/categorias`, `/admin/generos`, `/admin/plataformas` | Taxonomías | `plataformas` contradice la decisión 6.1 (ver §3) |
| `/admin/media` | Multimedia | |
| `/admin/configuracion/catalogo` | Ajustes de catálogo | |
| `/admin/configuracion/precios` | Precios | |
| `/admin/configuracion/datos` | Exportaciones + importaciones | **Fase 5.5** (importar biblioteca) y flujo antiguo de importar catálogo |
| `/admin/configuracion/backups` | Backups | |
| `/admin/configuracion/multimedia` | Multimedia (config) | |

Layout: `(panel)/layout.tsx` → `.adm .app` (grid 276px + 1fr) con `.side` fijo y `.main` como único contenedor de scroll.

### Piezas relevantes

- `src/styles/admin.css` — sistema de diseño del admin (tokens y componentes reutilizables).
- `src/styles/feed.css` — estilos del **feed público**. Define `.brand` **global** (colisiona con el admin, ver §2).
- `src/components/admin/ui.tsx` — `PageHead`, `Badge`, `StateBox`, `CfgTabs`, etc.
- `src/lib/admin/adminApi.ts` — `adminFetch` / `adminFetchRaw` / `ADMIN_API_BASE`. **Única vía válida para llamar a la API del panel.**

### Feed público

- `src/lib/feed/useFeed.tsx` — carga del catálogo; tiene modo demo (`NEXT_PUBLIC_DEMO=true`) que **solo cubre el feed**, no el admin.
- El modo demo sirve para revisar el feed sin backend; **no** sirve para el panel.

## 2. Hallazgos de la revisión del 2026-10-16 (contexto: 5.5)

Verificados en navegador real (MCP chrome-devtools, Chrome 155, stack local).

### Corregidos

1. **API del panel sin prefijo (grave).** `page.tsx` usaba `fetch` crudo contra `/admin/export/catalog`, `/admin/export/media-manifest` y `/admin/import/validate`. El rewrite solo cubre `/api/v1/:path*`, así que los tres devolvían **404**. Los tests estaban verdes porque probaban `adminApi`, no el componente.
2. **Marca del admin recortada.** `.brand` global de `feed.css` (`height` fijo + `overflow:hidden`) aplicado al admin. Medido: caja 36px con 91px de contenido; el `<small>` se salía 41px. Afectaba a login y sidebar. Fix: `.adm .brand{height:auto;overflow:visible}`.
3. **Scroll doble.** Dos contenedores (página y sidebar) con la rueda moviendo ambos. Fix: `.app{height:100dvh;overflow:hidden}` + `.main` scrollea + `.nav{min-height:0;overflow-y:auto;overscroll-behavior:contain}`.

### Pendientes (backlog de UI)

- [ ] **Input de archivo sin estilos** en "Importar catálogo" (widget nativo, inconsistente con el sistema de diseño).
- [ ] **UUID crudo del tenant** en sidebar y cabecera ("Tenant actual: c5ce8dd1-…"). Debería mostrar nombre/slug.
- [ ] **Copy de "Plataformas"** dice "Pertenecen solo a tu negocio"; contradice la decisión 6.1 (plataformas globales + habilitación por `TenantPlatform`). Ajustar al implementar 7.1.
- [ ] **Deuda transitoria 6.2-A/B**: el copy de "Importar catálogo" dice "acepta el formato exportado arriba", pero el export emite `catalog@1` y el import solo admite `catalog@2`. El botón genera un fichero que se rechaza (con mensaje claro). Se cierra al migrar el export en 6.2-B.

## 3. Trabajo conjunto de UI (fase posterior)

Los pendientes de arriba son **pUNTOS sueltOS, no el trabajo real**. Lo relevante:

- El trabajo de UI es **de admin + feed juntos**: comparten sistema visual (tokens, tipografía, `.brand`, comportamiento de scroll) y cualquier cambio en uno afecta al otro.
- Antes de arreglar los puntos sueltos, conviene **acordar el trabajo de UI como bloque** (alcance, orden, criterio de "hecho"), porque los cuatro pendientes son cosméticas y cada uno solo; encajan mejor dentro de una pasada única.
- El panel admin está mucho más avanzado que el feed; el feed es el que tiene el trabajo grande.

## 4. Protocolo de revisión en navegador

1. Backend: `npx tsx src/server.ts` en `backend/` (puerto `:3000`; lee `backend/.env`).
2. Frontend: `next dev -p 3001` en `frontend/` con `NEXT_PUBLIC_API_URL=http://localhost:3000`.
3. **Entrar a mano** como `javier-admin` (credenciales en `backend/.env`). No rellenarlo con la herramienta del navegador: la contraseña queda en la transcripción.
4. Para probar subidas de fichero, copiar antes el fichero a `C:\Users\Luis\AppData\Local\Temp\opencode\review\` (`upload_file` solo acepta rutas del workspace).
5. Verificar con **medidas del DOM** (`getBoundingClientRect`, `scrollHeight` vs `clientHeight`, `getComputedStyle`), no solo a ojo: así se detectaron los tres bugs anteriores en segundos.
6. Al terminar, `tasks/todo.md` es la fuente de verdad de qué quedó verificado y qué no.