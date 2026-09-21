# Scentify

Webapp personal de gestión de colección de perfumes. Un solo usuario, uso principal
desde el móvil, de pie, por la mañana, en menos de diez segundos.

La especificación funcional completa vive en [`spec-webapp-perfumes.md`](./spec-webapp-perfumes.md).
Este README documenta **la elección de stack** y cómo se sostiene contra las
restricciones de la sección 11.

---

## Stack

| Capa | Elección | Por qué en una línea |
|---|---|---|
| Framework | **Next.js 15** (App Router, TypeScript) | Un solo despliegue sirve UI y API; Server Actions evitan escribir una capa REST a mano. |
| UI | **React 19 + Tailwind CSS** | Tailwind es mobile-first por defecto: el estilo base *es* el de 390 px. |
| Base de datos | **PostgreSQL alojado en Neon** | Relacional de verdad, capa gratuita permanente, accesible desde el móvil fuera de casa. |
| Acceso a datos | **Drizzle ORM** | Esquema tipado en TypeScript y migraciones SQL versionadas en el repo, no mágicas. |
| Migraciones | **drizzle-kit** (`drizzle/*.sql` + `meta/_journal.json`) | Ficheros SQL numerados desde el primer commit, aplicables en cualquier entorno. |
| Validación | **Zod** | Un único esquema valida el formulario, la Server Action y la importación CSV. |
| Offline | **Service Worker propio + IndexedDB** | Cola de usos offline con Background Sync; sin depender de plugins que envuelven el build. |
| Tiempo | **Open-Meteo** (`forecast` con `past_days`) | Gratuita, sin API key ni registro; una llamada al día, cacheada en servidor. |
| Tests | **Vitest** | Arranque inmediato, misma resolución de módulos y alias que la app. |
| Despliegue | **Vercel** (hobby) + **Neon** (free) | Coste cero real; `git push` despliega y las migraciones corren en el build. |

### Justificación

La restricción que más condiciona la elección no es la PWA ni el precio, sino la
combinación de **persistencia relacional alojada** con **despliegue de coste cero**.
El modelo de datos de la sección 3 es relacional sin discusión: notas y familias son
N:M con orden, `uso` es una tabla de hechos que apunta a `perfume` y a `contexto`, y la
regla dura de *archivar en vez de borrar* existe precisamente porque hay integridad
referencial que proteger. Eso descarta cualquier variante de almacenamiento en el
navegador y también los *key-value* de borde. Postgres es la respuesta obvia, y entre
las capas gratuitas Neon es la que no caduca a los treinta días ni exige tarjeta:
0,5 GB de almacenamiento y una rama principal siempre disponible, que para una
colección personal de unos cientos de perfumes y unos pocos miles de registros de uso
sobra durante años. Su modo *serverless driver* sobre HTTP encaja con funciones sin
estado, que es exactamente lo que despliega Vercel en su plan hobby: el par
Vercel + Neon deja el coste en cero sin asteriscos y sin un servidor que mantener.
Next.js viene detrás de esa decisión: al colocar la lógica de idoneidad y de estación
efectiva en el servidor, junto a la base de datos, un mismo repositorio y un mismo
`git push` resuelven el despliegue entero. La alternativa seria era SvelteKit, más
ligero en bundle, y se descartó por peso de ecosistema, no por capacidad; Supabase se
descartó porque pausa los proyectos inactivos y aquí hay semanas de silencio entre un
viaje y otro.

Las otras dos restricciones se sostienen sobre decisiones más pequeñas pero
deliberadas. **Mobile-first a 390 px** no se delega en un framework de componentes:
Tailwind se usa con el *breakpoint* base como diseño real para móvil y `sm:`/`md:`
solo para ensanchar, de modo que es imposible escribir por accidente una pantalla de
escritorio que luego haya que apretar; las tablas anchas de la sección 8 se resuelven
con contenedores de scroll horizontal explícito en vez de con rejillas que colapsan mal.
Para la **PWA con cola offline** se escribe un service worker propio en lugar de usar
un plugin: la cola de la sección 11 no es un caché de lectura, es escritura diferida con
reintento, y necesita control fino sobre qué se encola (registros de uso), qué se sirve
desde caché (la colección y la última estación efectiva conocida) y qué falla limpiamente
(la consulta a Fragrantica, que por diseño nunca bloquea nada). Los usos pendientes se
guardan en IndexedDB y se reenvían con Background Sync, con reintento al volver la
conexión; el `id` del uso se genera como UUID en el cliente para que un reenvío duplicado
sea idempotente en el servidor. Esa misma lógica offline es la que obliga a que el cálculo
de idoneidad y el de estación efectiva sean **funciones puras sin dependencias de red ni
de base de datos** (`src/dominio/`): así corren igual en el servidor al guardar y en el
cliente al encolar sin conexión, y son testeables sin levantar nada, que es justo lo que
pide el último punto de la sección 11.

### Decisiones tomadas sobre puntos ambiguos de la especificación

Cuatro puntos de la especificación admitían más de una lectura y se resolvieron así:

1. **`uso.estacion_efectiva`.** La sección 7.1 devuelve un *conjunto* de hasta dos
   estaciones compatibles, pero la sección 3 la declara como enum único. Se guardan las
   dos cosas: `estaciones_efectivas` (array con todas las compatibles, que es lo que se usó
   para calcular) y `estacion_efectiva` (la dominante, la de la banda más cálida del rango,
   que es la que agrupa en las estadísticas de la sección 8).
2. **Registros con fecha pasada.** La estación efectiva se calcula con el tiempo real de
   ese día, no con el de hoy, usando el histórico de Open-Meteo. Cada día consultado se
   cachea por `(lat, lon, fecha)`.
3. **Bloque «Nunca los has usado».** Los perfumes sin ningún registro salen *solo* en su
   bloque; la lista principal de recomendación ordena únicamente perfumes con historial,
   por días desde el último uso. Así no se repite ninguna tarjeta en pantalla.
4. **Botón «Otro».** El descarte se persiste en la tabla `recomendacion_descarte`
   (`user_id`, `perfume_id`, `fecha`), no en el navegador, para que sea coherente entre
   dispositivos y sobreviva a una recarga.

Y dos más, menores, que aparecieron al implementar:

5. **Qué estación usa el fallback sin conexión.** La estación real del mes
   (diciembre-febrero invierno, marzo-mayo primavera, junio-agosto verano,
   septiembre-noviembre otoño), no la regla de `entretiempo` de la sección 7.1: esa
   regla manda a otoño cualquier mes de julio a diciembre, y caer a «otoño» un 15 de
   julio sería absurdo. Hay un test que fija justo ese caso.
6. **«Los cinco umbrales» de la sección 7.1.** El algoritmo tiene cuatro cortes de
   temperatura (28, 24, 18, 13) que definen cinco bandas, más tres valores del ajuste
   por humedad (70 %, 24°, +2°). Los siete son configurables en la tabla `ajuste`, así
   que la cuenta salga como salga, no falta ninguno. Dime si por «cinco umbrales»
   entendías otra cosa.

**Orden del bloque «Nunca los has usado»:** la especificación no lo fija. Se ordena por
idoneidad descendente y luego por nombre, para que la lista sea estable entre recargas.

---

## Estado del proyecto

| Bloque | Estado |
|---|---|
| Esquema de base de datos y migraciones (secc. 3) | Hecho |
| Semillas: contextos, notas, familias, umbrales (secc. 11) | Hecho |
| Lógica de idoneidad (secc. 6.2) | Hecho, con tests |
| Estación efectiva por temperatura (secc. 7.1) | Hecho, con tests |
| Orden del motor de recomendación (secc. 7.2) | Hecho, con tests |
| Interfaz: colección, registro, recomendación, estadísticas | Pendiente |
| Integración Fragrantica (secc. 5) | Pendiente |
| Importación/exportación y backup (secc. 9) | Pendiente |
| PWA: manifest, service worker, cola offline | Pendiente |

---

## Puesta en marcha

```bash
npm install
cp .env.example .env            # y rellena DATABASE_URL con tu cadena de Neon
npm run db:migrate              # aplica drizzle/*.sql en orden
npm run db:seed                 # contextos, notas, familias y umbrales por defecto
npm test                        # tests de las tres piezas con lógica real
```

## Estructura

```
drizzle/            Migraciones SQL versionadas + journal
src/db/schema.ts    Esquema Drizzle (fuente de verdad del modelo)
src/db/seed.ts      Semillas idempotentes
src/dominio/        Lógica pura: idoneidad, estación efectiva, recomendación
tests/              Tests de las tres piezas con lógica real
```
