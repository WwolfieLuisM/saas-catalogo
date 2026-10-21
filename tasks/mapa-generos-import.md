# Mapa de géneros IGDB → taxonomía LUISMI (propuesta)

Fecha: 2026-10-21 · Estado: **pendiente de OK del usuario** · Fase A del plan de importación.

## Por qué existe este fichero

El CSV del catálogo (`backend/scripts/piloto_resultado.csv`) trae los géneros que IGDB devuelve para cada juego (columna `generos`). El constructor actual (`scripts/construir-import.mjs`) solo usa los géneros de **Steam** (diccionario propio de 10 equivalencias directas) y de **RAWG** (que ya devuelve slugs nuestros). Los géneros de IGDB son una **3ª fuente** que aumenta la cobertura en la unión, pero solo si traducimos sus 21 tokens a nuestra taxonomía (36 slugs de género, 10 categorías).

Con el mapa aprobado, el builder pasará a hacer:

```text
genreSlugs = dedupe( Steam→slugs  ∪  RAWG→slugs  ∪  IGDB→slugs )   // todos ya en el diccionario
```

## Frecuencia real en el lote 1 (943 juegos MATCHED nuevos)

21 tokens distintos, obtenidos con `backend/scripts/muestra-60.mjs`:

| Juegos | Token IGDB | → genreSlug propuesto | Notas |
|-------:|------------|----------------------|-------|
| 525 | Adventure | `aventura` | Directo. Es el token más genérico de IGDB; la unión con Steam/RAWG acotará los falsos «aventura». |
| 332 | Indie | `indie` | Directo. |
| 315 | Role-playing (RPG) | `rol` | Directo. |
| 237 | Simulator | `simulacion` | Directo. |
| 226 | Strategy | `estrategia` | Directo. |
| 217 | Shooter | `disparos` | Directo. |
| 98 | Hack and slash/Beat 'em up | `hack-and-slash` | Token doble de IGDB; nos quedamos con el equivalente principal (sigue el patrón de los 50). |
| 81 | Puzzle | `puzzle` | Directo. |
| 79 | Platform | `plataformas` | Directo. |
| 69 | Real Time Strategy (RTS) | `estrategia-en-tiempo-real` | Directo. |
| 57 | Racing | `carreras` | Directo (no `conduccion`: reservamos esa para simuladores de conducción sin carrera). |
| 52 | Arcade | `arcade` | Directo. |
| 51 | Tactical | `tactico` | Directo. |
| 50 | Fighting | `lucha` | Directo. |
| 48 | Sport | `deportes` | Directo (no `futbol`: reservado a fútbol concreto). |
| 39 | Turn-based strategy (TBS) | `por-turnos` (+ `estrategia`) | **Decisión abierta 1**: doble slug o solo `por-turnos`. |
| 11 | Point-and-click | `point-and-click` | Directo. |
| 9 | Card & Board Game | `cartas-y-mesa` | Directo. |
| 3 | Visual Novel | *(sin equivalencia → keywords)* | **Decisión abierta 2**: no tenemos slug de visual novel; propongo dejarlo fuera de `genreSlugs` (quedaría en keywords como mucho). |
| 2 | Music | `musica` | Directo. |
| 1 | MOBA | `moba` | Directo. |

Cobertura: 21/21 tokens tienen propuesta (19 directos + TBS + Visual Novel).

## Decisión abierta 3 · Categoría de los juegos de estrategia

La categoría de un juego se deriva del primer género con equivalencia directa (`CATEGORIA_POR_GENERO` del builder). Hoy esa tabla **no** incluye `estrategia`, `estrategia-en-tiempo-real`, `tactico` ni `por-turnos`, así que todos los estratégicos caen en `otros`:

- Estrategia (226) + RTS (69) + TBS (39) + Táctico (51) ≈ **385 juegos** (con solapes) → `otros`.

Dos opciones:

1. **Dejar como está** (`otros`): sin tocar la taxonomía global; la estrategia se navega por género, no por categoría.
2. **Crear la categoría `estrategia`** en la taxonomía global (endpoint admin) y añadirla a `CATEGORIA_POR_GENERO`: categoría limpia para ~385 juegos, pero es un cambio de taxonomía global que afecta al panel de todos los tenants.

Mi recomendación: **opción 2** si la categoría es para navegar en el feed (merece la pena), **opción 1** si prefieres taxonomía intacta por ahora. Tú decides.

## Fuente de equivalencias Steam (ya implementada, no cambia)

`GENERO_STEAM` del builder: Action→`accion`, Adventure→`aventura`, RPG→`rol`, Strategy→`estrategia`, Simulation→`simulacion`, Casual→`casual`, Indie→`indie`, Sports→`deportes`, Racing→`carreras`, Fighting→`lucha`. Tokens sin equivalencia (`Early Access`, `Free To Play`, `Massively Multiplayer`…) se descartan de `genreSlugs` (pueden ir a keywords).

## Cómo se aplicaría

1. Aprobación aquí → añado el mapa IGDB como `GENERO_IGDB` en `scripts/construir-import.mjs` y lo sumo a la unión.
2. Si decides la categoría `estrategia`, la creo en la taxonomía global (SUPER_ADMIN) y actualizo `CATEGORIA_POR_GENERO`.
3. Nada se importa hasta que además pases la muestra de 60 (`tasks/muestra-60-matched.csv`) — el mapa solo afecta a campos de catálogo, pero ambas validaciones son el gate de la Fase B.
