# Webapp de gestión de colección de perfumes — Especificación

## 1. Contexto y objetivo

Aplicación web personal, de un solo usuario, para:

1. Mantener el inventario de mi colección de perfumes.
2. Registrar qué perfume uso cada día, en qué momento y para qué contexto.
3. Recibir recomendaciones de qué ponerme, basadas en idoneidad y en rotación.
4. Consultar estadísticas de uso de la colección.

El uso principal es **desde el móvil**, de pie, por la mañana, en menos de diez segundos. Todo lo demás está subordinado a eso.

Mi colección tira a perfumería árabe y oriental: oud, ámbar, cuero, sándalo, amaderados, especiados y marinos. Marcas habituales: Lattafa, Asdaaf, Armaf, Rasasi. Aplico generoso (muchos sprays). Vivo en El Campello, Alicante: clima mediterráneo costero, veranos largos, calurosos y húmedos, inviernos suaves.

---

## 2. Decisiones ya tomadas

- **Stack**: libre elección, con las restricciones de la sección 11. Justifica brevemente la elección en el README antes de empezar.
- **Usuario**: uno solo. Autenticación simple, pero el esquema debe llevar `user_id` en las tablas principales para poder crecer sin migración dolorosa.
- **Fragrantica**: sin scraping automático ni masivo. Yo pego la URL de la ficha y el backend la procesa bajo demanda, una a una. Detalle en la sección 5.
- **Los votos de Fragrantica no se persisten.** Se usan como apoyo visual en el momento de categorizar y se descartan. Detalle en 5.3.
- **Idioma de la interfaz**: español.

---

## 3. Modelo de datos

Nombres en español para las entidades de dominio. Esquema orientativo: ajústalo si hay una forma mejor, pero respeta las relaciones y las reglas duras.

### `perfume`
| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid | |
| `nombre` | text | obligatorio |
| `marca` | text | obligatorio |
| `concentracion` | enum | EDC, EDT, EDP, Extrait, Parfum, Aceite, Otro |
| `anio_lanzamiento` | int | nullable |
| `volumen_ml` | int | nullable, informativo |
| `fecha_compra` | date | nullable |
| `estado` | enum | `LO_TENGO`, `LO_TUVE` |
| `valoracion` | int | 1-5, nullable |
| `notas_personales` | text | nullable |
| `fragrantica_url` | text | nullable, se conserva para poder reconsultar |
| `archivado` | bool | por defecto false |
| `creado_en` / `actualizado_en` | timestamp | |

**Regla dura: un perfume nunca se borra, se archiva.** Hay registros de uso que dependen de él.

### `nota` y `perfume_nota`
- `nota`: `id`, `nombre` (único, normalizado en minúsculas y sin acentos para deduplicar).
- `perfume_nota`: `perfume_id`, `nota_id`, `nivel` enum (`SALIDA`, `CORAZON`, `FONDO`), `orden`.

No guardes las notas como tres campos de texto plano. La tabla normalizada es lo que permite filtrar y hacer estadística por nota.

### `familia` y `perfume_familia`
Familia olfativa y acordes principales: amaderado, oriental, ámbar, cuero, marino/acuático, aromático, especiado, cítrico, floral, gourmand, fougère, chipre… Relación N:M con orden de relevancia.

### `contexto`
Tabla, **no enum en código**, para poder añadir o renombrar sin tocar el build.

Semillas iniciales, exactamente estas seis:

| slug | nombre |
|---|---|
| `oficina` | Oficina |
| `gimnasio` | Gimnasio |
| `cita` | Cita |
| `amigos` | Amigos |
| `elegante` | Ocasión elegante |
| `casa` | Casa |

Los contextos describen **entorno social y formalidad**, nunca la hora del día: el día/noche es un eje independiente y duplicarlo rompería el cálculo de idoneidad.

### `perfume_contexto`
`perfume_id`, `contexto_id`. Mínimo uno por perfume, editable siempre.

### `perfume_estacion`
`perfume_id`, `estacion` enum (`PRIMAVERA`, `VERANO`, `OTONO`, `INVIERNO`).

Solo las estaciones que yo he marcado. **Sin columnas de votos.**

### `perfume_momento`
`perfume_id`, `momento` enum (`DIA`, `NOCHE`). Igual: solo mi selección.

### `uso`
| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid | |
| `perfume_id` | fk | |
| `fecha` | date | por defecto hoy, **editable** |
| `momento` | enum | DIA / NOCHE |
| `contexto_id` | fk | uno por registro |
| `sprays` | int | nullable |
| `duracion_percibida` | enum | nullable: `MENOS_2H`, `2_4H`, `4_6H`, `6_8H`, `MAS_8H` |
| `valoracion_dia` | int | 1-5, nullable |
| `idoneidad_pct` | int | snapshot en el momento del registro |
| `idoneidad_detalle` | json | `{momento: bool, contexto: bool, estacion: bool}` |
| `estacion_efectiva` | enum | la que se usó para calcular, ver 7.1 |
| `comentario` | text | nullable |
| `creado_en` | timestamp | |

La idoneidad se guarda como snapshot porque la configuración del perfume puede cambiar después y el histórico debe reflejar lo que se sabía ese día.

### `wishlist`
`id`, `nombre`, `marca`, `prioridad` enum (`EN_EL_RADAR`, `LO_QUIERO`, `LO_NECESITO`), `precio_objetivo` decimal nullable, `notas` text, `fragrantica_url` nullable, `creado_en`, `convertido_a_perfume_id` nullable.

`precio_objetivo` es el precio máximo que estoy dispuesto a pagar, no una estimación de mercado.

### `ajustes`
Clave-valor para la configuración de usuario: ubicación por defecto (lat, lon, etiqueta) y los umbrales de temperatura de la sección 7.1.

---

## 4. Funcionalidad — Colección

### 4.1 Añadir perfume

Formulario en pasos, optimizado para móvil:

1. **Nombre y marca.** Autocompletado contra mi colección para avisar de duplicados.
2. **Enriquecimiento (opcional).** Pego la URL de Fragrantica → sección 5. Si no la pego o falla, sigo a mano sin fricción.
3. **Notas.** Salida, corazón y fondo. Autocompletado contra la tabla `nota` y creación al vuelo de notas nuevas.
4. **Familias olfativas.**
5. **Estaciones.** Se muestran los votos de Fragrantica como apoyo visual (ver 5.3) y **yo marco** las estaciones. Mínimo una.
6. **Momento del día.** Igual: votos como referencia, yo marco DIA, NOCHE o ambos. Mínimo uno.
7. **Contextos.** Mínimo uno, varios permitidos.
8. **Inventario.** Volumen, fecha de compra, estado, concentración. Solo el estado es obligatorio.

Todos los campos de los pasos 3 a 8 son editables después desde la ficha.

### 4.2 Estados

| Estado | Aparece en recomendaciones | Cuenta en estadísticas |
|---|---|---|
| `LO_TENGO` | Sí | Sí |
| `LO_TUVE` | **No** | **Sí** (histórico completo) |

Esta regla es explícita y debe estar cubierta por un test: marcar un perfume como `LO_TUVE` lo saca del motor de recomendación pero no altera ni un dato de las estadísticas pasadas.

### 4.3 Ficha de perfume

Pantalla de detalle con datos, pirámide de notas, estaciones, momentos, contextos y el **historial completo de usos**, más su bloque de promedios:

- Veces usado y fecha del último uso.
- **Sprays habituales** (media redondeada).
- **Duración esperada** (moda de `duracion_percibida`).
- **Valoración media** de `valoracion_dia`.
- Contexto y estación más frecuentes.

Estos tres promedios se muestran también en la tarjeta de recomendación (7.2) y en el formulario de registro al seleccionar el perfume, para saber de antemano cuántos sprays suelo echarme y qué esperar.

Botón **"Volver a consultar Fragrantica"**, que reabre el paso 5-6 con los votos delante por si quiero revisar la categorización.

### 4.4 Listado y filtros

Buscador de texto más filtros combinables por estado, marca, familia, nota, estación, contexto, momento y valoración. Ordenación por nombre, marca, último uso y más usado.

### 4.5 Wishlist

CRUD con los tres niveles de prioridad, precio objetivo, notas y fecha de alta. Ordenable por prioridad y por antigüedad, para ver qué lleva meses ahí sin que lo compre.

Acción **"Convertir en colección"**, que abre el formulario de alta prerrellenado con lo que ya hubiera.

---

## 5. Integración con Fragrantica

### 5.1 Flujo

**No hagas un scraper automático ni recorras el sitio.** Fragrantica está detrás de Cloudflare y sus términos no permiten la recolección automatizada. El flujo es puntual y lo disparo yo:

1. Pego la URL de una ficha concreta.
2. El backend hace **una** petición server-side, con User-Agent de navegador normal y timeout corto.
3. Parsea:
   - **Bloque "Cuándo usarlo" / "When to wear"**: las cuatro estaciones con su número de votos. Los datos aparecen tanto como número visible como en el `style="width:X%"` de las barras; extrae ambos y quédate con el que esté disponible.
   - **Bloque día/noche**: misma estructura.
   - **Pirámide de notas**: salida, corazón y fondo.
   - Marca, año y acordes principales si están accesibles.
4. Normaliza los votos a porcentaje sobre el total de cada eje.

### 5.2 Fallbacks obligatorios

En este orden:

1. Si la petición falla (Cloudflare, timeout, 403), error claro y un **textarea para pegar el texto copiado del bloque** desde el navegador, parseado con las mismas reglas.
2. Si eso tampoco, formulario manual: marco estaciones y momentos sin referencia.

**La app nunca debe quedar bloqueada porque Fragrantica no responda.** Ninguna lógica de negocio depende de estos datos: la lógica corre sobre lo que yo marco.

**No uses un LLM para generar los votos.** Para sugerir las notas sí puede valer, siempre marcado como sugerencia y confirmado por mí. Los votos son datos concretos que un modelo se inventaría.

### 5.3 Los votos no se persisten

Los porcentajes y recuentos se muestran **solo en la pantalla de categorización**, junto a cada casilla, como ayuda para decidir. Al guardar, se descartan: en base de datos solo quedan mis selecciones de `perfume_estacion` y `perfume_momento`.

Se conserva `fragrantica_url` para poder reconsultar bajo demanda desde la ficha.

Al probar el parser, hazlo con al menos una ficha muy votada y otra de nicho con pocos votos: el bloque se renderiza distinto cuando hay pocos datos.

---

## 6. Funcionalidad — Registro diario ("Hoy estoy usando…")

### 6.1 Formulario

- **Buscador de perfume**: a partir del tercer carácter muestra coincidencias de mi colección por nombre y marca, insensible a acentos y mayúsculas. Solo perfumes no archivados. Encima, accesos rápidos: los 5 usados más recientemente y un botón **"Repetir el de ayer"**.
- Al seleccionar el perfume, muestra su bloque de promedios (4.3) antes de rellenar el resto.
- **Fecha**: prerrellenada con hoy, **editable hacia atrás**.
- **Momento**: DIA / NOCHE.
- **Contexto**: uno.
- **Sprays**: opcional, prerrellenado con la media histórica de ese perfume.
- **Duración percibida** y **valoración del día** (1-5): opcionales, rellenables después desde el historial (por la noche, no por la mañana).
- **Comentario**: opcional.

**Se pueden registrar varios perfumes el mismo día**, cada uno con su momento y contexto. Si intento registrar el mismo perfume en la misma fecha, avisa de posible duplicado pero permite guardar.

### 6.2 Cálculo de idoneidad

Tres ejes, cada uno vale un tercio:

```
momento_ok  = momento elegido ∈ momentos marcados del perfume
contexto_ok = contexto elegido ∈ contextos del perfume
estacion_ok = alguna estación marcada del perfume ∈ estaciones compatibles de hoy (7.1)

idoneidad = round(100 × aciertos / 3)
```

| Valor | Etiqueta | Color |
|---|---|---|
| 100 | Total | verde |
| 67 | Alta | verde claro |
| 33 | Parcial | ámbar |
| 0 | Nula | rojo |

**La idoneidad informa, nunca bloquea el registro.** Y siempre se muestra el desglose por eje, no solo el número: *"Encaja en contexto y en estación, pero lo tienes marcado solo para noche."*

---

## 7. Funcionalidad — Recomendación

### 7.1 Estación efectiva por temperatura

**El calendario es un mal proxy en clima mediterráneo**: hay 26° en noviembre y mañanas frescas en septiembre. La estación se deduce del tiempo real, con el calendario solo como desempate.

**Ubicación.** Configurada en ajustes (por defecto El Campello, Alicante), con botón opcional de "usar mi ubicación actual" para viajes. **No pidas permiso de geolocalización en cada apertura.**

**Fuente.** Open-Meteo: gratuita, sin API key ni registro. Pide `temperature_2m_max`, `temperature_2m_min` y humedad relativa media del día. **Una llamada al día, cacheada.**

**Algoritmo:**

```
entretiempo = PRIMAVERA si mes ∈ [1..6], OTONO si mes ∈ [7..12]

t = temperatura_maxima            si momento = DIA
t = (maxima + minima) / 2         si momento = NOCHE

si humedad_media > 70% y t >= 24:  t = t + 2     // bochorno costero

t >= 28        → {VERANO}
24 <= t < 28   → {VERANO, entretiempo}
18 <= t < 24   → {entretiempo}
13 <= t < 18   → {entretiempo, INVIERNO}
t < 13         → {INVIERNO}
```

**Los cinco umbrales y el ajuste por humedad van en la tabla `ajustes`**, editables desde una pantalla de configuración. Los valores de arriba son un punto de partida, no una verdad: después de un par de meses de uso querré moverlos.

**Fallback obligatorio:** si no hay conexión o la API falla, se usa la estación por calendario y la interfaz lo indica (*"Sin datos de tiempo, usando otoño por fecha"*). Es una PWA que debe funcionar offline.

La estación propuesta siempre es **visible y sobrescribible** por mí, con su explicación: *"26° hoy en El Campello → otoño y verano compatibles."*

### 7.2 "Recomiéndame un perfume"

Pregunta solo **momento** y **contexto**. La estación se calcula con 7.1.

Filtros duros: `estado = LO_TENGO`, no archivado.

1. Selecciona los candidatos con **idoneidad 100**.
2. Ordena por **días desde el último uso**, de más a menos. Los nunca usados van primeros.
3. Devuelve los **3 primeros**.
4. Si hay menos de 3 con idoneidad total, completa con los de idoneidad 67 **marcados visualmente como coincidencia parcial**, indicando qué eje falla.

Cada recomendación muestra su **explicación en texto** y el bloque de promedios del perfume: *"Llevas 47 días sin ponértelo · encaja con Oficina, Día y otoño · sueles echarte 6 sprays · te suele durar 6-8h."*

Debajo, bloque separado de hasta 3 **"Nunca los has usado"**: perfumes de la colección con cero registros que cumplen los filtros duros.

Acciones por recomendación:
- **"Me lo pongo"** → registra el uso de un toque, sin volver a pedir momento ni contexto.
- **"Otro"** → descarta esa sugerencia durante el resto del día y **muestra la siguiente de la lista** en su lugar.

---

## 8. Funcionalidad — Estadísticas

Periodos: 30 días, 90 días, año en curso, últimos 365 días, rango personalizado.
Filtros: momento (DIA / NOCHE / ambos) y contexto.

Contenido:

1. **Ranking de más usados**, con número de usos.
2. **Sin usar en el periodo**: perfumes en colección con cero registros, ordenados por días desde el último uso.
3. **Índice de rotación**: perfumes distintos usados / total en colección.
4. **Distribución por familia olfativa** y por nota más frecuente.
5. **Distribución por contexto** y por momento.
6. **Heatmap anual** tipo calendario de contribuciones con los días que tienen registro.
7. **Tasa de acierto**: % de registros con idoneidad 100.
8. **Comparativa contra el periodo anterior equivalente** en los indicadores 1, 3 y 7.
9. **Promedios de aplicación**: sprays medios, duración percibida más frecuente y valoración media, globales y por perfume.

---

## 9. Funcionalidad — Datos

- **Exportación CSV** de colección y de histórico de usos.
- **Importación CSV** de colección, con previsualización y validación antes de confirmar. Necesaria el primer día para cargar la colección entera de golpe.
- **Backup completo en JSON** y restauración desde JSON.

No es opcional: se introduce mucha información a mano y perderla sería inaceptable.

---

## 10. Funcionalidad — Fase 2

### 10.1 Detección de huecos
Cruce de contextos × momentos × estaciones contra la colección, listando las combinaciones sin cobertura: *"No tienes ningún perfume marcado para Oficina + Verano + Día."* Cada hueco enlaza a crear una entrada de wishlist.

### 10.2 Solapamiento en wishlist
Al añadir un deseo, si comparte 3 o más notas de fondo con perfumes que ya tengo, aviso sin bloquear: *"Se parece a X e Y que ya tienes."*

### 10.3 Modo viaje
Le indico los días y los contextos previstos y propone el **set mínimo de frascos** que los cubre, resolviendo la cobertura con el menor número de perfumes posible. Permite fijar la ubicación de destino para que la estación efectiva se calcule con el tiempo de allí.

### 10.4 Recordatorio diario
Aviso para registrar el uso del día si a cierta hora no hay ningún registro.

---

## 11. Requisitos no funcionales

- **Mobile-first de verdad.** Diseña para 390 px de ancho y escala hacia arriba. Áreas táctiles grandes, formularios en una columna, nada de tablas anchas sin scroll horizontal controlado.
- **PWA instalable**: manifest, service worker, icono, arranque a pantalla completa. Caché offline de la colección y **cola de registros de usos offline** que se sincroniza al recuperar conexión.
- **Persistencia real y alojada**: base de datos relacional, no almacenamiento en el navegador. Debe ser accesible desde el móvil fuera de casa.
- **Despliegue sencillo**, de coste cero o casi cero en capa gratuita.
- **Migraciones versionadas** desde el primer commit.
- **Semillas**: los seis contextos, una lista inicial razonable de notas y familias olfativas, y los umbrales de temperatura por defecto.
- **Tests** de las tres piezas con lógica real: cálculo de idoneidad, estación efectiva por temperatura (incluidos los bordes de cada umbral y el fallback sin conexión) y orden del motor de recomendación.

---

## 12. Alcance

**MVP:** secciones 3, 4, 5, 6, 7, 8, 9 y 11.

**Fase 2:** sección 10 completa.

---

## 13. Criterios de aceptación del MVP

1. Doy de alta un perfume pegando una URL de Fragrantica, veo los votos al categorizar y, tras guardar, **esos votos no están en base de datos**.
2. Si la petición a Fragrantica falla, completo el alta a mano sin perder lo ya escrito.
3. Registro un uso en menos de diez segundos desde el móvil y veo la idoneidad con su desglose por eje.
4. Registro tres perfumes distintos el mismo día con contextos distintos.
5. Registro un uso de hace cuatro días.
6. Un día de 27° en noviembre, la app propone verano y otoño como compatibles; un día de 15° en septiembre, propone otoño e invierno. Puedo sobrescribir ambas.
7. Sin conexión, la estación cae al calendario y la interfaz lo indica.
8. Pido recomendación para Oficina + Día: recibo tres perfumes ordenados por tiempo sin usar, con explicación y promedios, más el bloque de nunca usados. Descarto uno y aparece el cuarto.
9. Un perfume marcado como `LO_TUVE` desaparece de las recomendaciones pero sigue en el ranking de estadísticas.
10. Cambio los contextos de un perfume ya registrado y las idoneidades históricas **no** cambian.
11. Importo un CSV con 40 perfumes y exporto el histórico completo.
12. Instalo la app en la pantalla de inicio del móvil y registro un uso sin conexión, que se sincroniza al volver la cobertura.
