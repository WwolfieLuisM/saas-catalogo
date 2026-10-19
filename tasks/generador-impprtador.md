# Generador e importador de catálogo — Fase 10

> Contrato de autoridad: `tasks/library-import-contrato.md` (`library-import@2`).
> **Prompt canónico vigente: `tasks/generador-prompt-v2.md`.**

## Estado

- [ ] **10.1** Regenerar piloto contra `library-import@2`
- [ ] **10.2** Validar e importar el piloto completo

## Decisiones de la 10.1

- **El prompt se versiona en `tasks/`, no en `backend/scripts/`.** `library-import-prompt.md` (v1) y `library-import-prompt-paso2.md` quedan **obsoletos**: estaban escritos contra `@1` y habrían producido un archivo rechazado con 400. El prompt nuevo vive junto al contrato porque es documentación, no artefacto de ejecución; `backend/scripts/` sigue sin versionarse.
- **El contrato manda.** El prompt codifica sus reglas; no las sustituye. Ante conflicto, `library-import-contrato.md` gana.
- **La selección de juegos cambia** (requisito 10.1): fuera OST, DLC, expansiones, ediciones y remastered. Es contradictorio con los invariantes de la v1 ("mismos 50, mismos slugs, no dedupliques"), por eso el paso 2 se reescribe desde cero en vez de parchearse.
- **Taxonomía cerrada**: 14 géneros, 8 categorías y 6 plataformas del seed (`prisma/seed.ts`, aprobado 2026-10-15). El generador no crea taxonomía.

## Errores reales que la pasada anterior cometió

Estos no son hipotéticos: están en `library-import.json` v1 y en `library-import-informe.md`.

| Error | Consecuencia | Corrección en v2 |
|---|---|---|
| `schema: library-import@1` | 400, archivo entero rechazado | `@2` |
| `status` por registro | error por registro (`strictObject`) | se elimina; el estado se deriva |
| `platformSlugs: [...]` | error por registro | `platformVariants[]` obligatorio |
| Sin `platformVariants` | los 50 registros fallarían | obligatorio, 1–20 |
| Tamaño tomado de `pc_requirements.minimum.Storage` | 32 tamaños falsos; todos marcados `ACTIVE` | solo fuente de tamaño real de descarga |
| `earthlock-festival-of-magic` (300 MB) | es el **OST**, no el juego; tamaño de álbum | excluido por P2 |
| `hard-west-scars-of-freedom` (3 GB) | es un **DLC** | excluido por P2 |
| 6 ediciones (*Enhanced/Deluxe/Definitive/Deathinitive/Chapter 1*) | slug duplica un juego base distinto | adjudicar por P2 |
| Fusión por nombre normalizado | oculta duplicados reales | identidad = `slug` |
| `recommendedRequirements` copiado de `minimum` | escritura destructiva prohibida | prohibido explícitamente |
| Géneros `roguelike`, `accion`, `terror` | `TAXONOMY_GENRE_UNKNOWN` | 14 géneros exactos; `accion`/`terror` son categorías |

### P2 no se resuelve por el nombre

El nombre delata 6 de los 8 productos mal etiquetados, pero **no los dos peores**: `earthlock-festival-of-magic` (300 MB) y `hard-west-scars-of-freedom` (3 GB) tienen slug y título de juego normal. El único indicio es el **tamaño implausiblemente pequeño** para un juego completo.

Y hay dos falsos positivos que un borrado por patrón destruiría:

- `kick-beat-steam-edition` — "Steam Edition" es el nombre comercial del mismo juego en Steam.
- `mark-of-the-ninja-remastered` — el remaster sustituye al original; si el original no está en el piloto, este es el juego de facto.

Por eso `tasks/generador-prompt-v2.md` §8 presenta una **lista de candidatos a adjudicar uno por uno contra la fuente**, no una lista de borrado. La decisión es de quien verifica la fuente, no del redactor del prompt.

## Qué espera la 10.1 de la otra OC

1. Leer `tasks/generador-prompt-v2.md` y `tasks/library-import-contrato.md`.
2. Regenerar el JSON contra `@2` aplicando P1 (tamaño), P2 (un producto) y P3 (taxonomía).
3. `POST /api/v1/admin/library-import/validate` → `summary.error == 0`.
4. Reportar: nº juegos, INCOMPLETE esperados, juegos sin tamaño por falta de fuente, y excluidos por P2.

## Deuda que la 10.2 tendrá que pagar: el test del piloto no es el gate de la 10.1

`backend/tests/integration/library-import-pilot.test.ts` **migra el fixture v1 a `@2` dentro del propio test** (`toV2`, línea 106: quita `status`, convierte `platformSlugs` en `platformVariants`). Consecuencias:

- El test **pasa hoy con el JSON real todavía en `@1`**. El criterio de aceptación de la 10.1 ("el JSON regenerado pasa `validate` sin errores de registro") hay que comprobarlo contra un backend real, no contra este test.
- El test está **acoplado al fixture** en valores fijos que romperá el JSON v2:
  - `summary.total` y `summary.create` están en `toBe(50)`.
  - `pilotSlugsWithoutSize()` lee `sizeValue` **a nivel de registro**. En v2 el tamaño vive en `platformVariants`, así que daría "sin tamaño" para todos y el test de `INCOMPLETE` fallaría.
  - Los conteos `ACTIVE`/`INCOMPLETE` se derivan de esa misma función.

Al llegar el JSON v2 hay que actualizar el test: leer el tamaño efectivo por variantes con el orden de prioridad del contrato, y derivar los conteos del archivo en lugar de fijarlos en 50.

**Recomendación:** cuando exista el JSON v2, quitar `toV2` y validar el archivo tal cual. Si se conserva la migración, el test deja de ser evidencia de nada.

## 10.2 — Verificación e importación

- [ ] Preview limpio (sin errores de registro, sin cambios fuera de revisión humana).
- [ ] Import en local sobre un tenant de pruebas.
- [ ] Conteos cotejados con lo esperado.
- [ ] Revisión humana del resultado.

Nota operativa: el tamaño efectivo se deriva de la **variante principal** según `pc > ps5 > ps4 > xbox-series-x > xbox-one > switch` (contrato §2.2). El piloto v1 tenía tamaños en el campo del registro; en `@2` el sitio canónico es la variante.