# Scentify

Webapp personal de gestión de colección de perfumes. Una cuenta por persona, cada
una con su colección, abierta a invitados con código (ver «Cuentas para amigos»); uso principal
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
| Despliegue | **Vercel** (hobby) + **Neon** (free) | Coste cero real; `git push` despliega y las migraciones corren en el `buildCommand` de producción. |

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

Oscuro cálido, un solo acento ámbar y canto vivo. La paleta sale de la propia
colección (oud, ámbar, cuero) y no de una terminal: fondo casi negro con un punto de
marrón, superficies en la misma familia y el ámbar `#d6a45e` como único acento.
Ningún elemento tiene las esquinas redondeadas; el radio se anula en el tema de
Tailwind, no por convenio, así que un `rounded-*` escrito más adelante seguirá dando
canto vivo.

- **El acento significa algo.** Marca la acción principal, lo que está seleccionado
  y, en los gráficos, el dato que domina. Fuera de eso no aparece.
- **La idoneidad lleva color** (sección 6.2): verde, verde claro, ámbar y rojo, siempre
  con su etiqueta en texto. En el desglose por eje, el que falla va en rojo y negrita,
  porque es el que hay que ver.
- **Dos familias de piezas que no se mezclan.** Lo que se pulsa (`.opcion`, `.chip`)
  lleva contorno y área táctil completa, y al estar elegido se rellena de ámbar; el
  estado se lee de `aria-pressed` (o `data-activo`), así que estilo y accesibilidad no
  se separan. Lo que solo informa (`.etiqueta`) es texto sobre un fondo tintado, sin
  borde, para que no parezca un botón.
- **Dos voces tipográficas.** Fraunces, servida con `next/font` desde el propio dominio
  (también offline), para títulos y nombres de perfume; la del sistema para todo lo
  demás. Los encabezados de sección van en versalitas pequeñas (`.subtitulo`).
- **Los estados** (`aviso-error`, `aviso-atencion`, `aviso-hecho`) llevan el tono
  semántico en el filete lateral y el contraste en el texto.

El contraste de cada tono de texto está comprobado contra `superficie-alta`, el fondo
más claro sobre el que se escribe: el más bajo, `id-nula`, da 5.6:1, por encima del AA
de 4.5. El botón deshabilitado se vacía y queda solo el contorno, y el hover se aplica
con `:not(:disabled)` para que un botón deshabilitado no vuelva a rellenarse con el
cursor encima.

**El registro de un toque.** Los accesos rápidos de «Hoy» registran directamente, con
el momento que toca por la hora (noche a partir de las 18:00), el contexto habitual de
ese momento en ese tipo de día (laborable o fin de semana) y la media de sprays del
perfume. Un aviso flotante ofrece «Deshacer» y «Ajustar» durante ocho segundos. El
formulario completo sigue ahí para buscar un perfume o cambiar algo, con la fecha
plegada y el botón de registrar fijo encima de la barra inferior.

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
| Cuentas para amigos con código de invitación | Hecho, con tests |
| Fichas de perfume compartidas entre cuentas | Hecho, con tests |

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
contraseña del primer usuario, el tuyo: **sin ella el usuario se crea sin acceso posible**. El
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

## Despliegue en Vercel

```
Neon (base) → variables en Vercel → importar el repo → sembrar el usuario
```

1. **Base de datos.** En [neon.com](https://neon.com), proyecto nuevo y copiar la cadena
   de conexión **directa** (la que no lleva `-pooler`). Sirve igual para migrar, sembrar
   y servir.
2. **Importar el repositorio** en [vercel.com](https://vercel.com). Detecta Next.js solo;
   no hay que tocar el framework ni el directorio de salida.
3. **Variables de entorno**, antes del primer despliegue. `DATABASE_URL` y `AUTH_SECRET`
   son las únicas imprescindibles. Si se añaden después, hay que volver a desplegar.
4. **Desplegar.** El `buildCommand` de `vercel.json` aplica las migraciones antes de
   compilar, así que cada despliegue de producción deja la base al día. Un fallo de
   conexión rompe el build en vez de publicar una app sin tablas, que es lo que se quiere.

   **Las previews no migran.** Cada PR tiene su despliegue de preview, y si comparte
   `DATABASE_URL` con producción migraría la base real antes de fusionar, con la versión
   publicada todavía en el código viejo. `src/db/migrate.ts` solo migra cuando
   `VERCEL_ENV` es `production`. Si las previews tienen base propia (una rama de Neon,
   por ejemplo con la integración de Neon para Vercel), pon
   `SCENTIFY_MIGRAR_EN_PREVIEW=1` en el entorno Preview y migrarán también.
5. **Sembrar el usuario**, una sola vez, desde local apuntando a Neon:

   ```bash
   DATABASE_URL="<la cadena de Neon>"    SCENTIFY_USER_EMAIL="tu@correo.com"    SCENTIFY_USER_PASSWORD="tu contraseña"    npm run db:seed
   ```

   En Windows esa sintaxis no funciona: pon las tres variables en tu `.env` local,
   con `DATABASE_URL` apuntando a Neon, y ejecuta `npm run db:seed` a secas.

   No va en el build a propósito: metería la contraseña en las variables del proyecto
   sin necesidad, y solo hace falta una vez. Es idempotente, y repetirla es además la
   forma de **cambiar la contraseña**: si se da `SCENTIFY_USER_PASSWORD` se actualiza,
   y si no se da se conserva la que hubiera. La salida dice siempre en qué estado
   queda el acceso, leyéndolo de la base.

Para que tus amigos puedan crearse cuenta hace falta además
`SCENTIFY_CODIGO_INVITACION` (ver «Cuentas para amigos»). Sin ella el registro está
cerrado y la app sigue siendo solo tuya.

Para el recordatorio diario hacen falta además `VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` y `CRON_SECRET`
(ver «El recordatorio diario»). Sin ellas el resto de la app funciona igual.

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

### Cuentas para amigos

Cada cuenta tiene su propia colección, sus usos, su wishlist, sus contextos y sus
umbrales, y nadie ve los de nadie. Lo que sí es común son las **fichas** de los
perfumes (ver «Fichas compartidas») y el vocabulario de notas y familias.

El registro está en `/registro` y **solo funciona con código de invitación**:

1. En Vercel, añade la variable `SCENTIFY_CODIGO_INVITACION` con el código que
   quieras (algo largo: es lo único que separa tu base de Neon de cualquiera que
   encuentre la URL) y vuelve a desplegar.
2. Pásale a tu amigo el enlace con el código ya puesto:
   `https://<tu-app>.vercel.app/registro?codigo=<el código>`. También puede ir al
   login y pulsar «Crea tu cuenta».
3. Al crear la cuenta se le siembran los seis contextos y los umbrales por defecto
   —lo mismo que hace `db:seed` contigo— y entra directamente.

Para cerrar el registro, borra la variable y vuelve a desplegar; las cuentas que ya
existan siguen funcionando. Cambiar el código invalida los enlaces que hayas pasado.
No hay recuperación de contraseña: si alguien la olvida, hay que cambiársela a mano
en la base.

Con la app de un solo usuario no importaba que una consulta se fiara del id que
mandaba el cliente. Con varias cuentas sí, y se ha cerrado: registrar un uso, dar de
alta o editar un perfume, editar un deseo, restaurar una copia y borrar una
suscripción de avisos comprueban que los perfumes, contextos y deseos que llegan son
de la cuenta de la sesión. `tests/integracion/registro.test.ts` lo fija con dos
cuentas reales.

### Fichas compartidas

Un perfume se da de alta **una sola vez** para todo el grupo. Un perfume de tu
colección son dos cosas:

| Ficha: común a todos | Frasco: solo tuyo |
|---|---|
| Nombre, marca, concentración, año | Lo tengo / lo tuve, archivado |
| URL de Fragrantica | Valoración, volumen, fecha de compra |
| Pirámide de notas y familias | Notas personales |
| | Estaciones, momentos y contextos |

Las estaciones, los momentos y los contextos son del frasco porque son tu opinión
de cuándo ponértelo, y son lo que mueve la recomendación: que a alguien un perfume
le parezca de invierno no te lo tiene que quitar a ti del verano.

- **Al dar de alta**, mientras escribes el nombre aparece «Ya está en Scentify» con
  las fichas que coinciden. «Usar esta ficha» rellena de golpe lo común y te lleva a
  lo tuyo, con las estaciones y los momentos de quien la dio de alta ya marcados
  como punto de partida. Si ya lo tienes, te lleva a tu frasco.
- **Compartir desde Fragrantica** una ficha que alguien ya dio de alta la usa
  directamente, sin volver a leerla.
- **Editar la ficha la edita para todos.** La pantalla de edición avisa cuando
  alguien más tiene el perfume. Si al corregir la concentración resulta que esa
  ficha ya existe (lo metiste como EDT y era EDP), tu frasco pasa a la ficha que
  ya existía, en vez de dar error.
- **Dar de alta a mano algo que ya existe**, sin elegirlo de la lista, o importarlo
  por CSV, lo engancha a la ficha que ya hay y solo rellena lo que le falte. Quien
  lo escribe no ha visto la ficha, y así no puede dejar sin notas a los demás.

La clave de una ficha es nombre + marca + concentración, sin distinguir tildes ni
mayúsculas. El EDT y el EDP de un mismo perfume son dos fichas, porque huelen
distinto.

La migración `0003_fichas_compartidas` convierte los perfumes que ya hubiera en
fichas + frascos sin perder nada: los ids de los perfumes no cambian, así que los
usos, los descartes y la wishlist siguen apuntando donde estaban. La copia de
seguridad pasa a la versión 2, con las fichas dentro, y restaurar una copia de la
versión 1 sigue funcionando.

### El recordatorio diario

La sección 10.4 necesita tres cosas en producción, todas gratuitas:

1. Un par de claves VAPID (`npx web-push generate-vapid-keys`) en
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
2. Un `CRON_SECRET` cualquiera, que es lo que protege `/api/cron/recordatorio`.
3. El cron de `vercel.json`, **diario** (`0 20 * * *`). No es una preferencia: el plan
   Hobby de Vercel **rechaza el despliegue entero** si un cron correría más de una vez
   al día, con «Hobby accounts are limited to daily cron jobs». Un cron horario no es
   un aviso, es un despliegue que no sale.

Que sea diario basta porque el envío no exige que el cron caiga en la hora exacta: se
manda si la hora local ya ha pasado la configurada, y queda anotado en
`recordatorio_enviado` para no repetir. Las 20:00 UTC son las 21:00 en invierno y las
22:00 en verano, o sea nunca antes de las 21:00, que es la hora por defecto. Cambiar
`schedule` es cuestión de editar `vercel.json`, recordando que va en UTC.

El límite real está en configurar una hora **más tardía** que el cron: ese día no
saldrá, porque no habrá otra pasada. Para que la hora se respete de verdad hace falta
una pasada por hora, y la alternativa gratuita es un ping horario desde un servicio
externo (cron-job.org o similar) a esa misma URL con la cabecera
`Authorization: Bearer <CRON_SECRET>`; en ese caso se quita `crons` de `vercel.json`.

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
- La maquetación no es una sola: hay fichas donde la pirámide va al final, detrás de
  las fotos y las reseñas, y donde no aparece «Votar por ingredientes» por ningún
  lado. Cualquier instrucción al usuario que nombre rótulos concretos se rompe en
  alguna ficha, así que la pantalla pide la página entera y es el parser quien acota.
- Buscar las etiquetas de voto por toda la fuente es una trampa. En una ficha real, el
  titular «9 PM NIGHT OUT Afnan» de las noticias del pie daba «night» con un 9 al
  lado, que ganaba a los 3.300 votos reales de noche: el eje quedaba en 100 % día y
  0 % noche, un número rotundo y falso. Por eso los votos se buscan solo dentro del
  bloque «Cuándo usarlo», igual que la pirámide se ancla a su contenedor. El fixture
  `fragrantica-pegado-ruidoso.txt` es esa página entera y lo fija.
- La misma página repite cada nota dos veces y el bloque de votos entero otra vez más;
  el parser deduplica y se queda con el primer bloque.
- Los acordes principales marcan solas las familias que coinciden
  (`src/dominio/familias.ts`). Fragrantica los escribe en plural a veces
  («florales», «afrutados») y en inglés en la ficha inglesa, así que se comparan en
  singular y con una tabla de alias, pero siempre enteros: «cálido especiado» tiene
  familia propia y no marca además «Especiado». Lo que no tiene familia en Scentify
  (lavanda, herbal…) se dice debajo en vez de inventar una.

**En el móvil: Compartir → Scentify.** Seleccionar y copiar texto en un teléfono es
incómodo, así que la app se registra como destino de compartir (`share_target` del
manifest), y admite las dos formas de compartir que ofrece Android:

- **La página.** Llega la dirección y se intenta la lectura automática.
- **La selección de texto.** Seleccionar todo y compartir *la selección* manda la
  página entera como texto; se parsea en el servidor y el formulario se abre con las
  notas, los acordes y los votos ya puestos. Con Cloudflare bloqueando, este es el
  camino que de verdad funciona, y evita el baile de copiar, cambiar de aplicación y
  pegar.

Por eso el `share_target` es POST con `multipart/form-data`: el texto de una ficha
ronda los 17 kB y no cabe en una query. Lo que viaja del destino de compartir al
formulario no es ese texto sino la ficha ya leída, unos 700 caracteres, validada al
llegar en `desempaquetarFicha()` porque va por la URL.

De la propia URL salen además la marca y el nombre, porque las fichas siguen siempre
el patrón `/perfume/<Marca>/<Nombre>-<id>.html`. Eso vale aunque Cloudflare bloquee la
lectura: la dirección la tenemos siempre. Si no hay sesión, se pide la contraseña y se
vuelve a lo compartido en vez de perderlo; el destino de vuelta se filtra en
`destinoSeguro()` para que el login no acabe siendo un redirector abierto.

Es de Android: Safari en iOS no implementa Web Share Target para webapps.

**Descartado: la captura de pantalla.** Medida a 390 px, una ficha real ocupa 58.022 px
de alto, unas 69 pantallas de móvil, y los tres datos que hacen falta están en las
pantallas 4 (acordes), 9 (votos) y 20 (pirámide). Harían falta tres capturas apuntadas
a mano y luego leer por OCR recuentos como `1.8k`, donde confundirlo con `18k` cambia
el porcentaje por completo. Más trabajo que copiar el texto, y menos fiable.

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
