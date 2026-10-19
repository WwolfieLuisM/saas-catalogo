# UI — mapa, deuda y trabajo pendiente

> **Para qué sirve este documento:** es el encargo completo para quien trabaje la UI del panel de administración y el feed público. Está escrito para poder entregarse tal cual a otra herramienta o persona.
>
> **Alcance:** panel admin (`frontend/src/app/admin`) y feed público (raíz de `frontend/src/app`).
>
> **Regla de oro:** `docs/Javier-PC-Hybrid-Premium-Feed-v17-fab-fix.html` es la **referencia de diseño del feed**. El feed tiene que quedar igual que ese fichero, valor a valor. El panel admin **no** tiene referencia: se trabaja por criterio propio.
>
> **Última revisión:** 2026-10-17, con el stack local levantado y navegador real (MCP chrome-devtools).

---

## 1. Contexto mínimo para entrar

- Proyecto: SaaS multi-tenant de catálogo de videojuegos. Un tenant = un negocio (ej. "Javier PC"). El catálogo público es el feed; el panel admin es la gestión.
- **Los `BaseGame` son globales** (`tenantId: null`); los **géneros, categorías y plataformas también son globales**; cada tenant tiene un catálogo propio de ofertas que apunta a un `BaseGame` y a una plataforma.
- El tenant tiene **6 plataformas globales** que habilita o deshabilita mediante la tabla `TenantPlatform` (creada en la fase 7.1).
- Tailwind **no** se usa. El diseño vive en dos hojas escritas a mano: `frontend/src/styles/admin.css` (admin) y `frontend/src/styles/feed.css` (feed).
- Scripts: `npm run typecheck`, `npm run lint`, `npm test` (Node test runner), `npm run build`, `npm run cf:build`.

### Reglas que hay que cumplir

Están en `AGENTS.md`. Las que más afectan a la UI:

1. **No escribir estilos en línea** (`style={{...}}`). Todo va a la hoja de estilos.
2. **Probar en el navegador real**, no solo con tests. Los tests pasan mientras la pantalla está rota: ya pasó.
3. **Nada de comentarios en el código** salvo que se pidan.
4. No tocar `docs/` salvo para leer la referencia.

---

## 2. Estado verificado: las APIs

Consumidas las 20 rutas del backend (backend/src/modules/*). **El consumo está prácticamente completo.**

| Endpoint | Métodos | ¿Lo usa la UI? |
|---|---|---|
| `/admin/tenants` | GET, POST, GET/PATCH/DELETE `/:id` | Sí — **pero sin "Eliminar"** |
| `/admin/administrators` | GET, POST, GET/PATCH `/:id`, POST `/:id/revoke-sessions` | Sí |
| `/admin/dashboard` | GET | Sí |
| `/admin/sessions` | GET, DELETE `/:id` | Sí |
| `/admin/audit` | GET | Sí |
| `/admin/backups` | GET, POST, POST `/:id/restore` | Sí |
| `/admin/config` | GET, PATCH | Sí |
| `/admin/system` | GET | Sí |
| **`/admin/tenant-platforms`** | GET, POST, PATCH `/:platformId` | ❌ **CERO usos en todo el código** |
| `/admin/base-games` | GET, POST, GET/PATCH/DELETE `/:id`, POST `/:id/restore` | Sí |
| `…/base-games/:id/media` | GET, DELETE `…/cover` | Sí |
| `/admin/games` | GET, POST, GET/PATCH/DELETE `/:id`, POST `/:id/restore`, POST `/:id/duplicate` | Sí |
| `…/games/:id/media` | GET manifest, POST cover, DELETE cover, POST screenshots, DELETE screenshot, PATCH reorder | Sí |
| `/admin/media` | GET, GET audit, POST audit/check, POST scan | Sí |
| `/admin/pricing` | rules CRUD + `/preview` + `/apply` | Sí |
| `/admin/export` | GET catalog, GET media-manifest | Sí |
| `/admin/import` | POST validate, preview, backup, run | Sí |
| `/admin/library-import` | POST validate, POST import | Sí |
| `/api/v1/catalog` | GET `/`, `/version`, `/sync`, `/settings` | Sí |
| `/api/v1/auth` | POST login/refresh/logout, GET me | Sí |

### Pantallas que ya existen (23)

`login` · (raíz, dashboard) · `juegos` + `juegos/nuevo` + `juegos/[id]` + `juegos/[id]/editar` · `biblioteca` · `categorias` · `generos` · `plataformas` · `media` · `negocios` · `administradores` · `sesiones` · `auditoria` · `configuracion` + `catalogo` + `general` + `precios` + `datos` + `backups` + `multimedia` + `sistema`.

---

## 3. BLOQUE 1 — Tareas del plan con backend ya listo

Estas cuatro se aplazaron a propósito en su día para hacerlas en bloque, porque todas tocan el panel de negocios. **El trabajo real está aquí.**

### 3.1 · Fase 7.2 — Plataformas del negocio · **la más urgente**

- **Qué falta:** en la edición de un negocio, un checklist con las 6 plataformas globales y un interruptor de "habilitada".
- **Backend:** ya existe y está probado. `GET /admin/tenant-platforms` devuelve el estado; `POST` habilita; `PATCH /:platformId` actualiza. Sin consumidor.
- **Criterio de hecho:** se ve la lista de plataformas con su estado real, se puede cambiar, y al recargar sigue igual. Una plataforma deshabilitada **no** debe poder elegirse en la 7.3.
- **Dónde:** `frontend/src/app/admin/(panel)/negocios`, al editar un negocio. Necesario un endpoint nuevo de lectura del negocio con sus plataformas, **o**Compositionar la lectura con dos llamadas.

### 3.2 · Fase 7.3 — Filtro por plataformas habilitadas

- **Qué falta:** que biblioteca y catálogo puedan filtrar por plataformas habilitadas, y que el import de catálogo **rechace** ofertas en plataformas no habilitadas.
- **Ojo:** la segunda mitad no es UI, es validación en backend. Si se hace la UI sin la validación, el filtro miente.
- **Criterio de hecho:** el filtro solo ofrece plataformas habilitadas del tenant, y un import con una plataforma deshabilitada falla con un mensaje claro.

### 3.3 · Fase 8.2 — "Eliminar" separado de "Suspender"

- **Qué falta:** en `/admin/negocios` hay un botón "Suspender/Activar" y nada más. El `DELETE /admin/tenants/:id` existe y hace **borrado lógico** con auditoría desde la fase 8.1, pero **nadie lo llama desde la UI**.
- **Criterio de hecho:** "Eliminar" es un botón aparte, pide confirmación y deja el negocio oculto del listado, **no** lo borra. Debe quedar claro en la interfaz que es archivado, no destruido.

### 3.4 · Fase 8.3 — Selector de tenant global en la cabecera

- **Qué falta:** para SUPER_ADMIN no hay forma de cambiar de negocio. El tenant sale fijo en la cabecera y en el sidebar.
- **Backend:** ya hay lecturas de todos los tenants.
- **⚠️ Aviso de riesgo:** la cabecera del admin y la del feed comparten la clase global `.brand`. Tocar aquí **rompe el feed**. Hay que comprobar las dos pantallas después.

---

## 4. BLOQUE 2 — Deuda suelta

| # | Qué | Dónde | Nota |
|---|---|---|---|
| 1 | **Selector de archivo sin estilos** | Importar catálogo | Sale el widget nativo del navegador, ajeno al sistema de diseño |
| 2 | **UUID crudo del tenant** | Sidebar y cabecera | Sale `Tenant actual: c5ce8dd1-2bf7-…`. Debería ser nombre o slug |
| 3 | **Copy de "Plataformas"** | `/admin/plataformas` | Dice "Pertenecen solo a tu negocio", y es falso: son globales y el negocio solo las habilita |

---

## 5. BLOQUE 3 — Pendientes del feed

El feed se alineó con la referencia el 2026-10-17. Quedan tres cosas:

| # | Qué | Gravedad |
|---|---|---|
| 1 | **Miniaturas recortadas en "Mi colección"** | Visible. El póster se pinta a 138×186 dentro de una caja de 46px, así que sale cortado en vez de escalado |
| 2 | **Cortes 700px y 880px sin revisar** | **Lo más probable que dé sorpresas.** La fidelidad se verificó a 375, 574, 1020 y 1440. Los otros dos cortes de la referencia (`min-width:700px and max-width:899px` para tablet, `min-width:880px` para el `kbd` del buscador) **nunca se han mirado** |
| 3 | **Los requisitos empiezan por `"texto:"`** | **No es UI, es dato.** El catálogo entrega los requisitos como una cadena suelta con ese prefijo en lugar de `os`/`cpu`/`gpu`/`ram`. Se ve en Baldur's Gate 3; Celeste sí llega desglosado. Corregir en el generador (fase 10.1), no en la pantalla |

---

## 6. BLOQUE 4 — Ideas nuevas (propuestas, sin decidir)

Propuestas el 2026-10-17. **No están en el plan original.** Ninguna tiene decisión tomada.

### 6.1 · Control más amplio de la biblioteca desde SUPER_ADMIN

**Estado actual:** la biblioteca (`BaseGame`) es global, pero la pantalla `/admin/biblioteca` está montada sobre el tenant de quien está dentro. **SUPER_ADMIN no tiene ninguna vista que atraviese negocios.**

- **Duda 1:** ¿la vista global es solo de lectura para auditar, o también permite crear y editar juegos base?
- **Duda 2:** ¿se reutiliza `/admin/biblioteca` con un selector de tenant, o es una pantalla aparte?

### 6.2 · Importar desde biblioteca y poder seleccionar

**Esto ya existe**, a nivel de tenant: buscador, filtros por género y plataforma, "no está en mi catálogo", paginación y modal para añadir al catálogo.

- **Lo que falta de verdad** es la 7.2 (§3.1): sin el interruptor de plataformas habilitadas, un tenant puede añadir un juego en una plataforma que no tiene activa y nada se lo impide.

### 6.3 · Índice global de búsqueda por juego, en cada módulo

**Estado actual: no existe nada.** Se buscó en el backend y no hay `fulltext`, `tsvector`, `searchIndex` ni `globalSearch`: todos a cero. Hoy cada módulo busca por su cuenta con su propio `q`, y ninguno comparte criterio.

- **Duda 1 (la importante):** ¿un buscador único arriba que salte al módulo y al registro, o un comportamiento **idéntico dentro** de cada módulo (mismos atajos, misma query, mismos resultados)?
- **Duda 2:** ¿qué campos busca? Título y slug son seguros. ¿Desarrollador, editor, año, género, plataforma, código externo?
- **⚠️ Aviso técnico:** la base de datos **no tiene ningún soporte de búsqueda**: cero índice full-text, cero `tsvector`, cero trigram. Con 61 juegos no se nota. Si esto va en serio, hay que decidir si se busca en memoria o se añade un índice en base de datos, y eso **toca el esquema**: es una fase aparte, no un arreglo de interfaz.

---

## 7. Riesgos y trampas del código

Esto es lo que más caro sale si no se sabe de antemano:

1. **`feed.css` tiene reglas duplicadas y las posteriores pisan a las correctas.** Por eso `main` quedó a medias: el valor bueno estaba escrito y tres reglas después lo sustituían. **Un diff automático de CSS no sirve**: ve la declaración, no quién manda. Hay que comprobar en el navegador qué gana.
2. **`.brand` es una clase global compartida** entre el admin y el feed. Cualquier cambio ahí afecta a las dos pantallas.
3. **El optimizador de CSS de Next descarta `backdrop-filter`** si la línea sin prefijo va antes que la prefijada. Con el prefijo primero sobrevive. Ya pasó.
4. **El detalle y las tarjetas se montan en JSX, no solo en CSS.** El `.detail-actions` estuvo anidado dentro de `.detail-buy`, y eso lo mandaba a la misma línea. Un cambio de maquetación puede ser un problema de estructura.
5. **No existe `pages/_document.js`** porque el proyecto usa App Router. El aviso de lint de Next sobre fuentes es un **falso positivo**.
6. **Los tests pasan mientras la pantalla está rota.** Ya pasó tres veces: la API del panel daba 404 y los tests verdes.

---

## 8. Protocolo de verificación en navegador

1. Backend en `backend/` → puerto `:3000` (lee `backend/.env`).
2. Frontend en `frontend/` → `npm run dev -- -p 3001`, con `NEXT_PUBLIC_API_URL=http://localhost:3000`.
3. **Entrar a mano** como `javier-admin`. No rellenarlo con la herramienta del navegador: la contraseña se queda en la transcripción.
4. Para subir ficheros, copiarlos antes a `C:\Users\Luis\AppData\Local\Temp\opencode\review\`.
5. **Verificar con medidas del DOM**, no a ojo: `getBoundingClientRect`, `scrollHeight` contra `clientHeight`, `getComputedStyle`. Así se detectaron los bugs anteriores en segundos.
6. Al terminar, `tasks/todo.md` es la fuente de verdad de qué quedó verificado.

---

## 9. Orden sugerido

1. **7.2** — es la más clara: hay endpoint y no hay nada, y desbloquea la 7.3.
2. **7.3** — el filtro, *junto con* la validación en el import. La UI sin la validación miente.
3. **8.2** — botón "Eliminar". El backend ya está.
4. **8.3** — selector de tenant. **Comprobar el feed después.**
5. Bloque 2 (deudas sueltas) y Bloque 3 (feed).
6. Decidir el Bloque 4, que necesita las tres dudas respondidas antes de existir.