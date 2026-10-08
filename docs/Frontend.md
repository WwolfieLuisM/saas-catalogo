# Frontend — Prompt Maestro para OpenCode

## 0. Misión

Construye el frontend V2 de la plataforma SaaS de catálogo de juegos.

El frontend debe conectarse al backend real definido en `Backend+Db.md` (especificación unificada V1 + V2).

Antes de escribir código:
1. Inspecciona el repositorio.
2. Inspecciona `Backend+Db.md` si está disponible.
3. Inspecciona `adminv2.html` si está disponible.
4. Respeta las APIs reales existentes.
5. No inventes endpoints.
6. No dupliques lógica de negocio que corresponde al backend.

Stack obligatorio:
- Next.js
- React
- TypeScript
- App Router
- CSS moderno / CSS Modules o arquitectura equivalente consistente
- SVG inline para iconografía propia
- Cloudinary mediante URLs entregadas por backend
- Backend REST `/api/v1`

El frontend NO debe acceder directamente a PostgreSQL/Neon.

---

# 1. Concepto visual

Nombre público:

**Javier**

Nunca mostrar:
- `Javier PC`
- `JAVIER PC`

El branding público debe ser simplemente:

`JAVIER`

Concepto:

> Gaming oscuro, limpio y rápido.

Debe sentirse:
- premium;
- moderno;
- sobrio;
- rápido;
- funcional;
- propio;
- no genérico;
- no “AI aesthetic”.

Evitar:
- gradientes excesivos;
- glassmorphism exagerado;
- cards gigantes;
- interfaces saturadas;
- animaciones innecesarias;
- botones diminutos;
- iconos inconsistentes.

---

# 2. Paleta

Usar variables:

```css
:root {
  --ink: #07080c;
  --panel: #0e1016;
  --panel2: #151821;
  --line: #232735;
  --text: #eceae4;
  --muted: #979aa6;
  --gold: #d9b872;
  --gold-ink: #1a1306;
}
```

El dorado es el acento principal.

No crear una paleta diferente por página.

---

# 3. Tipografía

Usar:

- Big Shoulders Display
- Manrope

Big Shoulders:
- branding;
- títulos principales;
- elementos display.

Manrope:
- texto;
- botones;
- navegación;
- metadatos;
- formularios.

---

# 4. Arquitectura de aplicación

Usar Next.js App Router.

Estructura conceptual:

```text
app/
├── page.tsx
├── feed/
├── juegos/
│   ├── page.tsx
│   └── [slug]/
├── categorias/
│   └── [slug]/
├── generos/
│   └── [slug]/
├── plataformas/
│   └── [slug]/
├── favoritos/
├── mi-lista/
├── mi-coleccion/
├── contacto/
├── admin/
│   └── ...
├── layout.tsx
├── loading.tsx
├── error.tsx
└── not-found.tsx
```

Separar claramente:

```text
PÚBLICO
/admin
```

El admin debe tener su propio layout visual.

---

# 5. Rutas públicas

Implementar:

```text
/
/feed
/juegos
/juegos/[slug]
/categorias/[slug]
/generos/[slug]
/plataformas/[slug]
/mi-lista
/mi-coleccion
/favoritos
/contacto
```

Las páginas de categoría, género y plataforma deben reutilizar el mismo componente/listado de catálogo.

Ejemplos:

```text
/categorias/accion
/generos/aventura
/plataformas/pc
```

---

# 6. Header

Desktop:

```text
JAVIER                         [ Buscar juegos... ]
```

Mobile:
- logo;
- búsqueda;
- controles mínimos.

Cuando el usuario hace scroll:
- header compacto;
- hamburger;
- búsqueda compacta.

No colocar `Mi colección` permanentemente en el header.

---

# 7. Sidebar

El hamburger abre sidebar.

Opciones:

```text
Inicio
Juegos
Mi colección
Mi lista
Contacto
```

Puede mostrar badges/counters cuando corresponda.

`Mi colección` es independiente de `Mi lista`.

---

# 8. Catálogo

El catálogo debe priorizar:

1. título;
2. portada;
3. precio;
4. disponibilidad;
5. plataforma;
6. información útil.

El usuario debe poder encontrar un juego en segundos.

Cards:
- compactas;
- toda la card es clickable;
- sin menú de tres puntos;
- sin exceso de botones.

No colocar un botón de favorito directamente en cada card.

---

# 9. Búsqueda

La búsqueda debe permitir:

- nombre;
- género;
- categoría;
- plataforma.

Importante:

No hacer una petición al servidor por cada tecla si el catálogo ya está cargado.

Preferencia:

```text
API
 ↓
catalog cache
 ↓
búsqueda local
 ↓
filtros locales
```

El backend sigue ofreciendo búsqueda como respaldo.

---

# 10. Filtros

Implementar filtros por:

- categoría;
- género;
- plataforma;
- disponibilidad;
- rango de precio cuando corresponda.

Desktop:
- filtros visibles cuando haya espacio.

Mobile:
- drawer/bottom sheet de filtros.

No provocar overflow horizontal.

---

# 11. Ordenamiento

Permitir, cuando el backend lo soporte:

- relevancia;
- nombre;
- precio;
- fecha;
- tamaño.

No implementar ordenamientos que contradigan la API real.

---

# 12. Detalle de juego

Ruta:

`/juegos/[slug]`

Debe mostrar:

- portada;
- screenshots;
- título;
- descripción;
- precio;
- disponibilidad;
- plataformas;
- categoría;
- género;
- tamaño;
- año;
- requisitos mínimos;
- requisitos recomendados.

Acciones principales:

```text
[ + Añadir a mi lista ]
[ Favorito ]
```

No usar:

`Pedir solo este`

La acción correcta es:

`Añadir a mi lista`

---

# 13. Botón volver

En detalle:

- circular;
- translúcido;
- aproximadamente 40–44 px;
- esquina superior izquierda;
- icono de flecha SVG;
- sin texto.

Debe respetar safe areas en móvil.

---

# 14. Menú de tres puntos

El menú de tres puntos existe solamente dentro del detalle del juego.

No aparece en cards.

Debe estar en el lado izquierdo.

Acciones:

```text
Favorito
Pendiente
Jugado
Ganado
Quitar estado
```

Si un estado no está activo, no es necesario mostrar “Quitar estado” salvo que exista algún estado.

Diseño:
- circular;
- sutil;
- translúcido;
- glass ligero;
- SVG inline;
- animación discreta.

---

# 15. Favoritos

Favoritos y Mi lista son conceptos diferentes.

Favoritos:
- sirven para recordar juegos;
- no representan un pedido;
- no tienen cantidad;
- se almacenan localmente.

LocalStorage:

```text
javierpc:favorites
```

Ruta:

`/favoritos`

El estado activo debe usar el dorado.

No enviar favoritos al backend salvo que una futura versión lo requiera.

---

# 16. Mi lista

Mi lista representa una lista de pedido/solicitud.

Ruta:

`/mi-lista`

Debe soportar:
- múltiples juegos;
- cantidad;
- precio;
- tamaño;
- total.

Mostrar:

```text
Juegos seleccionados
Total
Tamaño total
```

Acción:

`Pedir por mensaje`

No existe:

`Pedir solo este`

La lista debe poder eliminar elementos y ajustar cantidades si el modelo lo permite.

LocalStorage:

```text
javierpc:list
```

---

# 17. Floating Mi Lista

Cuando Mi Lista tiene elementos:

mostrar un botón flotante.

Características:

- solamente icono SVG circular;
- sin texto;
- badge con cantidad;
- draggable;
- mouse;
- touch;
- posición persistente;
- por defecto lado izquierdo;
- gold background;
- dark foreground;
- desktop aproximadamente 66×66;
- mobile aproximadamente 56×56;
- aparece al agregar primer elemento;
- animación discreta;
- desaparece cuando está vacío.

No bloquear botones ni contenido importante.

Debe respetar safe-area.

---

# 18. Mi colección

`Mi colección` es independiente de Mi lista.

Representa la biblioteca personal del usuario.

Persistir localmente.

Estados:

```text
Todos
Favoritos
Pendiente
Jugado
Ganado
```

Estructura conceptual:

```js
state.status = Map
```

Persistir en LocalStorage.

Un juego puede tener:

```text
Favorito · Pendiente
```

o:

```text
Favorito
```

o:

```text
Jugado
```

---

# 19. Estado de colección

Desde el menú del detalle:

```text
Favorito
Pendiente
Jugado
Ganado
Quitar estado
```

No mezclar este estado con Mi Lista.

Mi Lista:
- pedido.

Mi Colección:
- biblioteca personal.

Favoritos:
- marcador/like personal.

---

# 20. LocalStorage

Usar claves consistentes:

```text
javierpc:favorites
javierpc:list
javierpc:collection
javierpc:catalog
javierpc:catalogVersion
javierpc:catalogMeta
javierpc:ui
```

No guardar secretos en LocalStorage.

No guardar:
- access tokens;
- refresh tokens;
- passwords.

---

# 21. Cache del catálogo

La aplicación debe utilizar estrategia cache-first.

Modelo:

```json
{
  "schemaVersion": 1,
  "catalogVersion": 42,
  "updatedAt": "...",
  "cachedAt": "...",
  "expiresAt": "...",
  "data": {
    "games": []
  }
}
```

Flujo:

```text
Abrir aplicación
       ↓
Leer catálogo local
       ↓
Mostrar inmediatamente si existe
       ↓
Consultar /catalog/version
       ↓
¿Cambió?
   ├── NO → mantener cache
   └── SÍ → descargar catálogo actualizado
```

No descargar el catálogo completo innecesariamente.

---

# 22. Primera conexión

Puede mostrarse:

```text
¿Deseas descargar las imágenes del catálogo
para poder navegar sin conexión?

[Ahora no] [Descargar]
```

Si:

`Ahora no`

usar carga progresiva.

Si:

`Descargar`

hacer descarga progresiva.

Debe existir:
- progreso;
- pausa si es posible;
- reanudación;
- manejo de errores.

No bloquear la navegación.

---

# 23. Imágenes

No descargar automáticamente todas las imágenes como regla.

Cloudinary proporciona las URLs.

Usar:
- thumbnails;
- transforms;
- lazy loading;
- tamaños adecuados;
- `sizes`;
- `srcSet` cuando corresponda.

No solicitar una imagen original enorme para una card pequeña.

---

# 24. Cloudinary

El frontend NO debe contener:

```text
CLOUDINARY_API_SECRET
```

No subir directamente desde el frontend salvo que el backend entregue un flujo seguro de upload firmado.

Para el catálogo público:
- usar URLs proporcionadas por API.

Para Admin:
- usar endpoint de upload del backend.

---

# 25. Offline

Cuando no haya conexión:

- mantener catálogo cacheado;
- mostrar indicador offline;
- permitir búsqueda local;
- permitir favoritos;
- permitir Mi Lista;
- permitir Mi Colección.

No mostrar un error catastrófico si existe cache válida.

Ejemplo:

```text
Sin conexión
Mostrando el último catálogo disponible.
```

Cuando vuelva la conexión:
- comprobar versión;
- sincronizar.

---

# 26. Polling / actualización

Cuando el usuario esté navegando:

consultar `/catalog/version` periódicamente, pero sin abusar.

Evitar:
- polling demasiado frecuente;
- peticiones por cada interacción;
- múltiples intervalos duplicados.

Usar:
- visibility awareness;
- cleanup de timers;
- backoff cuando sea apropiado.

---

# 27. API client

Crear una capa central:

```text
src/lib/api/
```

Ejemplo conceptual:

```text
apiClient
catalogApi
gamesApi
categoriesApi
genresApi
platformsApi
authApi
adminApi
```

No hacer `fetch()` disperso por toda la aplicación.

---

# 28. Tipos

Crear tipos TypeScript compartidos para:

- Game
- BaseGame
- Category
- Genre
- Platform
- Media
- Requirements
- Catalog
- CatalogVersion
- Pricing
- Admin
- Tenant
- AuditEvent
- Session.

Los tipos deben reflejar la API real.

No duplicar manualmente estructuras incompatibles.

---

# 29. React Server Components / Client Components

Usar Server Components por defecto.

Usar Client Components únicamente cuando sea necesario para:

- LocalStorage;
- interacción;
- favoritos;
- Mi Lista;
- Mi Colección;
- drag;
- menús;
- búsqueda interactiva;
- filtros interactivos.

No convertir toda la aplicación en Client Components sin necesidad.

---

# 30. Estado

Mantener estado local cuando sea suficiente.

No instalar una librería global pesada solamente por comodidad.

Separar:
- server data;
- UI state;
- persistent local state.

---

# 31. Loading

Crear estados de carga elegantes.

No usar pantallas blancas.

Utilizar:
- skeletons;
- placeholders;
- estados progresivos.

Cards deben tener skeleton equivalente.

---

# 32. Error handling

Crear:

```text
error.tsx
not-found.tsx
loading.tsx
```

Errores de API:
- traducir a mensajes claros;
- nunca mostrar stack traces;
- ofrecer retry cuando sea útil.

Ejemplo:

```text
No pudimos cargar el catálogo.

[Reintentar]
```

Si existe cache:

```text
No se pudo actualizar.
Mostrando el último catálogo guardado.
```

---

# 33. Responsive

Mobile-first.

Debe funcionar en:
- móvil;
- tablet;
- laptop;
- desktop.

Nunca:
- overflow horizontal accidental;
- texto cortado;
- botones demasiado pequeños;
- modales fuera de pantalla;
- sidebar imposible de cerrar.

---

# 34. Mobile navigation

En móvil:

- sidebar → drawer;
- tablas → cards/listas;
- formularios → una columna;
- filtros → bottom sheet/drawer;
- dashboard → métricas apiladas;
- settings → bloques/accordions;
- acciones → touch targets grandes.

---

# 35. Admin

`/admin` es una aplicación separada visualmente del catálogo público.

Debe respetar el diseño de `adminv2.html`.

No rediseñar Admin V2 sin necesidad.

Admin V2 ya define:
- navegación;
- dashboard;
- juegos;
- biblioteca;
- categorías;
- géneros;
- plataformas;
- multimedia;
- administradores;
- auditoría;
- sesiones;
- negocios;
- configuración;
- precios;
- import/export;
- backups;
- sistema.

El frontend admin debe consumir el backend V2 real.

---

# 36. Auth Admin

El frontend admin debe implementar:

- login;
- refresh;
- logout;
- sesión persistente;
- expiración;
- manejo de 401;
- redirección al login;
- permisos.

No guardar refresh token en LocalStorage.

No exponer tokens en UI.

No permitir que un ADMIN cambie su tenant manipulando parámetros.

---

# 37. SUPER_ADMIN

Mostrar opciones globales únicamente si el usuario autenticado tiene:

`SUPER_ADMIN`

Ejemplo:
- Negocios/Tenants.

No ocultar únicamente visualmente y considerar eso seguridad.

El backend debe validar permisos.

Frontend = UX.
Backend = seguridad.

---

# 38. ADMIN

ADMIN solamente puede operar dentro de su tenant.

El frontend puede conocer el tenant actual para mostrar contexto, pero nunca debe poder imponer un tenant diferente al backend.

---

# 39. Dashboard Admin

Consumir:

`GET /api/v1/admin/dashboard`

Mostrar:
- juegos;
- disponibles;
- no disponibles;
- biblioteca;
- personalizados;
- errores media;
- sesiones;
- actividad;
- versión catálogo.

No calcular estas métricas manualmente a partir de datos incompletos si el backend ya las entrega.

---

# 40. Juegos Admin

Implementar:
- listado;
- búsqueda;
- filtros;
- paginación;
- crear;
- editar;
- detalle;
- soft delete;
- restaurar;
- duplicar.

Crear juego dividido en:

## Basic info
- title
- description
- availability
- price cuando corresponda.

## Game info
- size
- unit
- year
- category
- genre
- platforms.

## Minimum requirements

## Recommended requirements

## Media

---

# 41. Formulario de juego

Principio:

> Todo lo repetitivo se selecciona. Todo lo excepcional se escribe.

Usar:
- selects;
- combobox;
- presets;
- autocomplete;
- inputs manuales para `Other`.

No obligar al administrador a escribir manualmente valores repetitivos.

Implementar:
- copiar Minimum → Recommended.

---

# 42. Pricing Admin

Consumir API de precios.

No calcular precios en frontend.

El frontend puede mostrar preview:

```text
Aplicar nuevas reglas

18 juegos cambiarán
42 juegos permanecerán iguales

[Cancelar] [Confirmar]
```

La decisión final la toma el backend.

---

# 43. Import / Export Admin

Implementar flujo:

```text
Seleccionar archivo
      ↓
Validar
      ↓
Mostrar errores
      ↓
Comparar
      ↓
Preview
      ↓
Backup
      ↓
Confirmar
      ↓
Importar
```

No hacer importaciones destructivas silenciosas.

---

# 44. Media Admin

Mostrar:
- covers;
- screenshots;
- estados;
- errores;
- huérfanos;
- retry;
- manifest.

No asumir que todo upload fue exitoso solamente porque el usuario seleccionó un archivo.

---

# 45. SEO

Implementar metadata dinámica.

Cada juego debe tener:

- title;
- description;
- canonical;
- Open Graph;
- Twitter/X metadata cuando corresponda.

Ejemplo conceptual:

```text
JAVIER · Red Dead Redemption 2
```

Generar metadata desde datos del juego.

---

# 46. Sitemap

Implementar sitemap dinámico para:
- home;
- juegos;
- categorías;
- géneros;
- plataformas.

No incluir:
- rutas privadas;
- admin;
- datos internos.

---

# 47. Robots

No indexar:

```text
/admin
/admin/*
```

Permitir indexación del catálogo público.

---

# 48. Accesibilidad

Implementar:
- semantic HTML;
- labels;
- focus visible;
- navegación por teclado;
- `aria-label` donde corresponda;
- contraste adecuado;
- botones reales para acciones;
- no usar `div` como botón si no es necesario.

---

# 49. Animaciones

Animaciones:
- cortas;
- suaves;
- funcionales.

Respetar:

```css
@media (prefers-reduced-motion: reduce)
```

Desactivar/reducir animaciones cuando el usuario lo solicite.

---

# 50. Iconografía

Usar SVG inline para iconos propios.

No mezclar cinco bibliotecas de iconos.

Los iconos deben tener:
- tamaño consistente;
- stroke consistente;
- alineación consistente.

---

# 51. Seguridad frontend

Nunca almacenar:
- passwords;
- refresh tokens;
- secrets.

No confiar en:
- role del LocalStorage;
- tenantId del LocalStorage;
- precio del cliente;
- disponibilidad manipulada.

Todo dato sensible debe venir y validarse en backend.

---

# 52. Performance

Prioridades:

1. First render rápido.
2. Catálogo cacheado.
3. Imágenes optimizadas.
4. Poco JavaScript inicial.
5. Lazy loading.
6. Server Components.
7. No dependencias innecesarias.

Evitar:
- renders innecesarios;
- imágenes originales gigantes;
- polling agresivo;
- bundles enormes.

---

# 53. Componentes

Crear componentes reutilizables:

```text
GameCard
GameGrid
GameList
GameDetail
GameRequirements
GameMediaGallery
SearchBar
FilterPanel
CategoryCard
GenreCard
PlatformCard
FavoriteButton
AddToListButton
FloatingListButton
CollectionDialog
DetailMenu
BackButton
Sidebar
MobileDrawer
OfflineBanner
LoadingSkeleton
EmptyState
ErrorState
```

No duplicar el mismo markup en cada ruta.

---

# 54. Datos de demo

Puede existir mock data únicamente durante desarrollo.

Debe ser fácil de eliminar.

No utilizar mocks como fallback silencioso en producción.

No ocultar errores reales del backend mostrando datos demo.

---

# 55. Variables de entorno

Crear:

```text
NEXT_PUBLIC_API_URL=
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=
```

No colocar secrets con `NEXT_PUBLIC_`.

Cualquier secreto debe permanecer únicamente en backend.

---

# 56. Testing

Implementar tests para:

- GameCard;
- búsqueda;
- filtros;
- favoritos;
- Mi Lista;
- Mi Colección;
- cache;
- catalog version;
- offline;
- auth;
- protección de rutas;
- admin permissions UI;
- pricing preview;
- responsive critical flows.

Cuando sea posible usar:
- unit tests;
- integration tests;
- E2E.

---

# 57. Build

Debe funcionar:

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build
npm start
```

Ajustar scripts si el proyecto existente usa nombres equivalentes.

---

# 58. Deploy

Preparar frontend para deployment compatible con Next.js.

No asumir que frontend y backend viven en el mismo dominio.

La API será configurable mediante:

`NEXT_PUBLIC_API_URL`

Preparar CORS/backend interaction correctamente.

---

# 59. Git

No subir:
- `.env`;
- `.env.local`;
- secrets;
- tokens;
- credenciales;
- dumps privados;
- archivos temporales.

Actualizar `.gitignore`.

---

# 60. Reglas contra regresiones

No cambiar:
- branding;
- rutas;
- localStorage keys;
- comportamiento de Mi Lista;
- comportamiento de Favoritos;
- comportamiento de Mi Colección;
- contrato API;

sin comprobar primero el impacto.

No eliminar funcionalidades existentes solamente para simplificar.

---

# 61. Compatibilidad con backend

El frontend debe respetar:

```text
Backend
   ↓
REST /api/v1
   ↓
Frontend API client
   ↓
React / Next.js
```

Nunca:

```text
Frontend → PostgreSQL
```

Nunca:

```text
Frontend → Prisma
```

Nunca:

```text
Frontend → Cloudinary secret
```

---

# 62. Contrato API

Antes de implementar una llamada:

1. Buscar endpoint real en backend.
2. Revisar método.
3. Revisar params.
4. Revisar query.
5. Revisar body.
6. Revisar response.
7. Revisar errores.

Si el frontend necesita un endpoint que no existe:

**no inventarlo silenciosamente.**

Documentarlo como endpoint requerido y, si el trabajo incluye backend, implementarlo allí.

---

# 63. Manejo de 401

Flujo:

```text
Request
 ↓
401
 ↓
intentar refresh
 ↓
si refresh funciona
 ↓
repetir request original
```

Si refresh falla:

```text
logout local
 ↓
/admin/login
```

Evitar loops infinitos de refresh.

---

# 64. Manejo de offline

Detectar:
- `navigator.onLine`;
- errores de red;
- timeouts.

No asumir que `navigator.onLine` garantiza conectividad real.

El request real manda.

---

# 65. URL y navegación

Usar rutas limpias.

No depender de IDs internos cuando exista slug público.

Ejemplo:

```text
/juegos/red-dead-redemption-2
```

No:

```text
/juegos/984729
```

Admin puede utilizar IDs internos.

---

# 66. Imagen de detalle

La galería debe:
- usar cover principal;
- thumbnails;
- lazy loading;
- navegación cómoda;
- fallback si una imagen falla.

No romper el layout si una imagen no existe.

---

# 67. Estados vacíos

Crear estados para:

### Favoritos vacíos
```text
Todavía no tienes favoritos.
```

### Mi Lista vacía
```text
Tu lista está vacía.
```

### Colección vacía
```text
Tu colección todavía está vacía.
```

### Búsqueda sin resultados
```text
No encontramos juegos con esa búsqueda.
```

Con acción útil cuando corresponda.

---

# 68. Contacto

`/contacto`

Página independiente.

No mezclar con el detalle de juegos.

Debe poder mostrar:
- información de contacto;
- canales disponibles;
- instrucciones de pedido;
- información configurable si el backend futuro lo soporta.

---

# 69. Diseño para Cuba

Priorizar:
- poco peso;
- cache;
- tolerancia a conexiones inestables;
- imágenes comprimidas;
- navegación funcional sin conexión;
- evitar solicitudes innecesarias.

No asumir:
- conexión rápida;
- disponibilidad constante;
- latencia baja.

---

# 70. No copiar Facebook

La estrategia de cache/progressive loading es una decisión técnica de performance.

No copiar:
- layout;
- branding;
- patrones visuales;
- componentes propietarios.

La experiencia debe ser propia de Javier.

---

# 71. Definition of Done

- [ ] Next.js App Router configurado.
- [ ] TypeScript configurado.
- [ ] Diseño Javier implementado.
- [ ] Branding solo “Javier”.
- [ ] Home/feed.
- [ ] Catálogo.
- [ ] Detalle.
- [ ] Categorías.
- [ ] Géneros.
- [ ] Plataformas.
- [ ] Búsqueda.
- [ ] Filtros.
- [ ] Favoritos.
- [ ] Mi Lista.
- [ ] Mi Colección.
- [ ] Floating Mi Lista.
- [ ] Menú tres puntos en detalle.
- [ ] Botón volver.
- [ ] Cache catálogo.
- [ ] Catalog version.
- [ ] Offline.
- [ ] Progressive image loading.
- [ ] Cloudinary URLs.
- [ ] Responsive.
- [ ] Accesibilidad.
- [ ] SEO.
- [ ] Sitemap.
- [ ] Robots.
- [ ] Admin layout.
- [ ] Admin auth.
- [ ] Admin API integration.
- [ ] SUPER_ADMIN/ADMIN UI permissions.
- [ ] Games CRUD integration.
- [ ] Library integration.
- [ ] Pricing integration.
- [ ] Media integration.
- [ ] Audit/session views.
- [ ] Import/export views.
- [ ] Error/loading states.
- [ ] Tests.
- [ ] Lint.
- [ ] Typecheck.
- [ ] Build.
- [ ] README actualizado.

---

# 72. Instrucción final para OpenCode

No empieces a programar a ciegas.

Primero inspecciona:

- repositorio;
- backend;
- `Backend+Db.md`;
- `adminv2.html`;
- componentes existentes;
- contratos API.

Después:

1. Resume lo existente.
2. Detecta qué puede reutilizarse.
3. Detecta inconsistencias.
4. Identifica endpoints faltantes.
5. Propón cambios mínimos necesarios.
6. Implementa por fases.
7. Ejecuta lint.
8. Ejecuta typecheck.
9. Ejecuta tests.
10. Ejecuta build.
11. Corrige errores.
12. Verifica responsive.
13. Verifica offline/cache.
14. Verifica autenticación.
15. Verifica que no existan secretos en frontend.
16. Verifica que no se confíe en tenantId/role del cliente.
17. Verifica compatibilidad con el backend (`Backend+Db.md`).
18. Actualiza README.

Regla absoluta:

**No inventes que una API, función o integración existe. Compruébala en el código.**

El resultado debe ser un frontend real de producción, rápido, responsive, preparado para conexiones inestables y conectado al backend V2 como única fuente de verdad para datos del sistema.
