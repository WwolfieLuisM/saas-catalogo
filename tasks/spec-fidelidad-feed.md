# Especificación de fidelidad — Feed público v17

> **Autoridad:** `docs/Javier-PC-Hybrid-Premium-Feed-v17-fab-fix.html`. Extraído mecánicamente el 2026-10-17; no hay nada aquí escrito a ojo.
> **Alcance:** solo el feed público. Admin fuera.
> **Método:** se implementa contra este spec, no contra capturas. "Terminado" = matriz del §7 en verde.

---

## 1. La advertencia que cambia todo: el HTML es un híbrido

El fichero tiene **dos capas de CSS apiladas**. No es un documento limpio:

- **Capa antigua** (selectores 1–155): `.hero`, `.feat`, `.thumbs`, `.rail-wrap`, `.dock`, `.tab`, `.card`, `.site-footer`.
- **Capa v17** (desde `html,body`): `.site-header`, `.brand`, `.hamburger`, `.search`, `.desktop-nav`, `.nav-link`, `.list-fab`, `dialog.welcome-card`, `.detail-menu`, `.detail-top`, `.detail-back`.

La segunda capa **sobrescribe** a la primera. Ejemplo: `.btn` aparece dos veces en el inventario; la definición que manda es la de la capa v17, no la antigua.

**Consecuencia:** no se puede transcribir el HTML tal cual. El spec describe **el resultado de la cascada**, que es lo único que el usuario ve. Implementar la capa antigua "por忠实" sería un error.

---

## 2. Tokens

`:root` define **12**. Extraídos literales:

| Token | Valor |
|---|---|
| `--ink` | `#07080c` |
| `--panel` | `#0e1016` |
| `--panel2` | `#151821` |
| `--line` | `#232735` |
| `--text` | `#eceae4` |
| `--muted` | `#979aa6` |
| `--gold` | `#d9b872` |
| `--gold-ink` | `#1a1306` |
| `--ok` | `#6fd6a3` |
| `--display` | `"Big Shoulders Display","Arial Narrow",Impact,sans-serif` |
| `--body` | `"Manrope",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif` |
| `--grain` | data-URI SVG, `feTurbulence baseFrequency=.8 numOctaves=2`, opacidad `.55` |

### 2.1 Tokens que se injectan en runtime (no son estáticos)

| Token | Quién lo pone | Para qué |
|---|---|---|
| `--h` | JS, por juego | Tono del placeholder (`hsl(var(--h) 26% 19%)`) |
| `--c` | JS, por juego | Degradado de portada |
| `--glow` | JS, por juego | `hsl(h 70% 55%)`, usado en el resplandor del hero |
| `--brand-w` | JS `measureBrand()` | Ancho medido de `.brand-word`, para animar el colapso |

**Ninguno está definido en CSS.** Los tres primeros van en `style=` inline; `--brand-w` se escribe en el `<header>` como variable. Los tres "usados sin definir" que aparecen al auditar (`--brand-w`, `--mx`, `--my`) **tienen fallback** (`var(--brand-w, auto)`, etc.). La referencia es internamente coherente.

> **Aviso de naming:** nuestro `admin.css` usa otra nomenclatura (`--bg`, `--s1`, `--s2`, `--ln`, `--tx`, `--mu`, `--au`). Son equivalentes, no contradictorios. Además nuestro `--ok` es `#7fcf9b` y el de la referencia `#6fd6a3`: **son distintos**. A decidir en el diff.

---

## 3. Breakpoints

El diseño es **desktop-first**: el estilo base es el de escritorio y lo móvil entra por `max-width:699px`. Esto invierte la convención habitual y explica por qué un análisis ingenuo de breakpoints fallaba.

| Corte | Nº de reglas | Qué cambia |
|---|---|---|
| `max-width: 699px` | **7 bloques, ~130 líneas** | El grueso del responsive: hero, carrusel, tabs, filtros, tarjetas, dock, diálogos, detalle |
| `min-width: 700px` | 4 bloques | Layout de escritorio: wrap, rejilla a 3 col, hero a 2 col, detalle a 2 col, nav de escritorio |
| `min-width: 700px and max-width: 899px` | 1 | Tablet: nav más apretada |
| `min-width: 880px` | 1 | Aparece el `kbd` del buscador |
| `min-width: 1020px` | 1 | Rejilla pasa a **4 columnas** |
| `min-width: 1280px` | 1 | Rejilla pasa a **5 columnas** |
| `hover: none` | 1 | Apaga `.sheen` en táctil |
| `prefers-reduced-motion: reduce` | 4 | Mata transiciones, animaciones de tarjetas, del onboarding y del FAB |

**Escala de la rejilla de tarjetas: 1 col (<700) → 3 col (≥700) → 4 col (≥1020) → 5 col (≥1280).** Nota: **nunca son 2 columnas.** Ese es el detalle que delata una implementación mal hecha.

---

## 4. Inventario de componentes

310 reglas de base. Agrupadas por función:

- **Chrome:** `.site-header`, `.bar`, `.brand`, `.brand-word`, `.hamburger`, `.search`, `.desktop-nav`, `.nav-link`, `footer`
- **Portada/hero:** `.hero-wrap`, `.hero`, `.hero-main`, `.hero-art`, `.hero-meta`, `.hero-title`, `.hero-desc`, `.hero-buy`, `.hero-price`, `.hero-disk`, `.hero-actions`, `.thumbs`, `.thumb`, `.rail-wrap`
- **Carrusel destacado:** `.feat`, `.fopen`, `.fbody`, `.dots`, `.dot`
- **Catálogo:** `.catalog`, `.cat-head`, `.count`, `.tabs`, `.tab`, `.tools`, `.more`, `#filtersBtn`, `.switch`
- **Rejilla/tarjeta:** `.grid`, `.card`, `.poster-btn`, `.art`, `.mark`, `.ptitle`, `.sheen`, `.soldout`, `.info`, `.sub`, `.foot`, `.price`, `.mini`, `.empty`
- **Colección/lista:** `.collection-tabs`, `.collection-tab`, `.collection-list`, `.collection-count`
- **Diálogos:** `dialog`, `dialog::backdrop`, `.close`, `dialog.welcome-card` (`.wc-*`), `dialog.drawer` (`.drawer-*`, `.item`, `.totals`)
- **Detalle:** `.detail`, `.detail-art`, `.detail-body`, `.specs`, `.requirements`, `.req`, `.meter`, `.detail-buy`, `.detail-actions`, `.shots`, `.shot`, `.detail-menu`, `.detail-top`, `.detail-back`
- **Dock y FAB:** `.dock`, `.list-fab` (`.show`, `.dragging`, `.bump`, `.fab-badge`)
- **Avisos:** `#notice`, `.toast`, `.nt`, `.more-wrap`
- **Utilidad:** `.wrap`, `.sr`, `.btn` (+`.gold`/`.ghost`), `.linklike`

**Total: 310 selectores. Esta es la superficie de la verificación.**

---

## 5. Comportamientos firma

Los cuatro que definen el carácter de la pantalla. Si estos fallan, da igual que los colores cuadren:

1. **Colapso de marca al hacer scroll.** `body.scrolled-down` → `.brand{width:34px}`, `.brand-word{opacity:0}`, `.hamburger{opacity:1}`. La marca se encoge y aparece el hamburguesa. Transición `.28s cubic-bezier(.2,.8,.2,1)`.
2. **Dock móvil.** `body.has-dock{padding-bottom:92px}` y `.dock.show` fijo, `left/right:12px`, `bottom:calc(12px + env(safe-area-inset-bottom))`, `border-radius:20px`, blur 14px, entrada `up .25s`.
3. **Todo diálogo se vuelve hoja inferior en móvil.** `dialog` y `dialog.drawer` pasan a `margin:auto 0 0`, `border-radius:28px 28px 0 0`, `max-height:92dvh/88dvh`, entrada `sheet .3s cubic-bezier(.2,.8,.2,1)`.
4. **El detalle se vuelve pan inferior + acciones pegadas.** `.detail-art .art` a `aspect-ratio:16/9` sin radio, y `.detail-actions` sticky al fondo con `background:var(--panel)` y `padding-bottom:calc(14px + env(safe-area-inset-bottom))`.

---

## 6. Reglas que NO se deben romper

- Rejilla **nunca a 2 columnas**.
- Los diálogos en móvil son hojas, no centrados.
- `.dock` respeta `safe-area-inset-bottom` en todo lo que toca posición fija.
- `prefers-reduced-motion` está presente en **4** bloques, no en uno.
- El footer y el contacto **vienen de `settings`**, no hardcodeados. Esto lo hizo la fase 6 y `main` no lo tocó: es nuestro y no se pierde.

---

## 7. Matriz de verificación

Unchecked porque aún no se ha diffeado. Es el criterio de "terminado".

| Ancho | col | Hero | Catálogo | Tarjetas | Diálogos | Dock | Nav |
|---|---|---|---|---|---|---|---|
| 375 | | | | | | | |
| 700 | | | | | | | |
| 880 | | | | | | | |
| 1020 | | | | | | | |
| 1280 | | | | | | | |
| 1440 | | | | | | | |

Cada celda: **cumple / difiere (valor) / falta (selector)**.

---

## 8. Lo que falta extraer antes de implementar

Extraído y verificado: tokens (§2), breakpoints (§3), inventario (§4), responsive completo (§5–6).

**Pendiente de lectura exacta, no inventado:**
- Declaraciones de la capa base de la v17 (`.list-fab`, `.detail-menu`, `dialog.welcome-card`, `.search kbd`, `.nav-list.bump`): necesaria para el bloque 1.
- Valores base de `.btn`, `.mini`, `.card`, `.tools`, `dialog` **ya resueltos por la cascada**: la capa v17 redefinió `.btn`, `.mini`, `.tools select`, `.search input`. Hay que leer esas redefiniciones, no las de la capa antigua.
- Maquetado del `<body>` en el HTML para saber qué componentes existen en el DOM y con qué `aria`.

Esto se extrae en el paso 3, antes de tocar código.

---

## 9. Decisiones pendientes (bloquean el diff)

1. **`--ok`:** referencia `#6fd6a3` vs nuestro `#7fcf9b`. ¿Se cambia el nuestro?
2. **Prefijo de scope:** la referencia usa selectores desnudos (`.btn`, `.card`) y gutta todo en un `<style>`. Nosotros usa scope. ¿Mantenemos el scope nuestro? (afecta a cómo se translate el spec a CSS)
3. **Desviaciones deliberadas de `main`:** sin fijar política, no puedo decidir los huecos. Propuesta vigente: **el HTML manda**, y cada revert de `main` se enseña antes.