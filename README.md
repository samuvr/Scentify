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

7. **La importación CSV exige lo mismo que el alta manual**: nombre, marca y al menos un
   contexto, una estación y un momento. Un perfume a medio categorizar no sirve para el
   motor de recomendación, así que la fila se rechaza en la previsualización, con su
   número de línea y el motivo, en vez de entrar coja.

**Orden del bloque «Nunca los has usado»:** la especificación no lo fija. Se ordena por
idoneidad descendente y luego por nombre, para que la lista sea estable entre recargas.

---

## Lenguaje visual

Monocromo y de canto vivo. La paleta es negro, blanco y grises; no hay ni un tono de
color en toda la interfaz, y ningún elemento tiene las esquinas redondeadas. El radio
se anula en el tema de Tailwind, no por convenio, así que un `rounded-*` escrito más
adelante seguirá dando canto vivo y no hay nada que vigilar en cada revisión.

Quitar el color obliga a resolver dos cosas que antes se apoyaban en él:

- **Los estados.** El rojo marcaba el error y el verde el acierto. Ahora la jerarquía
  la dan el filete lateral, el peso y la claridad: `aviso-error` es lo único que llega
  a blanco puro con filete grueso, `aviso-atencion` usa filete gris, y `aviso-hecho`
  se queda en texto tenue. Un error sigue siendo lo primero que se ve en la pantalla.
- **La idoneidad de la sección 6.2.** Es un orden, no cuatro categorías sueltas, así
  que se codifica como rampa de claridad: cuanto más idóneo, más claro. Va siempre con
  su etiqueta en texto —Total, Alta, Parcial, Nula—, que es lo que de verdad comunica
  el valor; el tono solo acompaña.

El contraste de cada tono de texto está comprobado contra el fondo y contra las
tarjetas. El escalón más bajo de la rampa es 4.9:1 sobre superficie, por encima del
mínimo AA de 4.5 para texto normal. El botón deshabilitado se vacía en lugar de bajar
de opacidad: un blanco al 60 % sobre negro queda gris sólido y parece pulsable.

## Estado del proyecto

MVP y fase 2 completos.

| Bloque | Estado |
|---|---|
| Esquema, migraciones y semillas (secc. 3 y 11) | Hecho |
| Idoneidad, estación efectiva y recomendación (secc. 6.2, 7.1, 7.2) | Hecho, con tests |
| Colección: listado, filtros, ficha y alta en pasos (secc. 4) | Hecho |
| Integración Fragrantica con sus dos fallbacks (secc. 5) | Hecho, con tests sobre fichas reales |
| Registro diario (secc. 6) | Hecho |
| Estadísticas (secc. 8) | Hecho, con tests |
| Importar, exportar y copia de seguridad (secc. 9) | Hecho, con tests |
| PWA: manifest, service worker, cola offline (secc. 11) | Hecho |
| Detección de huecos (secc. 10.1) | Hecho, con tests |
| Solapamiento en wishlist (secc. 10.2) | Hecho, con tests |
| Modo viaje (secc. 10.3) | Hecho, con tests |
| Recordatorio diario (secc. 10.4) | Hecho, con tests |

---

## Puesta en marcha

```bash
npm install
cp .env.example .env            # y rellena DATABASE_URL, AUTH_SECRET y SCENTIFY_USER_PASSWORD
npm run db:migrate              # aplica drizzle/*.sql en orden
npm run db:seed                 # usuario, contextos y umbrales por defecto
npm run dev                     # http://localhost:3000
npm test                        # tests de dominio
```

Todos los scripts leen `.env`, no solo `next dev`: `src/db/entorno.ts` carga el fichero
con el mismo cargador que usa Next, y lo importan `db:migrate`, `db:seed`,
`drizzle.config.ts` y los tests. Así no hay que exportar nada en el terminal, que además
es lo único que funciona igual en Windows, macOS y Linux.

En `.env` hacen falta tres cosas para arrancar. `DATABASE_URL` es la cadena de Neon —la
directa, sin `-pooler`, que sirve igual para migrar, sembrar y servir la app—.
`AUTH_SECRET` es cualquier cadena larga y aleatoria. `SCENTIFY_USER_PASSWORD` fija la
contraseña del único usuario: **sin ella el usuario se crea sin acceso posible**. El
correo de `SCENTIFY_USER_EMAIL` se guarda siempre en minúsculas, porque así es como lo
busca el login.

Para incluir los tests de integración hace falta una base de datos de usar y tirar; sin
`DATABASE_URL` se saltan solos y `npm test` sigue siendo instantáneo:

```bash
createdb scentify_test
DATABASE_URL=postgresql://…/scentify_test SCENTIFY_DB_DRIVER=tcp npm run db:migrate
DATABASE_URL=postgresql://…/scentify_test SCENTIFY_DB_DRIVER=tcp npm run db:seed
DATABASE_URL=postgresql://…/scentify_test SCENTIFY_DB_DRIVER=tcp npm test
```

No hay `npm run lint`: `next lint` está retirado desde Next 15.5 y no se ha sustituido
todavía por una configuración de ESLint propia. La comprobación estática es
`npm run typecheck`.

## Estructura

```
drizzle/            Migraciones SQL versionadas + journal
public/             Manifest, service worker e iconos de la PWA
src/app/            Pantallas (App Router), acciones de servidor y API
src/cliente/        Cola offline en IndexedDB
src/componentes/    Componentes compartidos
src/db/             Esquema Drizzle, migración y semillas
src/dominio/        Lógica pura: idoneidad, estación, recomendación, CSV,
                    parser de Fragrantica, estadísticas, huecos,
                    solapamiento y cobertura del modo viaje
src/servicios/      Acceso a datos, auth, clima, Fragrantica, importación
tests/              Tests de dominio; tests/integracion/ contra PostgreSQL
```

### El recordatorio diario

La sección 10.4 necesita tres cosas en producción, todas gratuitas:

1. Un par de claves VAPID (`npx web-push generate-vapid-keys`) en
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
2. Un `CRON_SECRET` cualquiera, que es lo que protege `/api/cron/recordatorio`.
3. El cron de `vercel.json`, configurado cada hora para poder respetar la hora que
   elijas. **En el plan Hobby de Vercel los crons se ejecutan una vez al día**, así que
   ahí el aviso llegará a la hora que Vercel decida, no a la tuya. Si eso molesta, la
   alternativa gratuita es un ping horario desde un servicio externo (cron-job.org o
   similar) a esa misma URL con la cabecera `Authorization: Bearer <CRON_SECRET>`.

El envío es idempotente: la tarea puede dispararse varias veces el mismo día y solo
manda un aviso, porque queda anotado en `recordatorio_enviado`.

### Sobre el parser de Fragrantica

Los tests corren contra dos fragmentos **reales** de fragrantica.es guardados en
`tests/fixtures/`: un superventas con miles de votos y una novedad con pocos, que es
lo que pide la sección 5.3. No son las páginas enteras, solo los bloques que el parser
mira, y hay una comprobación de que el recorte da exactamente el mismo resultado que
la página completa de la que salió.

Lo que la ficha real hace y no era evidente:

- Los recuentos vienen abreviados: `2.8k` son 2800 votos, `140K` son 140000.
- Los niveles de la pirámide se titulan «Notas de Salida», «Corazón» y «Base», y ese
  «Base» aparece también dentro de clases CSS como `text-base`, así que los rótulos se
  buscan como nodos de texto completos y no como palabras sueltas.
- «Notas de Salida» sale además en el `<meta description>` y en la prosa del resumen,
  mucho antes que la pirámide de verdad; por eso la búsqueda se ancla al contenedor
  `id="pyramid"`.
- Entre el rótulo de una nota y la siguiente hay miles de caracteres de SVG e
  imágenes, así que cualquier tope por longitud tiene que ser holgado.
- La ficha en español dice «se lanzó en 2022», no «launched in».

**Expectativa realista:** Cloudflare bloquea las IP de centro de datos, así que la
petición automática desde Vercel fallará a menudo. Los dos fallbacks de la 5.2 están
implementados y probados, y el de pegar el texto es el que más se va a usar.

### Sobre el modo viaje

Resolver «el set mínimo de frascos» es un problema de cobertura de conjuntos, NP-duro
en general. Aquí se resuelve de forma **exacta**, no con un voraz: seis contextos por
dos momentos son doce requisitos, o sea 4096 subconjuntos, y eso se recorre con
programación dinámica sobre máscaras de bits ramificando solo por el primer requisito
sin cubrir. Importa que sea exacto porque «llévate tres» cuando bastaban dos es justo
lo que no quieres al hacer la maleta. Por encima de veinte requisitos cae a voraz y lo
dice (`esOptimo: false`).

### Sobre la lógica de dominio

Todo lo de `src/dominio/` son funciones puras: sin red, sin base de datos y sin reloj
implícito (la fecha entra por parámetro). Es lo que permite que el mismo cálculo corra en
el servidor al guardar un uso y en el cliente al encolarlo sin conexión, y que se pueda
probar sin levantar nada.
