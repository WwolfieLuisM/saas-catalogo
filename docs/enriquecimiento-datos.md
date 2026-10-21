# Enriquecimiento de datos reales del catálogo (tamaños)

> **Idioma:** todo este documento y la documentación del proyecto van **en español** (convención
> fijada por el dueño del proyecto). Los mensajes de commit, en cambio, van sin acentos/ñ y sin
> comillas dobles (regla del repositorio).
>
> **Última actualización:** 2026-10-21.

## 1. Por qué existe este documento

En el SaaS **Luismi Platform** (`Saas Catalogo`) el **precio de un juego se deriva de su tamaño**:
las reglas de precio (`pricing`) evalúan `priceFor(sizeToGb(sizeValue, sizeUnit))` en CUP por GB.
Un juego **sin tamaño no puede fijar precio**, así que el tamaño es un dato de negocio, no
cosmético. La biblioteca base se rellena importando un JSON (`tasks/library-import-50.json`)
preparado a mano con metadatos de Steam/RAWG/IGDB, y **ni RAWG ni IGDB publican tamaño ni
requisitos de instalación** (son solo respaldo de descripción, géneros, desarrollador, año y
portada). Steam sí, y cuando el juego no está en Steam hay que ir a otras fuentes reales.

Este documento explica **lo que se hizo el 2026-10-21 para completar los tamaños que faltaban**
y **cómo repetirlo en futuras ocasiones**.

## 2. Detalles del proyecto que condicionan el trabajo

| Aspecto | Detalle |
| --- | --- |
| Repo | `D:\Desarrollo\Saas Catalogo` (monorepo `backend/` + `frontend/` + `tasks/` + `docs/`) |
| Backend | Node + Prisma (`npm test` = vitest sobre `fakeDb`, **TDD obligatorio**), `npm run typecheck`, `npm run lint` |
| Frontend | Next.js (`npm test` = node:test, `npm run typecheck`, `npm run lint`) |
| Despliegues | Push a `main`: **Render** (backend, sin filtro) + **Cloudflare Workers** (frontend, filtra `frontend/**`). Producción: `https://saas-catalogo-api.onrender.com`, `https://saas-catalogo-frontend.luisiking89.workers.dev` |
| Gate | `node scripts/check-encoding.mjs` **antes de cada commit** (falla si hay mojibake) |
| Commits | Mensaje **sin acentos/ñ y sin comillas dobles** |
| R5 | Los JSON grandes **los importa el usuario** desde Configuración → Datos: yo preparo, valido y commiteo; él importa |
| Secretos | Nunca imprimir contraseñas/claves; las credenciales siempre las pone el usuario. **Jamás tocar el proyecto Neon `Market-Place-Moa`** |
| Scripts locales | `backend/scripts/` está en `.gitignore` (validador, sanadores… viven solo en local). Los scripts **repetibles** van en `scripts/` raíz (junto al gate) |
| Ficheros | Todo se edita con `write`/`edit` en UTF-8; **nunca** reescribir UTF-8 con PowerShell |

## 3. La cadena de fuentes para el tamaño (orden de preferencia)

Regla de oro: **números con URL que los respalde; si no hay fuente, el tamaño se queda `null`**
(y el juego aparece en el aviso del dashboard «N juego(s) sin tamaño en la biblioteca»).

### 1ª — Steam (fuente oficial de tamaño y requisitos)

- **Buscar appid**: `https://store.steampowered.com/api/storesearch/?term=TERMINO&cc=US&l=en`
  → `items[].id` + `items[].name`. *Ojo:* solo devuelve juegos **en la tienda**; los delisted no
  aparecen.
- **Detalle**: `https://store.steampowered.com/api/appdetails?appids=ID&cc=US&l=en`
  → `data.pc_requirements` (puede ser **objeto**, **array** o **vacío**) con HTML
  `<li><strong>Storage</strong>: 7 GB available space</li>`.
- **Siempre verificar `data.name`**: un appid inventado devuelve otro juego
  (ej. `340330` no es Football Manager 2016, es *Deity Quest*).
- Ejemplo real: *Dino Crisis* `4249130` = 4 GB y *Dino Crisis 2* `4249140` = 2 GB → bundle = 6 GB.

### 2ª — PCGamingWiki (el mejor para clásicos y delisted)

- **La API está bajo `/w/`** (la raíz da 404):
  `https://www.pcgamingwiki.com/w/api.php?action=parse&page=TITULO&prop=wikitext&format=json`
- El tamaño aparece en los requisitos como **`|minHD = 17 GB`** (y `|recHD = …`). Buscar con
  regex `/\|\s*(?:min|rec)HD\s*=\s*([^\n|]+)/gi`.
- Las **notas** suelen dar oro: en *F.E.A.R.* aparece
  `{{note|The GOG version of "F.E.A.R. Platinum" takes up 15.6 GB.}}` → dato exacto para la
  ficha *F.E.A.R Platinum Collection*.
- **Búsqueda de página**: `action=query&list=search&srsearch=TITULO` y probar variantes de
  título (`Terminator:_Salvation`, `Ace Combat: Assault Horizon - Enhanced Edition`…).
- Ejemplos reales: Kingdom Wars 2: Battles = 5 GB · Football Manager 2016 = 3 GB ·
  Terminator: Salvation = 8 GB · Ace Combat AH Enhanced = 16 GB (recomendado 20).

### 3ª — Fuentes oficiales del juego

- **itch.io**: la página pública del proyecto muestra el tamaño real del ZIP en `file_size`
  (*Juegos Chiquitos* → `JuegosChiquitosWindows.zip` = **24 MB**).
- **FAQ oficial**: la propia web del juego. En `minecraft.net` la FAQ JSON-LD
  *«How Much Storage Do I Need for Minecraft on PC?»* responde: Java 2 GB mínimo / 4 GB
  recomendado, Bedrock 4/8 GB.
- **Páginas de requisitos de prensa**: *gamepressure* publica para *Fallout London*
  `<b>Storage</b>: 65 GB (including Fallout 4 base game)` (el mod solo son ~30-34 GB; el número
  elegido se explica en el `notes`).

### 4ª — Discos de consola (cuando el juego no es de PC)

- Wikipedia describe el formato: disco Wii *single-layer* = **4,7 GB** (*dual-layer* = 8,5 GB) y
  dice que *todos los juegos eran single-layer antes de Super Smash Bros. Brawl (2008)* →
  *Super Mario Galaxy* (2007) cabe en 4,7 GB. Citar esa cadena en el `notes` y bajar la
  confianza.

### 5ª — Agregadores de requisitos (solo como corrobora)

- `vgtimes.com` (daba 16 GB de Ace Combat AH, coincidiendo con PCGW), `systemrequirementslab`
  (CYRI), `gamerequirementslab`. Si dicen **«Storage Required: Not verified»** → **no sirve**
  como fuente.

### 6ª — RAWG / IGDB: jamás dan tamaño

Solo descripción, géneros, desarrollador, editorial, año y portada. Si no está en Steam, RAWG ni
IGDB resuelven el tamaño; van a pelear solo por los metadatos.

### Buscadores web (estado el 2026-10-21)

- El `websearch` nativo devolvió **HTTP 403** durante toda la sesión → no confiar en él.
- Funcionó: **`https://lite.duckduckgo.com/lite/?q=…` vía `webfetch`** (tras unas consultas
  seguidas sale captcha de patito → parar y esperar).
- Frágiles: Bing y Mojeek en crudo (regex de resultados que cambian), `steamdb.info` (403
  Cloudflare), webs pequeñas con DNS bloqueado.

## 4. Regla de procedencia (`provenance`)

Cada tamaño relleno lleva su procedencia en la **variante** (`platformVariants[].provenance`),
con esquema estricto (`strictObject` — un campo extra rompe la validación):

```json
"provenance": {
  "source": "pcgamingwiki",
  "sourceUrl": "https://www.pcgamingwiki.com/wiki/Kingdom_Wars_2:_Battles",
  "confidence": 0.9,
  "ingestedAt": "2026-10-21",
  "notes": "Tamaño mínimo 5 GB según PCGamingWiki (Kingdom Wars 2: Battles); Steam KW2 Definitive Edition también pide 5 GB. La descripción y los géneros vienen de RAWG."
}
```

- `source` (≤50), `sourceUrl` (URL), `confidence` 0–1 (**< 1 = aproximado**, obligatorio para que
  se distinga de un dato oficial de Steam), `ingestedAt` (`YYYY-MM-DD`), `notes` (≤300).
- El tamaño se escribe **a nivel de registro y de variante** (`sizeValue` + `sizeUnit` en ambos).
- `sizeValue` debe ser **positivo** (`z.number().positive().max(100000)`) y `sizeUnit` ∈
  `MB|GB|TB`. **Se conserva la unidad original** (24 MB se queda en MB): la conversión a GB es
  decimal (`/1000`) y la hace la UI (`fmtSize`).
- El registro **no admite** `provenance` (solo la variante).

## 5. Contexto técnico: el «0 GB» y el aviso del dashboard

- `BaseGame.sizeValue Float` y `sizeUnit` **no admiten null** (schema Prisma), así que el
  importador guarda un **centinela 0** cuando no hay tamaño conocido.
- El traductor es `presentSize()` en `backend/src/modules/games/game.shared.ts`: al serializar
  (`baseGameDto`, `tenantGameDto` y `resolved`) un `sizeValue ≤ 0` se devuelve como `null` → la
  UI pinta **«—»** y no «0 GB». En el frontend, `fmtSize()` (`frontend/src/lib/admin/format.ts`)
  formatea o dibuja el guion.
- El dashboard calcula `gamesWithoutSize` (`baseGame.count` con `sizeValue: { lte: 0 }` y
  `deletedAt: null`) y la sección *Requiere atención* pinta
  «N juego(s) sin tamaño en la biblioteca → Completar» (enlace a `/admin/biblioteca`).
- Nada se bloquea (decisión del dueño): **solo se hace visible el pendiente**.

## 6. Flujo operativo para futuras ocasiones

1. **Listar** las fichas sin tamaño del JSON (leer `tasks/library-import-50.json` con Node o
   PowerShell en modo lectura y filtrar `sizeValue == null`, o mirar la API
   `GET /admin/base-games?limit=100` desde la sesión del navegador).
2. **Comprobar en la BD** qué juegos sin tamaño hay realmente (el dashboard lo cuenta): un
   juego puede ya tener tamaño **puesto a mano** → en ese caso **no** se rellena en el JSON,
   porque `resolveMergedSize()` da prioridad al valor del fichero y **lo pisaría**. Un
   `sizeValue: null` en el fichero **conserva** el valor existente.
3. **Bajar la cadena de fuentes** (sección 3) hasta encontrar un número con URL. Sin fuente →
   se deja `null` y se anota en el pendiente de la sección 8.
4. **Añadir la entrada** en la tabla `TABLA` de `scripts/completar-tamanos.mjs`
   (`{ sizeValue, sizeUnit, source, sourceUrl, confidence, notes }`).
5. **Ejecutar**: `node scripts/completar-tamanos.mjs` → pinta `actualizados: N` y omite los que
   ya tienen tamaño (es idempotente).
6. **Validar**: `cd backend && npx tsx scripts/validar-import-50.ts` → debe terminar en
   `RESULTADO: VALIDO — 50 registros listos para importar` (y revisar la línea `tamano NN/50`).
7. **Gate + commit + push**: `node scripts/check-encoding.mjs`, commit sin acentos, `git push`.
8. **El usuario reimporta** desde Configuración → Datos (R5). La importación:
   - aplica los tamaños (valor del fichero gana; `null` conserva el existente);
   - recalcula `status` (con tamaño > 0 la ficha deja de estar `INCOMPLETE`);
   - refresca las copias de descripción/requisitos del catálogo (`syncCatalogCopies`) y muestra
     el aviso «Se alinearon… N juegos».

## 7. Resultado del 2026-10-21

Cobertura del JSON: **tamaño 48/50** (antes 39/50) · validador en `VALIDO`.

| slug | tamaño | fuente | conf |
| --- | --- | --- | --- |
| kingdom-wars-2-battles | 5 GB | PCGamingWiki (minHD; Steam KW2 DE coincide) | 0.9 |
| f-e-a-r-platinum-collection | 15.6 GB | PCGamingWiki (nota de la versión GOG Platinum) | 0.85 |
| super-mario-galaxy | 4.7 GB | Wikipedia (disco Wii single-layer; juego de 2007) | 0.7 |
| ace-combat-assault-horizon-enhanced-edition | 16 GB | PCGamingWiki (minHD; vgtimes corrobora) | 0.9 |
| chiquitos | 24 MB | itch.io (tamaño real del ZIP oficial) | 0.9 |
| fallout-london | 65 GB | gamepressure (Storage incl. Fallout 4 base game) | 0.7 |
| minecraft-juego-base | 4 GB | FAQ oficial de minecraft.net (Java recomendado) | 0.7 |
| dino-crisis-bundle | 6 GB | Steam (Dino Crisis 4 GB + Dino Crisis 2 GB) | 0.95 |
| terminator-salvation | 8 GB | PCGamingWiki (minHD) | 0.9 |

Los dos que quedaron **a propósito** en `null`:

- **football-manager-2016**: ya tiene tamaño **puesto a mano en la base** (la BD lo cuenta con
  tamaño aunque el JSON diga `null`); no se rellena para no pisar ese valor.
- **starless-abyss**: el desarrollador **no publica requisitos de almacenamiento** (Steam
  `pc_requirements` vacío, gamerequirementslab «Not verified», CYRI sin storage, sin web
  propia accesible). Queda pendiente (sección 8).

## 8. Pendientes

- **starless-abyss**: reintentar cuando publiquen requisitos (o medir a mano la instalación y
  rellenarlo en la biblioteca). Mientras tanto: es el 1 que queda en el aviso del dashboard.
- **football-manager-2016**: comprobar en la biblioteca qué valor tiene a mano y, si procede,
  reflejarlo también en el JSON para que el fichero refleje la realidad completa.
- Si `tasks/library-import-50.json` vuelve a enriquecerse con Steam/RAWG, repetir la sección 6
  para que ningún fichero entre sin tamaño.

## 9. Comandos de referencia

```bash
# Completar tamaños (idempotente, tabla en scripts/completar-tamanos.mjs)
node scripts/completar-tamanos.mjs

# Validar el JSON contra el esquema real de importación
cd backend && npx tsx scripts/validar-import-50.ts

# Gate obligatorio antes de cada commit
node scripts/check-encoding.mjs

# Suites y comprobaciones
cd backend && npm test && npm run typecheck && npm run lint
cd frontend && npm test && npm run typecheck && npm run lint
```
