# Prompt canónico del generador — `library-import@2`

> **Estado:** vigente. Sustituye a `backend/scripts/library-import-prompt.md` (v1, escrito contra `@1`) y a `backend/scripts/library-import-prompt-paso2.md` (obsoleto).
>
> **Autoridad:** `tasks/library-import-contrato.md`. Este prompt **no puede contradecirlo**. Ante cualquier duda, manda el contrato.
> **Destinatario:** la otra OC, que regenera el piloto. **Entrada:** `backend/scripts/library-import.json` (v1, 50 registros) + `backend/scripts/library-import-informe.md`.
> **Salida:** un JSON nuevo que pase `POST /api/v1/admin/library-import/validate` sin errores de registro.

---

## 0. Lo que cambió respecto a la v1 y por qué

Estos cinco puntos son **errores reales de la pasada anterior**. No los repitas:

1. La v1 emitía `schema: "library-import@1"`. El contrato **rechaza el archivo entero con 400**. Ahora: `library-import@2`.
2. La v1 emitía `status` por registro. En `@2` el estado **se deriva**, nunca se escribe. Un campo `status` es error de registro.
3. La v1 emitía `platformSlugs: ["pc","switch"]`. Ese campo **ya no existe**. Ahora: `platformVariants: [{ platformSlug: "pc" }, ...]`, **obligatorio, mínimo 1**.
4. La v1 decía *"si hay mínimos y recomendados, usa el de instalación típica"*. Eso es exactamente lo **prohibido**: el dato de requisitos de store no es el tamaño. De ahí salieron los 32 tamaños falsos del piloto actual.
5. La v1 fusionaba juegos con el mismo nombre. `@2` no fusiona nada: la identidad es el `slug`, y **slug repetido = error de registro**.

---

## 1. Objetivo

Generar el JSON del piloto con estas tres Properties:

- **P1 — Corrección del tamaño.** Cada `sizeValue`/`sizeUnit` procede **solo** de una fuente que publica el tamaño real de descarga de *ese* producto en *esa* plataforma. Donde no exista ese dato, el par de campos **se omite**.
- **P2 — Un solo producto por registro.** Fuera.expand/OST/DLC/secuela/remaster/portada-smarter. No son "el mismo juego": son **productos distintos** y su tamaño no es el del juego base.
- **P3 — Taxonomía cerrada.** Solo los 14 géneros, 8 categorías y 6 plataformas del seed. Cualquier otro slug es error de registro.

---

## 2. Forma del archivo (obligatoria)

```json
{
  "schema": "library-import@2",
  "generatedAt": "2026-10-17T00:00:00.000Z",
  "source": "<procedencia, máx. 300 chars>",
  "games": [ { "...": "un registro por JUEGO (no por plataforma)" } ]
}
```

- `schema` **exactamente** `"library-import@2"`.
- Campos extra en el envelope → **rechaza el archivo entero (400)**. Solo esos cuatro.
- Máximo 5000 registros; el tamaño práctico por importación es ~500.
- `generatedAt` y `source` son opcionales. Ponlos: `source` queda en el `AuditLog`.

---

## 3. Registro de juego — campos exactos

Un registro = **un juego**. Sus plataformas viven dentro, en `platformVariants`. No crees un registro por plataforma.

| Campo | Obligatorio | Regla |
|---|---|---|
| `title` | **Sí** | 2–150 chars |
| `slug` | **Sí** | `^[a-z0-9]+(?:-[a-z0-9]+)*$`, **3–50**. minúsculas, sin acentos, guiones internos. Es la identidad del upsert |
| `platformVariants` | **Sí** | Array **1–20** (§4) |
| `description` | No | ≤5000. Ausente/vacío → no será `ACTIVE` |
| `releaseYear` | No | entero 1970–2100 |
| `developer` | No | ≤150 |
| `publisher` | No | ≤150 |
| `keywords` | No | ≤**500** chars |
| `categorySlug` | No | Uno de los 8 de §5.2 |
| `genreSlugs` | No | Array de los 14 de §5.1 |
| `sizeValue` | No | número >0, ≤100000. **Siempre en pareja** con `sizeUnit` |
| `sizeUnit` | No | `"MB"` \| `"GB"` \| `"TB"`. Solo esos tres |
| `coverUrl` | No | URL **https** |
| `minimumRequirements` | No | objeto estricto, 6 claves (§6) |
| `recommendedRequirements` | No | objeto estricto, 6 claves (§6) |

**Campos prohibidos.** Cualquiera de estos hace fallar el registro (`strictObject`):

`status` · `id` · `origin` · `platformSlugs` · `price` / `priceMode` / cualquier `price*` · `availability` · `baseGameSlug` · `tenantId` · `category` como objeto · `genres` como objetos · `notes` a nivel de juego · binarios · `null` dentro de arrays.

**No existe ninguna forma de "marcar" un registro como incompleto.** La ausencia del campo **es** la marca. No escribas `status`, ni `PENDING_ENRICHMENT`, ni notas.

---

## 4. `platformVariants[]` — obligatorio

Cada variante describe **una** plataforma. La plataforma se declara con `platformSlug`; **no hay slug propio por variante**.

```json
"platformVariants": [
  {
    "platformSlug": "pc",
    "sizeValue": 35,
    "sizeUnit": "GB",
    "minimumRequirements": { "cpu": "…", "gpu": "…", "ram": "4 GB", "os": "Windows 10", "directX": "11", "storage": "35 GB" },
    "provenance": {
      "source": "steam",
      "sourceUrl": "https://store.steampowered.com/app/1145360/Hades/",
      "confidence": 0.97,
      "ingestedAt": "2026-10-17",
      "notes": ""
    }
  },
  { "platformSlug": "switch" }
]
```

Reglas:

- **Mínimo 1, máximo 20.** Sin variantes → error de registro.
- Slugs permitidos (y **solo** estos): `pc` · `ps5` · `ps4` · `xbox-series-x` · `xbox-one` · `switch`.
- **`platformSlug` repetido en el mismo registro → error de registro** (`PLATFORM_VARIANT_DUPLICATE`).
- Dentro de una variante: `platformSlug` (sí), `sizeValue`/`sizeUnit` (pareja), `minimumRequirements`, `recommendedRequirements`, `provenance`. Nada más.
- **`provenance.source` es obligatorio** dentro del objeto (1–50 chars). Opcionales: `sourceUrl`, `confidence` (0–1), `ingestedAt` (`YYYY-MM-DD`), `notes` (≤300). Clave extra → error.
- Si no tienes dato real de una plataforma, emite `{ "platformSlug": "ps5" }` a secas. Es válido.

---

## 5. Taxonomía — diccionario cerrado

**Nunca inventes taxonomía.** El import no crea filas. Un slug desconocido es **error de registro** (`TAXONOMY_CATEGORY_UNKNOWN` / `TAXONOMY_GENRE_UNKNOWN` / `TAXONOMY_PLATFORM_UNKNOWN`).

### 5.1 Los 14 géneros (exactos)
`arcade` · `aventura` · `carreras` · `cartas` · `deportes` · `estrategia` · `indie` · `lucha` · `musica` · `plataformas` · `puzzle` · `rol` · `shooter` · `simulacion`

### 5.2 Las 8 categorías (exacto, máximo una por juego)
`accion` · `aventura` · `deportes` · `puzzle` · `rol` · `sigilo` · `simulacion` · `terror`

> **Ojo con el error de la v1:** `accion` y `terror` son **categorías, no géneros**. `roguelike` **no existe** como género. Para un roguelike: `genreSlugs: ["indie","rol"]`, `categorySlug: "accion"`.

Si un juego no encaja limpiamente en ninguna categoría, **omite `categorySlug`**. No fuerces el más parecido.

---

## 6. Requisitos

Objetos **estrictos** con estas 6 claves y solo estas:

`cpu` · `gpu` · `ram` · `os` · `directX` · `storage`

Una 7.ª clave → error de registro.

- **`recommendedRequirements` nunca se copia de `minimumRequirements`.** Si la fuente solo da mínimos, emite **solo** `minimumRequirements` y omite `recommended`. Autocompletar destruiría requisitos curados y el importador lo prohíbe explícitamente.
- Por tarea 10.1, los requisitos van **en la variante `pc`**, cuando la fuente los publique para PC. Para variantes de consola, omítelos si no tienes dato real de esa plataforma.

---

## 7. Tamaños — la regla que más se incumplió

### 7.1 Fuentes autorizadas (y solo estas)

El tamaño se emite **únicamente** si una fuente pública **el tamaño de descarga real de ese producto en esa plataforma**:

| Plataforma | Fuente válida |
|---|---|
| `pc` | Steam / GOG / Epic: campo de **tamaño de instalación o descarga** (no el de "requisitos") |
| `ps5` / `ps4` | PlayStation Store: tamaño de descarga |
| `xbox-series-x` / `xbox-one` | Microsoft Store: tamaño de instalación |
| `switch` | eShop: tamaño de descarga |

### 7.2 Prohibiciones absolutas

**No emitas** un `sizeValue`/`sizeUnit` si el número viene de:

- ❌ Los **requisitos de sistema** de un store (`minimum.Storage`, `recommended.Storage`, "Espacio de almacenamiento: X GB"). Esto es un requisito de instalación, **no** el tamaño de descarga. Es el error que contaminó los 32 registros de la pasada anterior.
- ❌ La ficha de **otro producto**: DLC, expansión, edición, pack, soundtrack/OST. Aunque compartan nombre y carátula, el tamaño es distinto.
- ❌ Una estimación, un promedio, un rango convertido a número, o un valor por defecto.
- ❌ Una unidad que no sea `MB`, `GB` o `TB`. No conviertas bytes ni KB sin fuente que lo pida; si la fuente da bytes, omite el par.

### 7.3 Si no hay dato

**Omite `sizeValue` y `sizeUnit`** (en el registro y en todas sus variantes). No es un error: el importador guarda `0/GB` solo al crear, deriva `INCOMPLETE`, y el cierre previsto es el enriquecimiento manual. Un `INCOMPLETE` honesto es mejor que un `ACTIVE` con un dato falso.

- `sizeValue` sin `sizeUnit` (o al revés) → error `SIZE_PAIR_INVALID`. Los dos o ninguno.
- El tamaño efectivo para el estado se toma del **primer `platformSlug` presente en este orden que tenga tamaño**:
  `pc > ps5 > ps4 > xbox-series-x > xbox-one > switch`
  Ninguna otra variante cuenta.
- Al actualizar un juego que ya existe, si no aportas tamaño, **se conserva el suyo**. No lo pises con `0`.

---

## 8. P2 — Qué entra y qué no (un producto por registro)

### 8.1 Principio

El piloto v1 contiene productos que **no son el juego base**: soundtracks, DLC y ediciones. No se pueden borrar a ciegas por el nombre: hay casos dudosos que **tú debes verificar contra la fuente real** y decidir uno por uno.

### 8.2 Candidatos a verificar

**A. Confirmados como producto distinto** — están mal etiquetados, el slug y el título NO los delatan. El único indicio es el tamaño:

| slug | Tamaño en v1 | Producto real |
|---|---|---|
| `earthlock-festival-of-magic` | 300 MB | **OST / banda sonora** de *Earthlock: Festival of Magic* |
| `hard-west-scars-of-freedom` | 3 GB | **DLC** *Hard West: Scars of Freedom* |

> **Heurística de detección:** un juego completo completo pesa decenas de GB, no cientos de MB. Si el tamaño del registro es **implausiblemente pequeño** para un juego de ese tipo, es casi seguro que el producto no es el juego base. Contrasta siempre el tamaño con el de la fuente.

**B. Probablemente ediciones o derivados** — verifica contra la fuente si el juego base (sin sufijo) ya está en el piloto:

`ace-combat-assault-horizon-enhanced-edition` · `dead-island-riptide-definitive-edition` · `edge-of-twilight-return-to-glory-chapter-1` · `steel-seed-deluxe-edition` · `wasteland-3-digital-deluxe-edition` · `darksiders-ii-deathinitive-edition`

### 8.3 Dudosos — **no los borres sin comprobar**

| slug | Razón |
|---|---|
| `kick-beat-steam-edition` | "Steam Edition" es a menudo el **nombre comercial del mismo juego** en Steam, no una edición aparte. Probablemente **se conserva**. |
| `mark-of-the-ninja-remastered` | El remaster **sustituye** al original. Si el original no está en el piloto, este **es** el juego de facto. Probablemente **se conserva**. |

### 8.4 Criterio

Para cada candidato:
- **Se conserva** si es el mismo producto que el juego base (mismo nombre de producto en la fuente, aunque el rótulo comercial lleve "Edition"/"Remastered").
- **Se excluye** si es un producto **distinto**: soundtrack/OST, DLC, pack, expansión, capítulo, capítulo de historia, o una edición cuyo original **también** está en el piloto.

**La prueba definitiva es la ficha de la fuente, no el título.** Si la fuente dice que la página es un álbum, es un álbum aunque se llame igual que el juego.

Cuando excluyas un registro, **su `slug` desaparece del archivo**. Como la identidad es el `slug`, dejarlo importaría el producto que quieres excluir. Si lo excluyes y el juego base **sí** está en el piloto, el base conserva sus plataformas y su tamaño reales.

---

## 9. Dedup — la identidad es el `slug`

- Un `slug` **repetido dentro del archivo** → la 2.ª+ son error de registro (`DUPLICATE_SLUG_IN_FILE`). El resto del archivo sigue procesándose.
- **No fusiones por nombre.** Dos juegos con el mismo nombre y distinto slug son, para el contrato, dos juegos distintos.
- No dedupliques por título normalizado, ni "combines" registros. El `@2` no tiene fusión.

---

## 10. Portadas

- `coverUrl` debe ser **https**. `http://`, `javascript:`, `data:` y `file://` se rechazan.
- Hosts válidos: `images.igdb.com`, `media.igdb.com`, `steamstatic.com`, `store.playstation.com`, `media.xbox.com` y sus subdominios. Un host fuera de esa lista **no se descarga**, pero el juego **se importa igual**.
- Si una URL no carga, **déjala**: `validate` solo comprueba forma, la descarga es de `import`, y un fallo deja `LibraryMedia` en `ERROR`, reintentable en la siguiente importación. No descartes la portada por no haberla podido comprobar.
- Si no tienes ninguna URL fiable, **omite `coverUrl`**. Sin portada el juego tampoco será `ACTIVE`.

---

## 11. Ejemplo canónico válido

```json
{
  "schema": "library-import@2",
  "generatedAt": "2026-10-17T09:00:00.000Z",
  "source": "piloto v2 — 50 registros revalidados contra Steam/PS/Xbox/eShop",
  "games": [
    {
      "title": "Hades",
      "slug": "hades",
      "description": "Roguelike de acción por las puertas del inframundo.",
      "releaseYear": 2020,
      "developer": "Supergiant Games",
      "publisher": "Supergiant Games",
      "keywords": "roguelike, accion, inframundo",
      "categorySlug": "accion",
      "genreSlugs": ["indie", "rol"],
      "sizeValue": 15,
      "sizeUnit": "GB",
      "coverUrl": "https://images.igdb.com/igdb/image/upload/t_cover_big/co2w6y.jpg",
      "minimumRequirements": { "cpu": "Intel Core i5-750", "gpu": "GeForce GTX 750 Ti", "ram": "4 GB", "os": "Windows 7 64-bit", "directX": "11", "storage": "15 GB" },
      "recommendedRequirements": { "cpu": "Intel Core i3-6100", "gpu": "GeForce GTX 1060", "ram": "8 GB", "os": "Windows 10 64-bit", "directX": "11", "storage": "15 GB" },
      "platformVariants": [
        {
          "platformSlug": "pc",
          "sizeValue": 15,
          "sizeUnit": "GB",
          "minimumRequirements": { "cpu": "Intel Core i5-750", "gpu": "GeForce GTX 750 Ti", "ram": "4 GB", "os": "Windows 7 64-bit", "directX": "11", "storage": "15 GB" },
          "provenance": { "source": "steam", "sourceUrl": "https://store.steampowered.com/app/1145360/Hades/", "confidence": 0.98, "ingestedAt": "2026-10-17" }
        },
        {
          "platformSlug": "switch",
          "sizeValue": 3.5,
          "sizeUnit": "GB",
          "provenance": { "source": "nintendo", "confidence": 0.9, "ingestedAt": "2026-10-17" }
        }
      ]
    },
    {
      "title": "Juego sin tamaño",
      "slug": "juego-sin-tamano",
      "description": "Descripción presente, tamaño no publicado por ninguna fuente.",
      "genreSlugs": ["indie"],
      "platformVariants": [ { "platformSlug": "pc" } ]
    }
  ]
}
```

El primero acaba `ACTIVE`; el segundo, `INCOMPLETE`. Ambos son correctos.

---

## 12. Checklist antes de entregar

Ejecuta esto sobre tu propio JSON. Un fallo aquí es un error de registro en el import.

- [ ] `schema` es exactamente `library-import@2`.
- [ ] **Ningún** registro tiene `status`, `platformSlugs`, `id`, `origin`, `price*`, `availability`, `notes` ni claves desconocidas.
- [ ] **Todos** los registros tienen `platformVariants` con 1–20 elementos.
- [ ] Ningún `platformSlug` está repetido dentro de un mismo registro.
- [ ] Todos los `platformSlug` ∈ {`pc`,`ps5`,`ps4`,`xbox-series-x`,`xbox-one`,`switch`}.
- [ ] Todos los `genreSlugs` ∈ los 14; todos los `categorySlug` ∈ los 8.
- [ ] `sizeValue` y `sizeUnit` van **siempre juntos**, o no van.
- [ ] **Ningún** tamaño procede de `Storage` de requisitos, ni de un DLC/OST/edición.
- [ ] `recommendedRequirements` no es copia de `minimumRequirements`.
- [ ] Los objetos de requisitos tienen **solo** las 6 claves.
- [ ] No hay slug repetido en el archivo.
- [ ] Cero OST, DLC, expansiones, ediciones ni remastered — **y cada candidato de §8 está adjudicado y reportado**.
- [ ] Todas las portadas son https y de hosts válidos.
- [ ] `schema`, `generatedAt`, `source`, `games` son los únicos campos del envelope.

## 13. Verificación final (obligatoria)

Entrega el JSON y, después de escribirlo:

1. **Valida en local**: `POST /api/v1/admin/library-import/validate` con el archivo.
2. Criterio de aceptación de la 10.1: **`summary.error == 0`** — ningún error de registro.
3. Si hay errores de registro, **corrige el archivo** y repite. No entregues un JSON con errores de registro.
4. Reporta en tu respuesta: nº de juegos, nº de `INCOMPLETE` esperados (los que se quedan sin tamaño), nº de juegos a los que has tenido que quitar tamaño por no tener fuente real, y **una línea por cada candidato de §8 con tu decisión y la fuente que lo confirma** (conservado / excluido).

Un registro con `INCOMPLETE` no es un fallo. **Un `ACTIVE` con un tamaño inventado sí lo es.**