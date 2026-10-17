# Decisiones Arquitectónicas v1
## SaaS Catálogo — Arquitectura de biblioteca global y catálogos por tenant

**Versión:** 1.0  
**Estado:** Decisiones acordadas  
**Autoría:** Luismi  
**Proyecto:** SaaS Catálogo

---

## 1. Objetivo

Definir las decisiones arquitectónicas que guiarán la evolución del SaaS Catálogo, manteniendo una biblioteca global reutilizable y catálogos independientes para cada cliente.

La arquitectura debe garantizar:

- Separación estricta de los datos de cada tenant.
- Reutilización de información global sobre videojuegos.
- Personalización de precios, disponibilidad y datos específicos por cliente.
- Soporte para múltiples plataformas.
- Importaciones verificables, idempotentes y recuperables.
- Protección de los datos existentes durante las migraciones.
- Trazabilidad de cambios e importaciones.
- Compatibilidad con el crecimiento futuro del servicio.

## 2. Modelo de videojuegos y plataformas

### 2.1. Biblioteca global: `BaseGame`

`BaseGame` será la entidad maestra que representa la identidad común de un videojuego, independientemente del tenant que lo comercialice.

Contendrá los datos generales compartidos, como título, descripción, género y demás metadatos comunes definidos en el esquema.

Los administradores de cada tenant no podrán modificar directamente esta biblioteca global.

### 2.2. Datos específicos por plataforma: `BaseGamePlatform`

`BaseGamePlatform` almacenará los datos que dependan de la plataforma del videojuego, como:

- Tamaño de instalación conocido.
- Requisitos de sistema cuando correspondan.
- Metadatos específicos de la versión para esa plataforma.

Los datos desconocidos no se inventarán ni se sustituirán por valores aproximados sin una fuente verificable.

### 2.3. Oferta del tenant: `TenantGame`

Se utilizará **una fila por combinación de tenant, videojuego y plataforma**.

La combinación será única mediante:

`(tenantId, baseGameId, platformId)`

Cada registro permitirá gestionar de manera independiente el precio, la disponibilidad y las personalizaciones del cliente.

Un mismo videojuego podrá tener ofertas distintas para PC, PS4 o PS5, sin obligar a compartir precios o disponibilidad entre plataformas.

### 2.4. Plataformas habilitadas: `TenantPlatform`

Se creará `TenantPlatform` para representar las plataformas habilitadas en cada tenant.

La plataforma tendrá una identidad canónica global; su habilitación comercial será específica de cada cliente.

El catálogo inicial de plataformas será:

- `pc`
- `ps5`
- `ps4`
- `xbox-series-x`
- `xbox-one`
- `switch`

Se migrarán las relaciones existentes, incluida la plataforma PS4 del catálogo de Javier, preservando las referencias válidas.

## 3. Herencia y personalización de datos

Los datos se resolverán siguiendo esta jerarquía:

1. Información común de `BaseGame`.
2. Información específica de `BaseGamePlatform`.
3. Personalizaciones del tenant en `TenantGame`.

Los campos de personalización admitirán valores nulos cuando corresponda.

**Regla de herencia:** un valor nulo significa que se utiliza el valor heredado; un valor explícito significa que se utiliza la personalización del tenant.

La arquitectura deberá distinguir entre:

- No existe una personalización.
- El tenant desea establecer un valor propio.
- El tenant desea borrar explícitamente un valor heredado.

Esta última operación requerirá una representación explícita para evitar confundir una eliminación intencional con la ausencia de datos.

## 4. Taxonomía

Los géneros y las plataformas utilizarán un diccionario controlado de valores canónicos.

Las importaciones podrán utilizar entradas existentes y crear nuevas entradas únicamente cuando estén aprobadas por las reglas de administración global.

Los valores desconocidos no se crearán automáticamente sin control: deberán resolverse o aprobarse antes de completar la importación.

Las categorías globales y las categorías particulares de un tenant se mantendrán diferenciadas cuando ambas sean necesarias.

Las relaciones muchos-a-muchos se utilizarán donde una entidad pueda tener varios géneros o plataformas.

## 5. Biblioteca multimedia

Se mantendrán dos niveles:

- `LibraryMedia`: medios maestros compartidos.
- `GameMedia`: medios asociados al videojuego en el catálogo de un tenant, incluidos los posibles reemplazos particulares.

La portada podrá ser opcional durante el proceso de enriquecimiento. Las URL externas no se considerarán almacenamiento definitivo.

Cuando se incorpore una imagen externa, el backend deberá descargarla y almacenarla en Cloudinary antes de considerarla un recurso multimedia propio del sistema.

### Protección de descargas externas

El proceso deberá incorporar:

- Validación de esquemas HTTPS y hosts permitidos.
- Protección contra SSRF y direcciones IP privadas.
- Validación del tipo real del archivo.
- Límites de tamaño y tiempo de descarga.
- Control de redirecciones.
- Registro de fallos y posibilidad de reintento.

Un fallo multimedia no bloqueará necesariamente toda la importación si el resto de los datos puede guardarse de forma segura. El registro deberá reflejar que la portada está pendiente o ha fallado.

La restauración de archivos multimedia permanecerá fuera del alcance de esta versión; se conservará un inventario de los recursos existentes para diseñar esa recuperación posteriormente.

## 6. Importaciones

Se separarán dos procesos.

### 6.1. Importación de biblioteca global

Identificador de formato: `library-import@1`

Su finalidad será incorporar o enriquecer información en la biblioteca global.

No deberá crear, modificar ni eliminar ofertas `TenantGame` como efecto secundario.

### 6.2. Importación del catálogo de un tenant

Identificador de formato: `luismi-platform/catalog@1`

Su finalidad será gestionar las entradas comerciales de un tenant, respetando los permisos de su sesión y la separación de datos.

### 6.3. Reglas comunes

Ambos procesos deberán:

1. Validar el formato antes de escribir.
2. Permitir previsualizar los cambios.
3. Informar de errores y advertencias por registro.
4. Ser idempotentes ante reintentos.
5. Registrar la procedencia de los datos cuando esté disponible.
6. Evitar sobrescribir datos válidos con información ausente.
7. Separar los errores de datos de los errores multimedia.
8. Registrar las operaciones relevantes en auditoría.

La identidad inicial se resolverá mediante un `slug` estable, considerando identificadores externos confiables cuando estén disponibles.

Los datos ausentes en una importación no borrarán automáticamente los valores existentes. La eliminación o sustitución de información requerirá una operación explícita.

## 7. Calidad y procedencia de los datos

Se utilizarán los estados conceptuales:

- `ACTIVE`: registro completo y apto para mostrarse.
- `PENDING_ENRICHMENT`: registro que requiere completar información.
- `INCOMPLETE`: registro que no cumple los requisitos necesarios.

Las condiciones exactas para activar un videojuego deberán implementarse mediante validaciones explícitas.

Cuando se enriquezcan datos externos, se conservará, cuando esté disponible, su procedencia: fuente, fecha de consulta, identificador externo y nivel de confianza.

No se considerará que el tamaño indicado en los requisitos de Steam equivale necesariamente al tamaño real de descarga.

Tampoco se asignará al videojuego base el tamaño de un DLC, una banda sonora u otro producto relacionado sin verificar que la identidad del producto coincide.

### 7.1. Ausencia de tamaño: `INCOMPLETE` como estado honesto y su ciclo de cierre

**Situación medida (2026-10-15).** El piloto de 50 juegos llega sin `sizeValue`/`sizeUnit` en 16 de ellos (32%). El pipeline anterior ya los clasificaba como `INCOMPLETE`, de modo que la nueva derivación coincide con la clasificación previa y no es una regresión.

**Decisión.** La ausencia de tamaño **no relaja la condición de `ACTIVE`** (§12.7): un juego sin tamaño es `INCOMPLETE`. Un hueco de datos se representa con el estado que existe para eso, en lugar de rebajar el listón de lo que se considera "completo".

**El tamaño no se inventa ni se estima.** No se derivará de requisitos de store, ni se copiará de otro producto, ni se rellenará con un valor por defecto distinto del `0/GB` que la columna `NOT NULL` ya obliga (§2.2 del contrato del importador). Esto es una aplicación directa de las reglas ya aprobadas en esta misma sección.

**Vías de cierre, en orden de preferencia:**

1. **El generador (tarea 10.1) emite el dato cuando su fuente real lo tiene**, a nivel de **variante de plataforma** (el tamaño de PC y el de PS5 no son el mismo). Requisito explícito: *emitir solo con dato de fuente; nunca inventar, nunca sustituir por un tamaño equivalente*.
2. **Enriquecimiento manual desde la ficha de biblioteca**, que es una vía soportada de primer orden: el tamaño y el estado se guardan en la misma operación. Es de solo `SUPER_ADMIN` (decisión de Fase 4).
3. **Reimportación del mismo archivo**: no destruye lo enriquecido a mano, porque un campo ausente en el archivo no cambia lo que hay en BD (§6.3), y el estado derivado se evalúa sobre el resultado fusionado, por lo que un juego completo sigue siendo `ACTIVE`.

**Reimportar nunca deshace el enriquecimiento.** Es la propiedad que hace segura la vía manual, y está cubierta por pruebas del importador.

**No se derivará el estado automáticamente al guardar la ficha.** La ficha envía el estado de forma explícita y esa es la única fuente; introducir una derivación en el editor crearía dos reglas que podrían discrepar. En su lugar, la propia ficha muestra tamaño y estado juntos, de modo que completar un juego requiere una sola operación de guardado.

**Fija de seguridad.** El `dry-run` del piloto real (`library-import-pilot.test.ts`) comprueba que los `INCOMPLETE` son exactamente los juegos sin tamaño. Si el generador algún día empieza a emitir tamaños, esa prueba falla y obliga a revisar esta decisión de forma explícita, en lugar de que el cambio pase inadvertido.

**Descartado explícitamente:** hacer opcional el tamaño para `ACTIVE` (obliga a redefinir "juego completo" en todo el sistema, incluida la UI y lo que ve el cliente final, para acomodar un hueco del generador), y el autoderivado del estado en el editor de biblioteca (duplica la fuente de verdad del estado).

## 8. Migraciones y recuperación

Las migraciones seguirán una estrategia **expandir y contraer**.

El orden será:

1. Verificar que la recuperación y los respaldos funcionan.
2. Añadir el nuevo modelo sin eliminar inmediatamente las estructuras existentes.
3. Preparar la escritura compatible temporal cuando sea necesaria.
4. Migrar los registros existentes por lotes.
5. Comparar los resultados y verificar las relaciones.
6. Cambiar las lecturas al nuevo modelo.
7. Retirar las estructuras antiguas en una migración posterior y separada.

La migración inicial deberá contemplar los 57 registros existentes identificados en el plan de trabajo, verificando su correspondencia y evitando duplicados.

No se eliminarán columnas o relaciones antiguas hasta haber validado los datos migrados y la capacidad de recuperación.

**No se ejecutarán migraciones destructivas en producción sin respaldo verificado y un procedimiento de reversión o recuperación.**

## 9. Seguridad y autorización

La seguridad se aplicará en el backend, independientemente de las restricciones visuales del frontend.

- Cada operación de tenant utilizará el tenant autorizado por la sesión.
- No se confiará en un `tenantId` enviado por el cliente para conceder acceso.
- Los administradores de tenant no podrán modificar `BaseGame`.
- Las operaciones globales estarán reservadas a `SUPER_ADMIN`.
- Las consultas, modificaciones, importaciones y exportaciones deberán respetar el aislamiento por tenant.
- Los identificadores pertenecientes a otro tenant no podrán utilizarse para acceder o modificar sus datos.
- Las operaciones relevantes deberán quedar auditadas.

Los permisos se verificarán tanto en las rutas como en la lógica de negocio cuando corresponda.

## 10. Precios, disponibilidad e historial

Los precios y la disponibilidad serán específicos de cada tenant y de cada plataforma.

La eliminación lógica se mantendrá donde corresponda, evitando borrar físicamente registros que puedan ser necesarios para auditoría o referencias históricas.

La suspensión o eliminación de un tenant deberá preservar los registros históricos de manera coherente.

La política exacta de retención y eliminación definitiva deberá definirse antes de implementar cualquier purga irreversible.

## 11. Búsqueda, rendimiento y operaciones masivas

Las búsquedas y listados crecerán mediante paginación y filtros del lado del servidor.

Las operaciones masivas deberán ofrecer una vista previa y una confirmación explícita antes de ejecutarse.

Los resultados deberán identificar qué registros se procesaron correctamente y cuáles fallaron.

Los reintentos deberán evitar duplicaciones y efectos secundarios no deseados.

Se priorizará una carga eficiente para conexiones lentas y catálogos grandes.

## 12. Identidad estable y SEO

El `slug` será estable una vez publicado.

Cambiar el título de un videojuego no modificará automáticamente su URL. Si en el futuro se requiere cambiar un `slug`, deberá existir un procedimiento explícito para conservar los enlaces y gestionar las redirecciones.

## 13. Orden de implementación

El orden acordado será:

1. Definir el modelo por plataforma.
2. Verificar los respaldos y el procedimiento de recuperación.
3. Diseñar y ejecutar la migración compatible de los registros existentes.
4. Implementar la resolución de herencia y personalizaciones.
5. Implementar el importador de biblioteca global.
6. Implementar el importador de catálogos por tenant.
7. Incorporar `TenantPlatform` y la administración global de plataformas.
8. Completar la gestión de tenants, incluida la suspensión y preservación histórica.
9. Validar seguridad, integridad, pruebas y recuperación antes de cerrar la fase.

## 14. Criterios de aceptación

La arquitectura no se considerará validada hasta comprobar que:

- Un tenant no puede consultar ni modificar datos privados de otro.
- Una oferta puede existir por cada combinación válida de tenant, videojuego y plataforma.
- Los datos heredados y las personalizaciones se resuelven correctamente.
- Los importadores son idempotentes y no borran datos por ausencia de campos.
- La biblioteca global no altera ofertas de los tenants.
- Las migraciones conservan los registros y sus relaciones.
- Los errores de multimedia pueden identificarse y reintentarse.
- Las operaciones privilegiadas quedan restringidas y auditadas.
- Los respaldos y la recuperación se verifican antes de las migraciones destructivas.

---

**Fin de Decisiones Arquitectónicas v1.**
