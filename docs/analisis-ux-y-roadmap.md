# Scentify: análisis de la experiencia de uso y propuestas de features

*Octubre de 2026. Análisis sobre `main` en f243d18 (calendario en Más ya incluido).*

## Resumen

El núcleo está muy bien resuelto. El registro de un toque cumple de verdad los diez
segundos. La cola offline es idempotente. La idoneidad y la estación efectiva son
funciones puras con tests, y las explicaciones en lenguaje natural («Llevas 22 días
sin ponértelo · encaja con Casa, Noche y otoño») son el punto fuerte de la app. Los
problemas no están en el centro sino **alrededor**:

1. **La app se rompe sin red justo donde promete que no.** «Me lo pongo» y «Otro» sin
   cobertura tumban la PWA con un «Application error» en inglés, debajo de un banner
   que dice «Puedes registrar igual». No hay `error.tsx`, `loading.tsx` ni
   `not-found.tsx`. El service worker sirve Hoy en cualquier URL.
2. **Lo que pasa después de registrar está a medias.** «Ajustar» borra el uso antes
   de confirmar. «Repetir el de ayer» guarda otro momento y contexto de los que
   anuncia. El toque no avisa de duplicados. Completar duración y valoración por la
   noche cuesta unos 9 toques y 950 px de scroll en otra pestaña, así que casi nunca
   se hace, y son justo los datos que alimentan promedios, recomendación y casi
   cualquier insight futuro.
3. **Hay flujos que se cortan a un paso del final.** `marcarConvertido` no la llama
   nadie, así que el deseo comprado se queda en la wishlist. El enlace de un hueco a
   la wishlist pierde el hueco. «Volver a consultar Fragrantica» abre el paso 1 sin
   consultar nada. El filtro por nota está hecho en el servicio pero no en la
   pantalla.
4. **Mantener los datos cuesta demasiado.** Editar un contexto son 7 toques de
   «Siguiente». La búsqueda exige el orden literal «nombre marca» («lattafa khamrah»
   da 0). La ficha de un perfume muy usado mide 11.668 px. Los deseos no se editan.
   Los contextos no se pueden crear ni renombrar desde la app, aunque la spec los hizo
   tabla para eso.
5. **Las fichas compartidas tienen agujeros de integridad.** «Cambiar» durante un
   alta con ficha del catálogo renombra el perfume para las demás cuentas, y compartir
   desde Fragrantica algo que ya tienes crea un frasco duplicado sin avisar.
6. **El primer uso de un amigo es una pantalla vacía.** Ve un buscador que no
   encuentra nada, textos que culpan a sus filtros («Nada con estos filtros» sin haber
   filtrado) y, sin clave de Claude, una pestaña de cinco con instrucciones de
   despliegue.
7. **Se recogen datos que no se convierten en decisiones.** La «Tasa de acierto» no
   se explica. Los huecos pesan igual aunque nunca vayas al gimnasio de noche. Lo que
   marcas y cómo usas de verdad cada perfume divergen, y nada te lo dice. La
   temperatura se calcula en cada uso y se tira.

**En números.** 7 auditorías por área produjeron 99 hallazgos. Un verificador
adversarial por área intentó refutarlos: 55 se confirmaron tal cual, 43 se
confirmaron con matices (sobre todo bajando la severidad) y 1 se refutó. Los
verificadores añadieron 16 que nadie había visto. Quedan **114 problemas
verificados: 7 de severidad alta, 60 media y 47 baja**, casi todos de esfuerzo S. En
paralelo, 5 ángulos de ideación aportaron 99 ideas, que se consolidaron en **30
features** (comprobadas contra el código) y 16 descartes justificados.

## Las 10 cosas que haría primero

Mezcla arreglos y features, ordenada por retorno. Las cinco primeras no tocan el esquema.

1. **Que no se rompa sin red ni con la sesión caducada** (S-M). Fronteras de error
   y 404 en español. «Me lo pongo» de Sugerir por `registrarAlToque` y `encolarUso`,
   como Hoy. Timeout de ~3 s en `redPrimero` y que nunca sirva `/` para otra ruta.
   Conservar `/sin-conexion` al limpiar cachés. `try/finally` en el guardado del alta.
   Cubre TRV-1, TRV-2, SUG-1, ALTA-2 y HOY-13.
2. **Blindar las fichas compartidas** (S). En un alta con ficha elegida, lo común es
   de solo lectura y «Cambiar» pasa a ser «No es este perfume». `crearPerfume` no
   renombra nunca. «Ya lo tienes» también en la revisión y en el flujo de compartir
   (ALTA-1 y ALTA-6, más el hallazgo nuevo de alta severidad).
3. **Pulir el registro de un toque** (S cada uno). «Ajustar» edita sin borrar.
   «Repetir el de ayer» dice qué perfume es y guarda lo que anuncia. Aviso de
   duplicado en el toque. Error visible y sprays validados. Momento recalculado al
   volver a la app por la tarde. Fecha de Sugerir recalculada en el servidor.
4. **Sugerencia del día como primer chip de Hoy** (S-M, feature). Hoy ya calcula
   todas las entradas del motor; solo falta llamar a `recomendar()`. Es aditivo: no
   toca la regla de los 5 recientes.
5. **Cierre del día en Hoy** (S, feature). La tarjeta del uso de hoy con valoración y
   duración a un toque, sin botón Guardar. Desbloquea los datos de los que dependen
   la ficha, la recomendación y la mitad del catálogo.
6. **Editar y encontrar sin fricción** (S cada uno). Editar en el modo revisión que
   ya existe. Búsqueda por palabras sueltas en Colección y en Hoy. Filtro por nota
   (ya implementado en `listarColeccion`). Enlace «← Colección» que conserva filtros.
7. **Cerrar los flujos rotos** (S cada uno). `marcarConvertido` al convertir un
   deseo. `?hueco=` leído en la wishlist. `?fragrantica=1` leído en el editor.
   «Sin usar» respetando los filtros. Completar y borrar usos desde el día del
   calendario. «Me lo pondré» que no cree un uso con fecha futura.
8. **Primer uso y contextos** (S-M). Bienvenida en Hoy con colección vacía. Estados
   vacíos distintos según la causa. Asistente fuera de la barra si no hay clave.
   Contextos editables en Configuración (añadir, renombrar, ordenar, archivar; el
   esquema ya tiene `orden` y `archivado`).
9. **Producción medida y datos a salvo** (S-M). `"regions"` en `vercel.json` junto
   a Neon. Medir el TTFB en frío desde el móvil. Sacar Open-Meteo del camino crítico
   del render. «Última copia: hace N días» y una copia automática antes de cada
   migración.
10. **Recategorización con evidencia** (M, feature). «Lo has llevado 10 veces a la
    Oficina (4,0/5) y no lo tienes marcado [Añadir]». Sube la tasa de acierto y
    limpia huecos falsos con datos que ya tienes. Siempre lo confirmas tú.

## Cómo se ha hecho

- **App real con datos realistas.** Se levantó en local (build de producción con
  Postgres 16) con 20 perfumes de perfumería árabe (1 «lo tuve», 1 archivado, 2 sin
  estrenar), 244 usos en 8 meses y 4 deseos. Se simuló el tiempo en `clima_diario`
  porque Open-Meteo no es accesible desde el sandbox.
- **Capturas e interacción.** Todas las pantallas se capturaron a 390×844. Los
  flujos se recorrieron con Playwright, también con red lenta (2 s de latencia), sin
  conexión, con teclado y con una cuenta nueva de amigo creada con el código de
  invitación.
- **Auditoría y verificación.** 7 auditores, uno por área, leyeron el código entero
  de su área. Por cada área, un verificador escéptico intentó refutar cada hallazgo
  en el código y en la app, ajustó severidades y añadió lo que faltaba.
- **Ideación.** 5 ángulos independientes: el ritual diario del dueño, el
  coleccionista, lo social, un benchmark de mercado con fuentes y la IA. Después, una
  consolidación comprobó cada feature en el código y un crítico de completitud buscó
  huecos y objeciones; sus ajustes ya están aplicados en el catálogo.
- **Límites.** Todo se midió en localhost: falta medir en Vercel y Neon. El camino
  del tiempo real (Open-Meteo) no se vio funcionando. Sin clave de Claude, el
  asistente se evaluó leyendo el código y con un doble local de la API. No se probó
  en un iPhone real.

## Lo que ya funciona muy bien (y conviene no romper)

- **Registro de un toque.** Elige el momento por la hora, el contexto habitual por
  tipo de día y la media de sprays. El aviso sale a los ~0,1 s, y la cabecera
  «Noche · Casa» dice qué se va a guardar antes de pulsar.
- **Cola offline.** El id lo genera el cliente y el servidor ignora los reenvíos,
  así que un 401 no tira ningún uso. Deshacer funciona también sobre lo encolado.
- **Explicaciones.** Idoneidad con desglose por eje, motivo de la recomendación y
  estación explicada con su temperatura.
- **Revisión en una pantalla.** Cuando la ficha llega leída de Fragrantica, los
  votos van junto a cada casilla y «Marcar según Fragrantica» las marca de un toque.
- **El bookmarklet y el share target esquivan Cloudflare.** Lo compartido sobrevive
  al login gracias a `sessionStorage`.
- **Modo viaje exacto.** Cobertura mínima resuelta sin voraz y explicada frasco a
  frasco; «pendientes de un hilo» en Huecos es una idea poco común y valiosa.
- **Estado en la URL** en Sugerir, Estadísticas y Colección. El scroll se restaura al
  volver de una ficha.
- **Base visual coherente.** Tokens únicos, contraste de texto comprobado (6,9:1) y
  estado elegido leído de `aria-pressed`.

## Temas de fondo

Los 114 problemas se agrupan en siete causas. Arreglar la causa resuelve varios a la vez.

1. **Robustez sin red y con red lenta.** No hay fronteras de carga, error ni 404.
   Las Server Actions no tienen camino offline, el SW no pone límite de tiempo y las
   navegaciones no dan feedback durante 2-4 s con 3G. *TRV-1, TRV-2, TRV-4, SUG-1,
   SUG-4, ALTA-2, HOY-13, COL-14 y el buscador de Hoy sin red.*
2. **El bucle después de registrar.** Cada camino confirma distinto (aviso con
   Deshacer, nada o banner fijo), Ajustar es destructivo, no hay cierre del día y la
   tarjeta de hoy no se puede tocar. *HOY-1 a HOY-7, SUG-3, SUG-13, COL-7, CAL-1.*
3. **Última milla entre pantallas.** Funciones casi terminadas cuyo último enlace no
   existe. *WIS-1/ALTA-7, HUE-1, COL-4/ALTA-9, COL-9, EST-1 y el deseo sin URL de
   Fragrantica.*
4. **Coste de mantener los datos.** Asistente de 8 pasos para editar, búsqueda
   literal, ficha kilométrica, deseos no editables, filtros que tapan su efecto y
   contextos solo por SQL. *COL-1, COL-3, COL-5, COL-8, ALTA-4, ALTA-5, WIS-2.*
5. **Integridad del catálogo común.** Duplicados sin aviso, renombrado para todos,
   «Editar» que reescribe la ficha común sin decirlo, marcas sin autocompletar y
   notas en dos idiomas. *ALTA-1, ALTA-3, ALTA-6, ALTA-12 y los hallazgos nuevos.*
6. **Primer uso y estados vacíos.** Un mismo mensaje para causas distintas, pantallas
   vacías sin camino, textos para el administrador e instalación sin guía. *HOY-12,
   SUG-9, COL-10, TRV-3, TRV-7, TRV-11, IA-3.*
7. **Datos que no llegan a decisión.** KPI sin definir, huecos sin ponderar por uso
   real, marcas que divergen del uso, temperatura calculada y descartada, y
   comparativas contra periodos vacíos. *EST-2, EST-3, EST-4, HUE-2, SOL-1.*

## Lo que nadie había mirado

Aportado por el crítico de completitud y comprobado en el código:

- **Rendimiento en producción sin medir.** `vercel.json` no fija región. Si el
  proyecto está en la región por defecto (EE. UU.) y Neon en Europa, cada consulta
  HTTP cruza el Atlántico, y Hoy encadena varias consultas más la primera llamada
  del día al servicio del tiempo. Propuesta: `"regions"` junto a Neon, cabecera `Server-Timing` en Hoy y
  Sugerir, y Open-Meteo fuera del render.
- **Copias solo manuales.** La única copia es la descarga desde Datos, sin registro
  de la última ni recordatorio, y las migraciones se aplican solas en cada despliegue
  de producción. Propuesta: «Última copia: hace N días», aviso a los 30 días y un
  `pg_dump` semanal (o una rama de Neon) antes de migrar.
- **Contextos no editables.** No hay ninguna acción que cree o renombre contextos
  (solo la restauración de copia los inserta), aunque la spec 3 los hizo tabla «para
  poder añadir o renombrar sin tocar el build».
- **El camino del tiempo no se ha auditado en vivo.** 242 de 244 usos demo tienen
  estación por calendario. Conviene un `OPEN_METEO_URL` configurable para probar los
  criterios 6 y 7 con un doble.
- **Pantalla de umbrales.** Son siete números sueltos sin vista previa ni «valores
  de partida», cuando la spec 7.1 cuenta con que los muevas tras un par de meses.
- **Vocabulario de notas partido.** Una ficha de fragrantica.com trae «Vanilla» y
  las semillas tienen «Vainilla»; «Incienso» y «Olíbano» son la misma nota. Rompe en
  silencio el filtro por nota, el solapamiento de la 10.2 y las features de afinidad.
  Propuesta: mapa de alias al parsear y «Fusionar con…» en Configuración.
- **Sin red de regresión de UX.** No hay `.github/` ni Playwright en el repo. Los
  fallos más graves encontrados son de integración y los tests de dominio no los ven.
  Propuesta: 6-8 pruebas de humo a 390 px que cubran los criterios de aceptación 2, 8,
  11 y 12.
- **No se mide el propio ritual.** No se sabe por qué camino se registra ni cuánto
  se tarda. Un `uso.origen` (chip, sugerido, ayer, buscador, Sugerir, calendario,
  aviso, offline) diría si la sugerencia del día funciona.

## Roadmap propuesto

- **Fase 0: no romperse y cerrar lo que está a medias** (1-2 semanas, sin esquema).
  Prioridades 1, 2, 3, 6, 7 y 8, más la región de Vercel y la medición. Casi todo es
  S y está detallado en los hallazgos.
- **Fase 1: el ritual diario completo** (sin esquema). Sugerencia del día (fase 1),
  cierre del día, `?toque=` y atajos del icono, aviso nocturno accionable (un solo
  push que registra o cierra el día desde la notificación) y recategorización con
  evidencia.
- **Fase 2: una sola migración 0006 y copia v3.** Agrupar ahí lo barato que conviene
  empezar a acumular ya:
  - en `uso`: `temperatura_usada`, `bochorno`, `cumplidos`, `capa_id` y `origen`;
  - en `perfume`: `precio_compra`, `formato` y `motivo_salida`;
  - la tabla `perfume_nivel` y el saneo del vocabulario de notas.

  Sobre esa base salen cumplidos, frasco vivo, capas, rendimiento según el tiempo,
  planes con fecha, desear sin teclear y «tu nariz». En paralelo, «Offline de verdad»
  (la instantánea y el motor en el cliente).
- **Fase 3: amigos e IA, con sus cimientos primero.** Centro de cuenta → amigos con
  consentimiento → lo que tiene el grupo → opinión del grupo → intercambio. Por el
  lado de la IA: IA bajo control (tope por cuenta, privacidad) → asistente que actúa
  → frase/Siri, foto y «tu año».

## Benchmark: de dónde salen algunas ideas

Patrones de apps comparables que Scentify no tiene. Son funciones anunciadas en
fichas de tienda y webs de desarrolladores, no probadas una a una.

- **Resumen anual compartible** (Fragplace, Parfumo, Untappd): fragplace.com/wrapped.
- **Muestras con veredicto «¿en grande o paso?» tras 3 usos** (Sillage).
- **Coste por uso** (Stylebook, Whering): stylebookapp.com/features.html.
- **Nivel de llenado y cumplidos** (Olfé y Drydown; hilo de Basenotes sobre llevar la
  cuenta de cumplidos).
- **Perfil de gusto por lo que mejor valoras** (Vivino, «Match for You»).
- **Insignias retroactivas y rachas con día de gracia** (Untappd y apps de hábitos).
- **Capas registradas como combinación** (Perfume Picks, Parfumo).

---

## Hallazgos verificados, por área

Leyenda: ✔ confirmado tal cual · ◐ confirmado con matices (se indica cuál) · ＋ nuevo,
encontrado por el verificador. Tras el título van el identificador, la severidad
verificada y el esfuerzo (S < 1 día, M 1-3 días, L 1-2 semanas). Las referencias de
código son relativas a `src/` salvo que digan otra cosa. Se omite el único hallazgo
refutado (TRV-12: el orden de Más ya sigue la frecuencia de uso).

### Hoy: registro diario

El registro de un toque cumple de verdad el objetivo de los diez segundos. Si el perfume está entre los chips, basta un toque: en local el aviso sale a los ~0,1 s y «Registrado hoy» se actualiza a los ~0,2 s. Si no está, hay que tocar el buscador, escribir 3-4 letras, elegir el resultado y pulsar «Registrar uso»: 3 toques más el tecleo, unos 0,8 s automatizado y, siendo realistas, 5-8 s en el móvil.

- ◐ **Cada camino de registro responde distinto, y con fecha pasada no se avisa de nada** · HOY-1 · media · M
  - *Arreglo:* Usar en todos los caminos el aviso que ya existe (`avisoReciente`). En guardar() (FormularioRegistro.tsx:336-347), llamar a `setReciente({usoId: uso.id, perfume: elegido, momento, contextoId, encolado, fecha: uso.fecha})`. (`FormularioRegistro.tsx:264`, `FormularioRegistro.tsx:336-338`)
  - *Matiz de la verificación:* El problema grave se limita al registro con fecha pasada (criterio 5), que es un camino secundario; con la fecha de hoy ya hay una confirmación implícita.
- ◐ **«Registrado hoy» no se puede tocar: completar el uso por la noche cuesta ~9 toques y bajar 950 px** · HOY-2 · media · M
  - *Arreglo:* Que la tarjeta de page.tsx:103-112 se despliegue al tocarla y lleve CompletarUso dentro. Para eso hay que moverlo de src/app/coleccion/[id]/CompletarUso.tsx a src/componentes/ y añadir `comentario` a usosDelDia (usos.ts:239-262, que ya devuelve duracionPercibida y valoracionDia). (`page.tsx:103-112`, `coleccion/[id]/page.tsx:164`)
  - *Matiz de la verificación:* Bajar a media: la función existe y se llega en unos 8 toques, no se pierde nada y los campos son opcionales. Quitar lo de que no hay confirmación.
- ✔ **«Ajustar» borra el registro antes de que el usuario confirme nada** · HOY-3 · media · M
  - *Arreglo:* Que «Ajustar» abra el formulario en modo edición sin borrar nada: guardar `r.usoId` en el estado y cambiar el texto del botón a «Guardar cambios», con «Cancelar» al lado. Borrar y volver a crear solo al confirmar, mejor con una acción nueva `accionReemplazarUso` en src/app/acciones.ts que recalcule el snapshot de idoneidad en una transacción, porque registrarUso con el mismo id no hace nada por el ON CONFLICT. (`FormularioRegistro.tsx:291-298`, `FormularioRegistro.tsx:182`)
- ✔ **Duplicados: el registro de un toque no avisa y en el formulario el aviso queda tapado por la barra fija** · HOY-4 · media · S
  - *Arreglo:* Pasar desde page.tsx los perfumeId de `registrados` a FormularioRegistro. En los chips, marcar con «✓ hoy» los ya registrados. En registrarAlToque, si el perfume ya está, mostrar el aviso «Ya lo tienes hoy · Registrar otra vez / Cancelar» en lugar de guardar directamente. (`FormularioRegistro.tsx:241-266`)
- ✔ **«Repetir el de ayer» no dice qué perfume es y guarda otro momento y contexto del que anuncia la cabecera** · HOY-5 · media · S
  - *Arreglo:* Poner el nombre en el chip («↺ Amber Oud Gold Edition · como ayer»). Guardar con el momento y el contexto que anuncia la cabecera (`momentoInicial`, `contextoPorDefecto(momentoInicial)`) o, si se mantiene el de ayer, enseñar «Día · Oficina» en el propio chip. (`FormularioRegistro.tsx:306-313`)
- ✔ **El registro de un toque nunca enseña el desglose de idoneidad (criterio 3 de la spec)** · HOY-7 · media · S
  - *Arreglo:* Hacer que encolarUso devuelva `{ estado, resultado }` con el JSON del POST y enseñar en el aviso la insignia y el eje que falla («67% · no encaja Contexto»). En page.tsx:103-112, añadir `<DesgloseIdoneidad detalle={uso.idoneidadDetalle} />` bajo cada tarjeta, quizá solo si pct < 100. (`FormularioRegistro.tsx:368-389`, `page.tsx:111`)
- ◐ **Si falla el guardado desde el formulario, el error queda tapado por la barra fija** · HOY-9 · media · S
  - *Arreglo:* Pintar el aviso dentro de `.barra-accion`, encima del botón, o hacer `scrollIntoView` y enfocarlo. Usar la clase `aviso-error` con `role="alert"`. Que encolarUso diga el motivo del 4xx (el cuerpo `error` de la API, por ejemplo «Perfume no encontrado.») para poner un texto útil («Ese perfume ya no está en tu colección»). (`FormularioRegistro.tsx:641`, `globals.css:185`)
  - *Matiz de la verificación:* Cambiar el ejemplo: la causa realista del 4xx son unos sprays no válidos (>100, decimales o negativos; el input tiene min/max, pero nada lo valida porque no hay <form>).
- ✔ **Buscador sin estado vacío, sin indicador de carga y cortado en 8 resultados sin decirlo** · HOY-11 · media · S
  - *Arreglo:* Cuando no haya resultados, poner «Nada con «xyzq» en tu colección» y los botones «Añadirlo» (/coleccion/nuevo, con el texto como nombre) y «Importar de Fragrantica» (/importar). Poner un indicador mientras se busca. (`FormularioRegistro.tsx:411-422`, `consultas.ts:213`)
- ✔ **Una cuenta nueva o sin usos ve en Hoy solo un buscador, sin ninguna guía** · HOY-12 · media · S
  - *Arreglo:* En page.tsx, si no hay perfumes, mostrar una tarjeta de bienvenida con «Añadir tu primer perfume», «Importar CSV/Excel» y «Desde Fragrantica» (enlazando /coleccion/nuevo, /mas/datos y /importar). (`acciones.ts:134`, `navegacion.ts:15`)
- ◐ **El service worker espera a la red sin límite de tiempo al abrir Hoy con mala cobertura** · HOY-13 · media · S
  - *Arreglo:* En redPrimero, para `request.mode === 'navigate'`, competir la petición con un timeout de unos 2,5 s y servir el '/' de la caché si gana el timeout (stale-while-revalidate). FormularioRegistro ya recarga los datos al volver la app y registra en la cola sin red. (`public/sw.js:70-84`, `sw.js:124-126`)
  - *Matiz de la verificación:* Añadir a la recomendación un timeout en enviar() (AbortSignal.timeout(~4000)) que lleve el uso a la cola. Es seguro porque el id es idempotente (ON CONFLICT DO NOTHING).
- ＋ **El registro de un toque no indica que está guardando ni tiene límite de tiempo: con red lenta la pantalla se queda congelada sin respuesta** · nuevo · media · S
  - *Arreglo:* Mostrar el aviso en cuanto se toca («Guardando 9PM…», que pasa a «✓ 9PM» o a «En el móvil, se enviará luego»). En enviar(), usar `signal: AbortSignal.timeout(4000)` y, si salta, encolar. (`FormularioRegistro.tsx:241-257`, `cola-offline.ts:106-112`)
- ＋ **El campo Sprays acepta 150, 2,5 o -1 y el registro falla con un «Inténtalo otra vez» que no sirve de nada** · nuevo · media · S
  - *Arreglo:* Validar en el cliente antes de enviar: entero entre 0 y 100, con el mensaje junto al campo («Entre 0 y 100 sprays») y el botón deshabilitado mientras no sea válido. O sustituir el número por un control de − y + con la media prerrellenada. (`FormularioRegistro.tsx:520-530`, `api/usos/route.ts:23`)
- ◐ **Tras registrar, Hoy sigue igual que antes: invita a registrar otra vez y media pantalla queda vacía** · HOY-6 · baja · M
  - *Arreglo:* Dar a Hoy un estado de «hecho». Si `registrados.length > 0`, mostrar arriba la tarjeta del uso de hoy (nombre grande, desglose de idoneidad, Completar/Cambiar) y plegar el buscador y los chips tras un «¿Te pones otro?». (`page.tsx:55-118`)
  - *Matiz de la verificación:* Reformular como mejora menor y no plegar el buscador. Si hay usos hoy, subir «Registrado hoy» por encima de «Un toque y listo» (o ponerlo junto al título) y marcar los chips ya registrados (HOY-4).
- ◐ **Los accesos rápidos solo miran lo último usado, aciertan la mitad de los días y cambian de orden en cada registro** · HOY-8 · baja · M
  - *Arreglo:* Ampliar a 6-8 chips (caben en dos filas a 390 px) y combinar: 1) la sugerencia del día del motor de recomendación (src/dominio/recomendacion.ts, el mismo cálculo que /recomendacion para el momento y el contexto habituales), 2) los más frecuentes en ese contexto y momento, 3) los recientes. (`consultas.ts:239-258`)
  - *Matiz de la verificación:* Mantener los 5 más recientes (o proponer a quien manda en la spec cambiar la regla) y mostrarlos en un orden estable, por ejemplo alfabético o por frecuencia, sin el perfume que ya sale en «Repetir el de ayer».
- ✔ **Accesibilidad del registro de un toque: se pierde el foco, el aviso puede no anunciarse y dura 8 s** · HOY-10 · baja · S
  - *Arreglo:* Mantener siempre montado un `<div role="status" aria-live="polite">` y cambiar solo su texto. Cambiar `disabled` por `aria-disabled` más la guarda `if (guardando) return` ya existente. (`FormularioRegistro.tsx:436`)
- ✔ **La explicación de la estación dice «hoy» para fechas pasadas y da dos temperaturas distintas para el mismo día** · HOY-14 · baja · S
  - *Arreglo:* Pasar `nombreDia` desde previsualizarIdoneidad: «hoy», «ayer» o «el 01/09» según la fecha. Incluir el momento en el texto de estacion.ts:249 («28° de día hoy», «22° esta noche»). (`usos.ts:163`, `estacion.ts:209`)
- ✔ **Si la PWA sigue abierta desde por la mañana, el registro de un toque de la tarde se guarda como «Día»** · HOY-15 · baja · S
  - *Arreglo:* En el manejador de visibilitychange, comparar también el momento calculado en el cliente (mismos umbrales de 18 y 5 h, con la zona del móvil) con `momentoInicial` y llamar a `router.refresh()` si no coincide. (`page.tsx:42`, `FormularioRegistro.tsx:135-143`)

### Sugerir: recomendación

Sugerir deduce casi todo por sí sola: el momento por la hora, el contexto habitual según el momento y si es laborable o fin de semana, y la estación por la temperatura, con los mismos helpers que Hoy. Explica cada sugerencia en una frase clara y responde rápido en local (60-85 ms por cambio). Sus fallos están en lo que pasa alrededor de esa respuesta.

- ◐ **Sin conexión, «Me lo pongo» y «Otro» tumban la app («Application error»), que sigue rota al volver la red** · SUG-1 · alta · M
  - *Arreglo:* Convertir MeLoPongo en un componente cliente que llame a encolarUso() de src/cliente/cola-offline.ts con el mismo id, perfumeId, momento, contextoId y fecha (y sprays, ver SUG-3), reutilizando la lógica de registrarAlToque. (`Tarjetas.tsx:50`, `Tarjetas.tsx:86`)
  - *Matiz de la verificación:* El hallazgo y la severidad son correctos, pero hay que corregir un detalle de la recomendación. No se debe reutilizar «el mismo id» del input oculto (Tarjetas.tsx:59, generado en el servidor al pintar).
- ◐ **La fecha del registro va congelada en el HTML: si la PWA lleva abierta desde la noche, el uso se apunta en el día anterior y Hoy dice que está «abajo»** · SUG-2 · media · S
  - *Arreglo:* En accionRegistrarDesdeRecomendacion, cuando dia != 'manana', ignorar la fecha del formulario y usar hoyIso(await zonaDelUsuario()), como ya hace el descarte. Para mañana, usar desplazarDias(hoy, 1). (`Tarjetas.tsx:59`, `page.tsx:59`)
  - *Matiz de la verificación:* El disparador es más estrecho de lo que se describe. page.tsx es force-dynamic y cualquier toque en un chip (navegar() con router.push) vuelve a pintar con fecha y momento frescos, así que el fallo solo ocurre si se pulsa «Me lo pongo» directamente sobre la página vieja, que además muestra a la vista «Noche» pulsado.
- ✔ **«Me lo pongo» no sigue el patrón de un toque de Hoy: no manda sprays, no tiene Deshacer/Ajustar y el aviso es genérico y queda pegado a la URL** · SUG-3 · media · M
  - *Arreglo:* Unificar con el registro de un toque: mandar sprays = spraysHabituales y, en vez de redirigir con un mensaje fijo, quedarse en /recomendacion (o ir a Hoy con ?registrado=<usoId>) mostrando el aviso flotante «✓ Ameerat Al Arab · Noche · Casa [Ajustar] [Deshacer]» durante 8 s. (`Tarjetas.tsx:55-63`, `FormularioRegistro.tsx:252`)
- ✔ **Al tocar Para, Momento, Contexto o Estación no hay estado de carga: se sigue viendo la combinación vieja con «Me lo pongo» activo** · SUG-4 · media · S
  - *Arreglo:* En SelectorPeticion, usar useTransition y un estado local optimista para marcar el chip al instante. Exponer isPending, por contexto o con un wrapper cliente de los resultados, para atenuar las tarjetas (opacity y aria-busy) y desactivar sus formularios mientras se carga. (`SelectorPeticion.tsx:40-47`)
- ✔ **«Mañana» hereda el momento de la hora: si planificas por la noche, te propone «Noche» (y el contexto de la noche)** · SUG-6 · media · S
  - *Arreglo:* En page.tsx, si paraManana y no hay momento en la URL, usar 'DIA'. En SelectorPeticion, al cambiar de día, hacer navegar({ dia, momento: null, contexto: null }) para que se recalculen el momento y el contexto habitual del otro día. (`page.tsx:62-65`, `usos.ts:36-43`)
- ✔ **La respuesta queda debajo del formulario: en pantallas pequeñas la tarjeta principal y sus botones no se ven sin desplazarse** · SUG-7 · media · M
  - *Arreglo:* Poner TarjetaPrincipal arriba, con una línea-resumen compacta: «Hoy · Noche · Casa · Otoño (22°) — Cambiar». Esa línea despliega SelectorPeticion o abre una hoja inferior. Las alternativas («Si no, también encajan») van debajo. (`page.tsx:106-132`)
- ✔ **El mismo estado vacío sirve para tres situaciones distintas, y su consejo («Prueba con otro contexto») no ayuda en ninguna** · SUG-9 · media · S
  - *Arreglo:* Distinguir cada caso en page.tsx. Sin perfumes LO_TENGO: «Aún no tienes perfumes» con enlaces a /coleccion/nuevo y /importar. Con descartes del día: «Has descartado N hoy · Recuperarlos». (`page.tsx:144-148`, `auth.ts:120`)
- ◐ **Sugerir no sabe lo que ya llevas hoy ni lo que tienes apuntado para mañana, y «Me lo pondré» crea un uso real casi invisible** · SUG-13 · media · M
  - *Arreglo:* Cargar los usos de la fecha pedida y mostrar sobre la tarjeta «Hoy ya: Khamrah (Noche · Cita)» o «Mañana tienes apuntado: X · Cambiar · Quitar». Si ya hay plan para ese momento, avisar antes de añadir otro. (`page.tsx:67-73`, `recomendacion.ts:181`)
  - *Matiz de la verificación:* Hay que corregir varias afirmaciones. Sugerir sí tiene en cuenta los usos del día: ultimoUso los manda al final y el motivo lo dice (recomendacion.ts:130-136, 181).
- ＋ **De madrugada, «Mañana» salta a pasado mañana y la pantalla no muestra ninguna fecha** · nuevo · media · S
  - *Arreglo:* Poner la fecha en los chips y en la tarjeta: «Hoy · sáb 10» / «Mañana · dom 11» y «El domingo te pondría». Entre las 00:00 y las 05:00, valorar que el atajo para planificar apunte a hoy por la mañana (Hoy + Día). (`page.tsx:59`, `page.tsx:62-65`)
- ◐ **Cada chip apila una entrada en el historial: el gesto «atrás» deshace selecciones una a una en vez de salir** · SUG-5 · baja · S
  - *Arreglo:* Usar router.replace(url, { scroll: false }) en navegar(). La URL sigue reflejando el estado (recargable y compartible) sin ensuciar el historial. (`SelectorPeticion.tsx:46`)
  - *Matiz de la verificación:* Es el comportamiento por defecto de Next, y entre secciones se navega con la barra inferior fija, no con atrás. En el caso de uso principal (menos de 10 s) se tocan uno o dos chips como mucho.
- ◐ **«Otro» no confirma nada ni se puede deshacer, y no se ve su alcance (todo el día y todos los contextos)** · SUG-8 · baja · S
  - *Arreglo:* Mostrar un aviso flotante «Sceptre Malachite oculto hasta mañana · Deshacer», con una acción nueva que borre esa fila de recomendacion_descarte. Mover el foco al h2 de la nueva tarjeta y añadir una región aria-live. (`Tarjetas.tsx:74-97`, `acciones.ts:239-247`)
  - *Matiz de la verificación:* Hay dos matices. Que la tarjeta cambie por la siguiente ES la confirmación visible que pide la spec 7.2 («muestra la siguiente de la lista en su lugar»).
- ✔ **La misma tarjeta dice «67 % · Alta» en verde y «PARCIAL» en ámbar, y «Parcial» significa 33 % en el resto de la app** · SUG-10 · baja · S
  - *Arreglo:* Cambiar AvisoParcial a «Encaja a medias · falla la estación», o solo «Falla la estación», con un tono neutro o el de id-alta. Reservar «Parcial» para el 33 %. Fichero: Tarjetas.tsx:103-110 (y NOMBRE_EJE). (`Idoneidad.tsx:9-10`, `dominio/idoneidad.ts:33-34`)
- ✔ **Textos que no se adaptan a «mañana» ni a la estación puesta a mano, y explicación con jerga** · SUG-11 · baja · S
  - *Arreglo:* Pasar a calcularIdoneidad o motivoDelFallo un nombre de día o de origen («la estación de mañana», «la estación elegida»). Cabecera con override: «Estación a mano · hoy harían 28° → verano». (`idoneidad.ts:81`, `page.tsx:109`)
- ✔ **Sobrescribir la estación: tocar la única propuesta no hace nada, y cambiar de una estación a otra cuesta dos toques con dos recargas** · SUG-12 · baja · S
  - *Arreglo:* Hacer los chips de selección única por defecto (un toque = «solo esta») y añadir un control secundario «+ combinar con otra» para las bandas mixtas. Como mínimo, si se toca la única activa, explicarlo («Elige otra estación para cambiarla»). (`SelectorPeticion.tsx:49-54`)
- ✔ **Accesibilidad: grupos sin nombre, botones repetidos sin el perfume y cambios de tarjeta sin anunciar** · SUG-14 · baja · S
  - *Arreglo:* Usar <fieldset><legend> o role="group" con aria-labelledby. Poner aria-label={`Me lo pongo: ${perfume.nombre}`} y lo mismo en «Otro». Envolver los resultados en aria-live="polite" y mover el foco al h2 nuevo tras descartar. (`SelectorPeticion.tsx:59`, `Tarjetas.tsx:128`)
- ＋ **El aviso «No se ha podido registrar ese perfume» se queda pegado al cambiar de chip** · nuevo · baja · S
  - *Arreglo:* En navegar(), hacer siempre nuevos.delete('error'). O mostrar el error como un aviso efímero en el cliente y limpiar el parámetro con router.replace tras pintarlo. (`acciones.ts:177-185`, `SelectorPeticion.tsx:41`)
- ＋ **En «Mañana», cada toque de chip vuelve a consultar Open-Meteo sin caché (hasta 6 s)** · nuevo · baja · S
  - *Arreglo:* Guardar en caché la previsión de mañana con un TTL corto (por ejemplo, unas horas, con obtenidoEn) y los fallos durante unos minutos. O calcular la estación una vez por página y pasarla en la URL o en el estado, en lugar de recalcularla con cada chip. (`page.tsx:71`, `clima.ts:91-92`)

### Colección, búsqueda y ficha

La colección es sobria y fácil de leer: filas con filete de familia, búsqueda al vuelo que conserva el foco, filtros en la URL y scroll restaurado al volver con «atrás». Los problemas aparecen al usarla en serio. La búsqueda es una subcadena literal de «nombre marca» y falla con consultas naturales («club nuit», «lattafa khamrah», «9 pm»); el fallo afecta también al registro de Hoy.

- ◐ **La búsqueda exige escribir el nombre literal en el orden «nombre marca»: «club nuit», «lattafa khamrah» o «9 pm» no encuentran nada (y en Hoy tampoco)** · COL-1 · media · S
  - *Arreglo:* Pasar a búsqueda por tokens. En consultas.ts, partir la consulta normalizada en palabras y exigir que todas aparezcan: `and(...tokens.map(t => ilike(f.busquedaNormalizada, '%'+t+'%')))`. (`servicios/consultas.ts:360-362`, `dominio/texto.ts:20-22`)
  - *Matiz de la verificación:* Reformular el título: «Las búsquedas de varias palabras solo funcionan si son una subcadena contigua de “nombre marca”: “lattafa khamrah”, “club nuit” o “9 pm” dan 0».
- ◐ **Volver de la ficha a la lista filtrada solo funciona con el «atrás» del sistema: la ficha no tiene enlace de vuelta y la barra inferior «Colección» descarta búsqueda y filtros** · COL-2 · media · S
  - *Arreglo:* Añadir en la cabecera de la ficha un enlace «← Colección». Si el usuario llegó desde la lista, que haga router.back(); si no, que lleve a la última consulta. Guardar la última query de /coleccion en sessionStorage desde Filtros.tsx y hacer que NavegacionInferior.tsx apunte a ella cuando la ruta actual ya está dentro de /coleccion/*. (`app/coleccion/[id]/page.tsx:40-60`, `NavegacionInferior.tsx:13`)
  - *Matiz de la verificación:* El problema es de descubribilidad y de que la pestaña inferior descarta el estado. Mantener la recomendación del enlace «← Colección» en la ficha y de recordar la última consulta en la pestaña.
- ◐ **Editar una ficha obliga a recorrer los 8 pasos: 7 toques en «Siguiente» para cambiar, por ejemplo, un contexto; tras guardar no hay confirmación y «atrás» devuelve al editor** · COL-3 · media · S
  - *Arreglo:* En edición, abrir directamente en modo 'revision' (ya existe y es una pantalla con «Editar» por bloque). Basta permitir `modo='revision'` cuando hay perfumeId, cambiar el texto del botón a «Guardar cambios» y quitar el `!perfumeId` de puedeRevisar. (`FormularioPerfume.tsx:183-185`)
  - *Matiz de la verificación:* Ajustar la recomendación con tres cosas. (1) El botón del modo revisión tiene el texto fijo «Añadir a la colección» (FormularioPerfume.tsx:948) y hay que condicionarlo. (2) `enContextos = modo === 'revision' || paso === 6` (:360-367) lanzaría la petición de contextos sugeridos a Claude cada vez que se abre el editor si este arranca en revisión: en edición tiene que ser bajo demanda. (3) La revisión no da acceso al paso de Fragrantica, así que conviene enlazarlo (relacionado con COL-4).
- ✔ **«Volver a consultar Fragrantica» abre el editor en «Paso 1 de 8 · Nombre y marca»: el parámetro ?fragrantica=1 no lo lee nadie** · COL-4 · media · S
  - *Arreglo:* Leer searchParams en editar/page.tsx y pasar a FormularioPerfume una prop `pasoInicial`/`consultarAlAbrir`. Con fragrantica=1, arrancar en el paso 1 (Fragrantica) y lanzar consultarFragrantica({url}) automáticamente. (`app/coleccion/[id]/page.tsx:124-131`, `app/coleccion/[id]/editar/page.tsx:12`)
- ✔ **La ficha de un perfume muy usado mide 11.668 px: 56 tarjetas completas de historial y «Archivar / Lo tuve» al final** · COL-5 · media · M
  - *Arreglo:* En [id]/page.tsx, mostrar los 5-10 últimos usos y un «Ver los 56» que expanda la lista o lleve a ?historial=todo. Compactar cada uso en una línea (fecha · momento · contexto · insignia) y desplegar el desglose y CompletarUso al tocar. (`app/coleccion/[id]/page.tsx:141-175`, `consultas.ts:518-539`)
- ◐ **El panel de filtros (7 selects nativos) tapa el resultado de lo que eliges, y cerrado no dice qué filtros hay activos** · COL-8 · media · M
  - *Arreglo:* Encima de la lista, una fila de chips con los filtros activos («Invierno ×», «Noche ×») que quitan cada uno con un toque y llevan «Limpiar» al final. Convertir Estado, Estación y Momento en botones segmentados (.opcion con aria-pressed, ya existen) en vez de selects. (`Filtros.tsx:116-172`, `Filtros.tsx:54`)
  - *Matiz de la verificación:* Mantener la severidad media y los chips de filtros activos, el recuento visible o «Ver N perfumes» y las opciones limitadas a lo que existe con recuento (incluidas las marcas: excluir las que solo están en archivados salvo con «Incluir archivados»).
- ✔ **No se puede filtrar ni buscar por nota: el filtro por nota de la spec 4.4 está en el servicio pero no en la pantalla** · COL-9 · media · S
  - *Arreglo:* Leer `nota` en coleccion/page.tsx con uuidOVacio y pasarlo a notaId. En Filtros.tsx, añadir un campo «Nota» con datalist, limitado a las notas presentes en la colección. Convertir cada nota y familia de la ficha en un Link a /coleccion?nota=<id> o ?familia=<id>. (`consultas.ts:340`, `app/coleccion/page.tsx:30-43`)
- ✔ **El estado vacío dice lo mismo en tres situaciones distintas, sugiere importar cuando solo has buscado y no avisa de coincidencias archivadas** · COL-10 · media · S
  - *Arreglo:* En page.tsx, distinguir tres casos. (1) Sin perfumes en la cuenta: bienvenida con «Añadir el primero» e «Importar CSV/Excel». (2) Hay texto de búsqueda: «No tienes nada que se llame “x”», con los botones «Añadirlo» (/coleccion/nuevo?nombre=x, que ya existe) y «A la wishlist». (3) Hay filtros: «Limpiar filtros» en el mismo bloque. (`app/coleccion/page.tsx:118-123`, `consultas.ts:356`)
- ＋ **El campo de búsqueda de Colección se desincroniza de la URL: muestra un texto que no filtra, o filtra por un texto que no se ve** · nuevo · media · S
  - *Arreglo:* En Filtros.tsx, sincronizar el estado con la URL: un useEffect sobre parametros.get('q') que haga setTexto(q) y ultimaBuscada.current = q, o bien renderizar <Filtros key={q ?? ''} /> desde page.tsx. (`Filtros.tsx:26`, `Filtros.tsx:54`)
- ◐ **Desde la ficha no se puede registrar «me lo pongo hoy», y Hoy no acepta un perfume preseleccionado** · COL-6 · baja · S
  - *Arreglo:* Añadir en la cabecera de la ficha un botón primario «Me lo pongo» (solo si es LO_TENGO y no está archivado). Que reutilice accionRegistrarDesdeRecomendacion con el momento por la hora y el contexto de contextoHabitual, y redirija a /?registrado=1, donde ya están «Deshacer» y «Ajustar». (`app/page.tsx:34`, `acciones.ts:172-198`)
  - *Matiz de la verificación:* Recomendar como solución principal un botón «Me lo pongo hoy» en la ficha que lleve a /?perfume=<id> con el perfume preseleccionado en FormularioRegistro.
- ◐ **«Completar detalles» falla en silencio (se pierde también lo válido) y muestra «Guardando…» mientras se borra el registro** · COL-7 · baja · S
  - *Arreglo:* En CompletarUso.tsx, usar useActionState para que accionCompletarUso devuelva {ok, error} y no cerrar si hay error (mostrar aviso-error). Poner `max={100}` en el input. Separar el borrado en su propio <form> con su propio BotonEnviar («Borrando…»), o leer `useFormStatus().action` para mostrar el texto correcto. (`CompletarUso.tsx:56`, `acciones.ts:222`)
  - *Matiz de la verificación:* Bajar la severidad a baja y reformular: «Si la validación falla (sprays > 100), el formulario se cierra sin guardar nada y sin avisar; al borrar, el botón dice “Guardando…”».
- ✔ **«Marcar como «lo tuve»» y «Archivar» son dos botones contiguos sin explicar en qué se diferencian ni qué efecto tienen** · COL-11 · baja · S
  - *Arreglo:* Añadir una línea de ayuda bajo cada botón: «Lo tuve: ya no lo tienes; sale de las sugerencias, sigue en la lista y en estadísticas» y «Archivar: lo ocultas de la lista y del registro; sus usos se conservan». (`app/coleccion/[id]/page.tsx:177-203`, `consultas.ts:230`)
- ✔ **Dos «valoraciones» distintas en la misma ficha: el chip «5/5» sin rótulo y «Valoración 3.6 / 5» en promedios (con punto decimal)** · COL-12 · baja · S
  - *Arreglo:* Rotular el chip: «Mi nota ★5» o «★ 5 · general». Renombrar el promedio a «Media de tus días». Formatear con Intl.NumberFormat('es-ES') en BloquePromedios.tsx. Si difieren mucho, sugerir «¿Actualizar tu nota a 3,5?». (`[id]/page.tsx:57`, `BloquePromedios.tsx:39-41`)
- ◐ **Ordenaciones sin desempate y sin las que más sirven (hace más que no lo uso, menos usado, valoración, recién añadido); el select no dice que es un orden** · COL-13 · baja · S
  - *Arreglo:* En consultas.ts, añadir desempate `asc(f.nombre)` a todos los órdenes. Añadir «Hace más que no lo uso» (ultimo_uso asc nulls first), «Menos usado», «Mejor valorado» y «Recién añadidos» (perfume.creadoEn desc) a ORDENES (page.tsx:19) y al select. (`consultas.ts:394-399`, `Filtros.tsx:103-113`)
  - *Matiz de la verificación:* Centrar el hallazgo en el desempate asc(f.nombre) en todas las ordenaciones (esfuerzo S, bug real). Las ordenaciones nuevas («hace más que no lo uso», «menos usado»…) son mejoras opcionales y no huecos, porque ese caso de uso ya lo cubren Estadísticas y Sugerir.
- ✔ **Con 150 perfumes la lista son unas 20 pantallas sin índice ni agrupación, y no hay ningún indicador de carga al buscar ni al abrir una ficha** · COL-14 · baja · M
  - *Arreglo:* Usar useTransition en Filtros.tsx (startTransition alrededor de router.replace/push) y atenuar la lista con aria-busy mientras isPending. Añadir src/app/coleccion/[id]/loading.tsx con un esqueleto de cabecera. (`consultas.ts:413-419`)
- ＋ **Un valor inválido de estación o momento en la URL tumba Colección con un «Application error» en inglés y sin barra de navegación** · nuevo · baja · S
  - *Arreglo:* Validar estacion y momento contra sus listas (como ya se hace con ORDENES) e ignorar los valores desconocidos. Añadir un src/app/error.tsx (y si acaso un global-error.tsx) en español, con «Algo ha fallado» y enlaces a Hoy y a Colección, que mantenga la barra de navegación. (`coleccion/page.tsx:36-37`, `consultas.ts:381-390`)

### Alta de perfume, Fragrantica e importación

El alta tiene dos caras. Cuando la ficha llega leída (botón «Enviar a Scentify», texto pegado o «Usar esta ficha»), la pantalla de revisión funciona muy bien: lo común queda resumido, los votos aparecen junto a cada casilla, «Marcar según Fragrantica» marca con un toque y la app dice exactamente qué falta. El alta manual, en cambio, son 8 pasos (11 toques como mínimo, sin contar el teclado), y el orden obliga a escribir a mano lo que ya trae la URL.

- ✔ **Guardar sin conexión deja «Guardando…» para siempre, sin error ni reintento** · ALTA-2 · alta · S
  - *Arreglo:* Envolver guardar() en try/catch/finally: aviso-error «Sin conexión: no se ha guardado. Tus datos siguen aquí» y el botón vuelve a quedar activo como «Reintentar». Guardar el borrador en sessionStorage o IndexedDB con cada cambio y ofrecer «Continuar el alta de X». (`FormularioPerfume.tsx:369-394`, `public/sw.js:71-82`)
- ＋ **«Cambiar» en un alta con ficha del catálogo renombra el perfume de las demás cuentas** · nuevo · alta · S
  - *Arreglo:* En un alta con ficha elegida, mostrar los datos comunes en solo lectura. Cambiar «Cambiar» por «No es este perfume», que vacíe fichaId y los campos comunes y vuelva al paso 1 con el catálogo visible. (`FormularioPerfume.tsx:830`, `servicios/perfumes.ts:349-358`)
- ◐ **Duplicados sin aviso: «Ya lo tienes» solo existe en el paso 1 y el servidor no lo comprueba** · ALTA-1 · media · M
  - *Arreglo:* 1) En revision() (FormularioPerfume.tsx:816) pintar el resultado de /api/catalogo, que ya se consulta en segundo plano, como cabecera: «Ya tienes Fakhar Black (Lattafa · EDP) → Ver el tuyo / Es otro, seguir». 2) En crearPerfume, devolver {ok:false, duplicado:id} si existe un frasco del usuario con esa ficha, salvo que llegue confirmarDuplicado:true, y ofrecer en el formulario «Ir al que tienes». 3) Que fichaPorUrl (consultas.ts:609) busque por el id numérico final de la URL, sin dominio. 4) Al resolver la ficha, si nombre y marca normalizados coinciden con una ficha existente y la concentración viene vacía, proponer esa ficha antes de crear una nueva. (`FormularioPerfume.tsx:428-461`, `FormularioPerfume.tsx:173-185`)
  - *Matiz de la verificación:* Reformular así: «El aviso de duplicado al compartir solo funciona si la URL coincide exactamente; con otra URL, o con fichas creadas a mano o por CSV, la revisión y el paso 2 no avisan, aunque el resultado del catálogo ya se ha consultado».
- ◐ **La concentración, que es clave de la ficha común, va escondida en «Inventario (opcional)», y «Cambiar» lleva a un paso donde no está** · ALTA-3 · media · M
  - *Arreglo:* Pasar concentración (en chips EDT/EDP/Extrait/Parfum…) y año al paso 1, renombrado a «Nombre, marca y concentración», y en la revisión mostrarlos editables junto al nombre. Deducir la concentración del texto de Fragrantica (el título suele traer «Eau de Parfum») y del nombre del catálogo. (`FormularioPerfume.tsx:719-758`, `dominio/fragrantica.ts:33-40`)
  - *Matiz de la verificación:* Quitar «Deducir la concentración del texto de Fragrantica» o limitarlo a cuando el nombre del perfume la lleva, porque marcaría concentraciones falsas.
- ✔ **Una nota escrita sin pulsar Intro se pierde al pasar de paso** · ALTA-4 · media · S
  - *Arreglo:* Al hacer blur o al cambiar de paso, añadir el texto pendiente. Poner un botón «Añadir» visible, enterKeyHint='enter' y aceptar varias notas separadas por coma al pegar («Bergamota, Pimienta rosa, Oud» crea 3 chips). (`FormularioPerfume.tsx:575-587`)
- ✔ **Editar obliga a pulsar 7 veces «Siguiente» para guardar, y no avisa al salir con cambios sin guardar** · ALTA-5 · media · S
  - *Arreglo:* En edición, abrir por defecto en modo revisión (la misma revision() con un «Guardar cambios» fijo encima de la barra inferior, como el registro de Hoy) y dejar los pasos para corregir. (`FormularioPerfume.tsx:808`)
- ◐ **Con una ficha del catálogo, «Editar» cambia la ficha de todos sin avisar y «Quitar» no desvincula nada** · ALTA-6 · media · S
  - *Arreglo:* Mostrar en el alta el mismo aviso que en edición («N personas tienen esta ficha; si cambias notas o familias lo verán»), usando personas. Cambiar «Quitar» por «No es este perfume», que vacíe los campos comunes y vuelva al paso 1. (`FormularioPerfume.tsx:904-918`, `perfumes.ts:350-358`)
  - *Matiz de la verificación:* Describir «Quitar» como «no desvincula: el frasco sigue en la misma ficha y lo que edites después en notas o familias se descarta sin aviso».
- ✔ **«Convertir en colección» no saca el deseo de la wishlist ni traslada lo que ya sabía** · ALTA-7 · media · S
  - *Arreglo:* Pasar deseo=<id> al alta y, al guardar con éxito, llamar a marcarConvertido y avisar «Quitado de tu wishlist» con opción de deshacer. Filtrar los convertidos o llevarlos a una sección «Conseguidos». (`servicios/wishlist.ts:65-76`, `mas/wishlist/page.tsx:82-86`)
- ◐ **«Volver a consultar Fragrantica» abre el paso 1 y no consulta nada** · ALTA-9 · media · M
  - *Arreglo:* Leer fragrantica=1 en la página de edición, abrir en el paso de Fragrantica y lanzar la consulta con la URL guardada. Si la ficha leída difiere, mostrar un diff («Fragrantica: +Azafrán, −Canela») con «Sustituir pirámide/familias» o «Mantener», teniendo en cuenta el aviso de compartidaCon. (`coleccion/[id]/page.tsx:124-130`, `editar/page.tsx:12`)
  - *Matiz de la verificación:* Recomendación principal: leer fragrantica=1, lanzar la consulta con la URL guardada y abrir directamente en Estaciones con los votos.
- ✔ **Importar CSV: rechaza «Otoño» y «Día», ignora en silencio las familias desconocidas y el recuento del botón engaña** · ALTA-11 · media · S
  - *Arreglo:* Normalizar tildes y aceptar sinónimos: OTOÑO/OTONO, DÍA/DIA, «Eau de Parfum» como EDP, «Eau de Toilette» como EDT. Mostrar «Familias que no existen: … (se ignorarán)» y marcar en la tabla las filas duplicadas. (`csv.ts:153-154`, `csv.ts:250`)
- ＋ **Compartir solo el texto de la página abre la revisión «Sin nombre» y sin marca, aunque el texto trae los dos** · nuevo · media · S
  - *Arreglo:* Sacar nombre y marca del texto: el encabezado de la ficha sigue el patrón «<Nombre> <Marca> para Hombres/Mujeres» o «for men/women», con la marca repetida en la línea siguiente. Si no se puede, poner los dos campos editables arriba de la revisión, con foco, en lugar de «Sin nombre» y un «Cambiar» que lleva a otro paso, y lanzar la búsqueda del catálogo al rellenarlos. (`dominio/fragrantica.ts:33-40`, `FormularioPerfume.tsx:289`)
- ◐ **Compartir sin sesión pierde el texto y la URL, y después dice que «no era una ficha de Fragrantica»** · ALTA-8 · baja · S
  - *Arreglo:* Calcular destinoDeCompartido() antes de comprobar la sesión (es análisis puro y la ficha empaquetada ocupa unos 700 caracteres) y pasar esa ruta como siguiente. Si no cabe, guardar al menos urlCompartida([url, text, title]) y, en el último caso, rellenar el nombre con el título. (`compartir/route.ts:53-61`, `coleccion/nuevo/page.tsx:58-62`)
  - *Matiz de la verificación:* Afecta al compartir de texto (la selección) con la sesión caducada, más o menos una vez cada 90 días, y se recupera volviendo a compartir.
- ◐ **El alta manual obliga a teclear lo que la URL de Fragrantica ya contiene** · ALTA-10 · baja · S
  - *Arreglo:* En el paso 1, un único campo «Nombre o enlace de Fragrantica»: si se pega una URL válida (esUrlDeFichaValida), rellenar nombre y marca con datosDeUrlFragrantica, que es puro y vale en el cliente, y lanzar la consulta. (`FormularioPerfume.tsx:55-64`, `dominio/fragrantica.ts:621`)
  - *Matiz de la verificación:* Bajar a baja y centrar el hallazgo en que las vías cómodas no se descubren: una línea en el paso 1 con enlace a /mas/importador.
- ✔ **La marca no tiene autocompletado: el datalist «marcas-conocidas» no existe** · ALTA-12 · baja · S
  - *Arreglo:* Pasar la lista de marcas distintas de ficha.marca desde nuevo/page.tsx y editar/page.tsx y pintar <datalist id="marcas-conocidas">. Mejor aún, un combobox que sugiera la marca existente cuando la normalizada empiece igual («Lattafa Perfumes» → ¿«Lattafa»?). (`FormularioPerfume.tsx:424`)
- ✔ **Restaurar copia: el fichero va antes que la confirmación y, tras el error, no hay forma evidente de seguir** · ALTA-13 · baja · S
  - *Arreglo:* Poner primero la casilla de confirmación y deshabilitar el input hasta que diga RESTAURAR. Mejor aún: elegir fichero → resumen de la copia (perfumes, usos, fecha) → escribir RESTAURAR → botón «Restaurar» con estado de progreso. (`PanelDatos.tsx:187-202`, `PanelHoja.tsx:91-92`)
- ◐ **Instrucciones de Fragrantica contradictorias y sin adaptar al dispositivo** · ALTA-14 · baja · S
  - *Arreglo:* Unificar los mensajes: «No se ha podido leer la página; pégala entera». Detectar la plataforma (userAgent y display-mode: standalone) y mostrar solo el camino que aplica: Android → Compartir; iOS → Atajo; escritorio → marcador. (`api/fragrantica/route.ts:20-22`, `FormularioPerfume.tsx:521-531`)
  - *Matiz de la verificación:* Quedarse con dos problemas: los mensajes contradictorios y la recomendación de Compartir en iOS. Detectar la plataforma en el aviso de fallo del alta.
- ✔ **Accesibilidad: resultados dinámicos sin anunciar, valoración sin estado y notas sin etiqueta** · ALTA-15 · baja · S
  - *Arreglo:* Añadir aria-live="polite" a la tarjeta del catálogo y a los avisos, role="alert" al aviso-error, aria-pressed a la valoración, aria-label o label a los inputs de notas y llevar el foco al título del paso al cambiar. (`FormularioPerfume.tsx:1044`, `configuracion/page.tsx:40`)

### Estadísticas, calendario, huecos, viaje y wishlist

El área calcula bien: la cobertura del modo viaje es exacta, el criterio de «cubrir» es el mismo en recomendación, huecos y viaje, y registrar desde el calendario un día que se olvidó funciona muy bien (accesos rápidos, aviso con Deshacer y el mes se actualiza). Falla en el último paso, el que convierte un dato en una decisión. Varios enlaces entre pantallas se cortan o no existen: el hueco llega a la wishlist sin el hueco, «Convertir en colección» no cierra el deseo, el heatmap no lleva al calendario y desde el día del calendario no se puede corregir un uso.

- ✔ **Modo viaje: el destino exige escribir latitud y longitud a mano, aunque ya hay geocodificador** · VIA-1 · alta · M
  - *Arreglo:* Sustituir los tres campos por uno solo, «¿Adónde vas?», con una acción de servidor que llame a geocodificar() y muestre 3-5 resultados (ciudad, región, país). Al elegir uno se rellenan lat, lon y lugar en la URL. (`app/mas/viaje/FormularioViaje.tsx:119-150`, `app/mas/viaje/page.tsx:48-51`)
- ◐ **Al pulsar un hueco se llega a la wishlist sin el hueco: el parámetro se ignora** · HUE-1 · media · S
  - *Arreglo:* En src/app/mas/wishlist/page.tsx, leer `hueco` de searchParams y pasarlo a FormularioDeseo con nuevas props `abiertoInicial` y `notasIniciales` (p. ej. «Para cubrir: Gimnasio · Invierno · Día»). (`app/mas/huecos/page.tsx:81-85`, `app/mas/wishlist/page.tsx:23-31`)
  - *Matiz de la verificación:* El usuario acaba en la wishlist con un toque más y le falta el contexto, pero no pierde datos ni se le bloquea nada. Un deseo exige nombre y marca de un perfume concreto, y el hueco no los da, así que lo que se pierde es solo una nota de contexto.
- ◐ **«Convertir en colección» nunca marca el deseo como convertido y el deseo se queda en la lista** · WIS-1 · media · M
  - *Arreglo:* Añadir `&deseo=<id>` en el enlace (wishlist/page.tsx:83). En coleccion/nuevo, propagarlo como campo oculto de FormularioPerfume, y que accionGuardarPerfume (src/app/acciones.ts:331) llame a marcarConvertido tras crear el perfume. (`app/mas/wishlist/page.tsx:82-87`, `app/coleccion/nuevo/page.tsx:23-27`)
  - *Matiz de la verificación:* Es real, pero la severidad debe ser media, no alta. El flujo de alta funciona y lo que queda es un deseo obsoleto que hay que quitar a mano.
- ✔ **«Sin usar en el periodo» ignora los filtros de momento y contexto y da una respuesta falsa** · EST-1 · media · S
  - *Arreglo:* Aplicar momento y contextoId dentro del `not exists` (y en el cálculo de ultimoUso) de src/servicios/estadisticas.ts. Titular según el filtro, p. ej. «Sin usar de noche en el periodo (N)». (`servicios/estadisticas.ts:194-217`)
- ✔ **Los huecos no se ponderan por el uso real: casi todos son combinaciones que el usuario no vive** · HUE-2 · media · M
  - *Arreglo:* En Huecos, añadir una consulta de usos por contexto×momento (en src/servicios/estadisticas.ts o consultas.ts) y separar «Huecos en lo que sí haces» (ordenados por frecuencia) de «Combinaciones que no usas» (plegadas). (`dominio/huecos.ts:160-195`, `app/mas/huecos/page.tsx:41`)
- ◐ **El viaje es de un solo día y la estación del destino solo se calcula de día** · VIA-3 · media · M
  - *Arreglo:* Sustituir la fecha por un rango desde/hasta. Calcular la estación de cada día y de DIA y NOCHE con obtenerClima (ya cachea por fecha en clima_diario) y pasar a resolverViaje la unión de estacionesCompatibles. (`app/mas/viaje/FormularioViaje.tsx:77-86`, `app/mas/viaje/page.tsx:45`)
  - *Matiz de la verificación:* Hay que quitar el argumento de la variedad: el README («Sobre el modo viaje») y viaje.ts:6-8 dicen expresamente que «llévate tres» cuando bastaban dos «es justo lo que no quieres».
- ✔ **Gráficos poco legibles a 390 px: heatmap que arranca por los meses vacíos y 33 filas de barras** · EST-2 · media · M
  - *Arreglo:* Heatmap: al montar, scrollLeft = scrollWidth (con un pequeño componente cliente), etiquetas de mes encima y L/X/V a la izquierda, cada celda como Link a /mas/calendario/{fecha} con aria-label, y un resumen textual («23 de 30 días con registro · racha N»). (`app/estadisticas/Graficos.tsx:79-110`, `app/estadisticas/page.tsx:118-134`)
- ✔ **Alta de deseo sin feedback: la nota sin Intro se pierde, el aviso del servidor se descarta y el deseo cae fuera de la vista** · WIS-3 · media · S
  - *Arreglo:* En guardar(), añadir el valor pendiente de #d-fondo antes de enviar y poner un botón «+» junto al input. Tras guardar, mostrar un toast «Guardado · Deshacer» (el patrón de Hoy) con respuesta.aviso si viene, y hacer scroll al deseo nuevo o resaltarlo durante unos segundos. (`app/mas/wishlist/FormularioDeseo.tsx:142-163`, `app/acciones.ts:407-415`)
- ✔ **Los deseos no se pueden editar y «Quitar» borra sin confirmar ni deshacer** · WIS-2 · media · M
  - *Arreglo:* Hacer la tarjeta pulsable para abrir FormularioDeseo en modo edición (prop `deseo` con sus valores y notasFondoDeDeseo; llamar a accionGuardarDeseo(id, …)). Permitir cambiar la prioridad con chips en la propia tarjeta. (`app/mas/wishlist/page.tsx:81-94`, `servicios/wishlist.ts:41`)
- ✔ **En el día del calendario no se pueden completar, corregir ni borrar los usos registrados** · CAL-1 · media · S
  - *Arreglo:* Reutilizar <CompletarUso> (src/app/coleccion/[id]/CompletarUso.tsx, ya es cliente y autocontenido) dentro de cada tarjeta del día, dejando el nombre como enlace a la ficha. Añadir revalidatePath('/mas/calendario', 'layout') en accionCompletarUso y accionBorrarUso. (`app/mas/calendario/[fecha]/page.tsx:81-95`, `app/coleccion/[id]/page.tsx:163-169`)
- ＋ **Modo viaje: si se pulsan varios contextos seguidos, solo se queda el último** · nuevo · media · S
  - *Arreglo:* Guardar contextos y momentos en estado local (useState inicializado con las props), cambiar el chip al momento con useOptimistic/useTransition y hacer router.replace con la lista local, con un debounce corto. (`FormularioViaje.tsx:26-33`, `clima.ts:91-93`)
- ＋ **Un deseo no puede venir de Fragrantica ni guardar su URL, así que el atajo de «Convertir en colección» con url nunca se activa** · nuevo · media · M
  - *Arreglo:* En /coleccion/nuevo, cuando el perfume llega compartido o importado desde Fragrantica, añadir un botón secundario «Guardar en wishlist» que cree el deseo con nombre, marca, url y notas de fondo de la ficha leída, y que muestre el aviso de solapamiento allí mismo. (`FormularioDeseo.tsx:70-155`, `acciones.ts:382`)
- ◐ **El KPI destacado («Tasa de acierto») no se explica ni se desglosa, y «Sin usar» no ofrece ninguna acción** · EST-4 · baja · M
  - *Arreglo:* Debajo de la cifra, una línea de definición («registros que encajaban del todo con el contexto, momento y estación marcados») y una mini-lista «Lo que más falla»: top 3 perfumes por usos parciales y el eje que falla, sacado de uso.idoneidad_detalle, con enlace a /coleccion/{id}/editar. (`app/estadisticas/page.tsx:64-70`, `page.tsx:103-116`)
  - *Matiz de la verificación:* Corregir la recomendación: un botón «Mañana» que llame a accionRegistrarDesdeRecomendacion no sirve aquí, porque esa acción exige contextoId y momento (esquemaUso) y apuntaría un uso futuro que quizá no ocurra, ensuciando los datos.
- ◐ **El resultado del modo viaje no ayuda a hacer la maleta y «Sin cubrir» es un callejón sin salida** · VIA-2 · baja · M
  - *Arreglo:* En cada tarjeta: enlace a la ficha, «100 ml» y una casilla «En la maleta» (en localStorage, con la URL como clave). Un botón «Compartir lista» con navigator.share o copiar al portapapeles. (`app/mas/viaje/page.tsx:104-121`, `page.tsx:128-142`)
  - *Matiz de la verificación:* Lo sólido es que «Sin cubrir» es un callejón sin salida. Ofrecer el mejor parcial y enlazar a Huecos o Wishlist es coherente con el motor.
- ✔ **La comparativa enseña las fechas del periodo equivocado, mezcla puntos con porcentajes y acepta rangos invertidos** · EST-3 · baja · S
  - *Arreglo:* Calcular periodoAnterior(rango) en page.tsx y escribir «vs. 11/08–09/09» con formatearFecha. Para pct, «▼ 1 punto (−2 %)». Rotación como «14 de 18 (78 %)». Intl.NumberFormat('es-ES') para decimales y euros, y «3,2 / 5». (`app/estadisticas/page.tsx:75-78`, `dominio/estadisticas.ts:63-66`)
- ✔ **El solapamiento dice «que ya tienes» con perfumes marcados como «lo tuve»** · SOL-1 · baja · S
  - *Arreglo:* Incluir el estado en la consulta y separar los dos casos: «Se parece a X, que ya tienes» y «Se parece a Y, que tuviste». Mostrar las notas de fondo y el aviso, en pequeño, en la tarjeta del deseo (calculado en wishlist/page.tsx con solapamientoConLaColeccion). (`servicios/wishlist.ts:153-158`, `FormularioDeseo.tsx:244`)
- ✔ **Los meses anteriores al primer registro salen enteros en rojo como «sin registrar»** · CAL-2 · baja · S
  - *Arreglo:* Pasar a semanasDelMes la fecha del primer uso (o la de creación de la cuenta) y pintar en neutro los días anteriores, con un nuevo estado ANTES_DE_EMPEZAR. En meses sin datos, un estado vacío («Empezaste a registrar el 12/02/2026» con salto directo). (`dominio/calendario.ts:111`)
- ＋ **La comparativa celebra subidas frente a un periodo anterior sin datos** · nuevo · baja · S
  - *Arreglo:* En compararIndicadores o en Comparativa: si el periodo anterior tiene 0 usos, mostrar «sin datos del periodo anterior» en gris, sin flecha. Si cubre solo una parte, indicarlo («el periodo anterior solo tiene N días con registro»). (`Graficos.tsx:24-37`)

### Asistente y exportación para IA

El asistente está bien construido por dentro: responde en streaming NDJSON, enseña qué herramienta está usando, mete la colección cacheada en las instrucciones, tipa los errores del SDK y tiene fallback de servidor. Pero tal como funciona hoy no encaja con el uso principal de la app. Las respuestas son texto sin acciones (no hay «Me lo pongo» ni enlace a la ficha), la conversación se pierde al cambiar de pestaña y la espera con el modelo por defecto (effort medium y razonamiento oculto) es larga y no se puede cancelar.

- ✔ **La conversación se bloquea tras una respuesta larga o 20 preguntas, con un error que culpa a la conexión** · IA-1 · alta · S
  - *Arreglo:* En src/dominio/asistente.ts, no aplicar el tope de 4000 a los mensajes 'assistant' (o recortarlos en el servidor). En route.ts, cambiar el rechazo por una ventana deslizante: conservar los últimos N mensajes empezando por uno de 'user'. (`dominio/asistente.ts:11-12`, `api/asistente/route.ts:29`)
- ◐ **Las respuestas no permiten actuar: el perfume recomendado no se puede registrar ni abrir, y la conversación se pierde al ir a hacerlo** · IA-2 · media · M
  - *Arreglo:* Añadir una herramienta estricta 'proponer_perfumes' ({perfumes:[{id,motivo}], fecha, momento, contextoId?}) cuyo run emita un evento {tipo:'propuesta'}. Chat.tsx lo pintaría como tarjetas con «Me lo pongo» (form a accionRegistrarDesdeRecomendacion, con dia=manana cuando toque) y «Ver ficha» (/coleccion/[id]). (`servicios/asistente.ts:37-113`, `dominio/asistente.ts:37-41`)
  - *Matiz de la verificación:* Dividirlo. (a) Lo concreto y barato (S, media): la conversación se borra al cambiar de pestaña y «Nueva» borra sin confirmar.
- ✔ **El asistente calcula «hoy» en UTC y no sabe la hora: «mañana» falla de madrugada y para amigos en otras zonas** · IA-4 · media · S
  - *Arreglo:* En route.ts, usar hoyIso(zona) y momentoDeAhora(zona) (src/servicios/usos.ts:28 y :36) con zona = await zonaDelUsuario(); lo mismo en exportar/[que]/route.ts. Añadir «Son las HH:MM (noche)» en un bloque de sistema DESPUÉS del bloque cacheado, o al principio del último mensaje del usuario, para no invalidar la caché de la colección. (`app/api/asistente/route.ts:31`, `app/acciones.ts:243`)
- ✔ **Espera larga sin progreso ni forma de cancelar (modelo por defecto, effort medium, razonamiento oculto)** · IA-5 · media · M
  - *Arreglo:* (1) Probar effort 'low' para el chat y medir la calidad (el modelo ya es configurable con SCENTIFY_ASISTENTE_MODELO; hacer lo mismo con el effort). (2) Mostrar progreso: un contador «Pensando… 12 s» y, si se quiere, el resumen o las notas de progreso del razonamiento (thinking.display). (3) Botón «Detener» con AbortController en Chat.tsx y propagar la cancelación (peticion.signal) en route.ts/servicios/asistente.ts para cortar el runner y el gasto. (4) Permitir «Nueva» durante la espera, abortando la petición en curso. (`servicios/asistente.ts:134-136`, `claude.ts:7`)
- ✔ **Durante la respuesta, el estado queda tapado por la barra y el campo de pregunta fuera de pantalla** · IA-6 · media · S
  - *Arreglo:* Poner el formulario en la clase existente .barra-accion (globals.css:171-174, fija encima de la barra, como el botón de registrar de Hoy). Dar al ancla un scroll-margin-bottom igual a la barra más el formulario. (`Chat.tsx:112`, `Chat.tsx:164`)
- ＋ **Si se cierra la pestaña o la PWA a mitad de respuesta, el servidor relanza la pregunta dos veces más** · nuevo · media · S
  - *Arreglo:* En responder(), limitar el reintento al error de parseo JSON del SDK (la entrada de herramienta truncada), no a cualquier excepción. En route.ts, hacer emitir() tolerante (marcar cerrado y no relanzar), pasar peticion.signal a responder y a la petición del toolRunner para abortar la llamada en curso, y añadir cancel() al ReadableStream. (`api/asistente/route.ts:36-37`, `servicios/asistente.ts:176-181`)
- ◐ **Sin clave, una de las cinco casillas de la barra lleva a una pantalla muerta con instrucciones de despliegue** · IA-3 · baja · S
  - *Arreglo:* En src/app/layout.tsx (servidor), pasar asistente={claudeDisponible()} a NavegacionInferior y, sin clave, poner en su lugar Estadísticas o Calendario. Con clave, mantenerlo en la barra solo si se hace accionable (IA-2); si no, llevarlo a Más con entradas desde las pantallas (Sugerir, ficha, wishlist). (`componentes/NavegacionInferior.tsx:14-18`, `app/asistente/page.tsx:15-21`)
  - *Matiz de la verificación:* Bajar a baja y quedarse con lo barato: pasar claudeDisponible() desde layout.tsx para que, sin clave, la casilla muestre Estadísticas, y cambiar el texto sin clave por uno no técnico que ofrezca la exportación para IA.
- ◐ **El asistente y Sugerir recomiendan con criterios distintos y el asistente ignora los descartes de «Otro»** · IA-7 · baja · M
  - *Arreglo:* Sacar a un servicio el cálculo de recomendacion/page.tsx (candidatosParaRecomendar + descartesDeHoy + recomendar) y exponerlo al asistente como herramienta 'recomendacion_del_motor' ({fecha, momento, contexto}), con la instrucción de partir de esa lista y explicarla o matizarla. (`servicios/asistente.ts:37-113`, `servicios/datos.ts:177-198`)
  - *Matiz de la verificación:* Si se hace, que los descartes del día vayan fuera del bloque con cache_control (al final del último mensaje del usuario o como herramienta), no dentro del JSON de la colección.
- ◐ **La exportación para IA está escondida en Datos y solo se puede descargar como fichero** · IA-8 · baja · S
  - *Arreglo:* Añadir «Copiar para IA» (navigator.clipboard.writeText, como en src/app/mas/importador/InstalarBoton.tsx:22), que copie el JSON compacto precedido de una pregunta plantilla, y «Compartir» con navigator.share({ files }) donde esté disponible (en Android lleva directamente a la app de Claude). (`app/mas/datos/page.tsx:34-43`, `page.tsx:40`)
  - *Matiz de la verificación:* Reformular como mejora de bajo coste: «Copiar para IA» (clipboard, con una pregunta plantilla) y «Compartir» con navigator.share({files}) como acciones principales, descarga compactada como tercera opción, y usarlo como estado vacío de /asistente sin clave.
- ◐ **El formato de las respuestas falla con listas pegadas a la frase anterior, cursivas y enlaces** · IA-9 · baja · S
  - *Arreglo:* Analizar línea a línea dentro de cada bloque: agrupar las líneas de viñeta consecutivas en <ul>/<ol> y el resto en <p>, quitar los * sueltos y convertir enlaces. O usar un renderizador de markdown pequeño con salida segura. (`Chat.tsx:31-56`, `Chat.tsx:37`)
  - *Matiz de la verificación:* Corregir el impacto: el texto es legible pero sin formato de lista. Los restos visibles son guiones, asteriscos simples, enlaces markdown, separadores y tablas.
- ✔ **La región aria-live abarca toda la conversación y se reescribe en cada trozo** · IA-10 · baja · S
  - *Arreglo:* Quitar aria-live del <ol>, poner aria-busy="true" en el li de la respuesta mientras se escribe y anunciar la respuesta al terminar. Para el estado, una región role="status" aparte que siempre esté en el DOM. (`Chat.tsx:148`, `Chat.tsx:77-80`)
- ◐ **La sugerencia de contextos se lanza sola en cada edición y aparece encima de los chips** · IA-11 · baja · S
  - *Arreglo:* Al editar, no lanzarla sola: dejar visible el botón «Sugerir contextos con IA» que ya existe en SugerenciaDeContextos. En un alta, reservar el alto de la tarjeta o ponerla debajo de los chips para evitar el salto. (`componentes/FormularioPerfume.tsx:355-366`, `servicios/sugerencia-contextos.ts:45`)
  - *Matiz de la verificación:* Mantener la decisión del dueño y atacar el coste y el salto: no repetir la consulta si la ficha no ha cambiado en lo que la alimenta (cachear la opinión por ficha y huella de notas y familias), y reservar el alto de la tarjeta o pintarla debajo de los chips.
- ✔ **No se avisa de qué datos se envían ni de quién paga, y no hay tope de uso por cuenta** · IA-12 · baja · S
  - *Arreglo:* Una línea en el estado vacío: «Para responder, tus perfumes, notas y diario se envían a Claude (Anthropic); Scentify no guarda la conversación». Un tope diario por cuenta (contador en la tabla ajuste, que ya es clave-valor por usuario) con un mensaje claro al alcanzarlo. (`Chat.tsx:131-134`, `dominio/exportacion-ia.ts:142`)
- ＋ **Las sugerencias del estado vacío se envían al tocarlas, incluida una boda inventada** · nuevo · baja · S
  - *Arreglo:* Que tocar una sugerencia rellene el textarea (setBorrador(s)) y le dé el foco, para editar y enviar con Enter. O bien enviar directamente solo las genéricas («¿Qué me pongo mañana para la oficina?») y convertir la de la boda en plantilla con el hueco por rellenar («Tengo una boda el … por la …»). (`Chat.tsx:135-144`, `Chat.tsx:13`)

### Transversal: navegación, PWA/offline, accesibilidad y cuentas

La base transversal está cuidada: la barra inferior es accesible (aria-current, áreas táctiles de 56 px, safe-area), el texto tiene buen contraste, la seguridad de sesión es seria y la cola offline de Hoy es robusta. Pero la app no tiene ninguna frontera de carga, error ni 404 (no hay loading.tsx, error.tsx ni not-found.tsx). Con red lenta, al pulsar una pestaña no pasa nada visible durante 2 a 4 segundos.

- ✔ **Sin conexión o con la sesión caducada, cualquier acción de servidor tumba la app («Application error»), también «Me lo pongo» con el banner «Puedes registrar igual» encima** · TRV-1 · alta · M
  - *Arreglo:* 1) Crear src/app/error.tsx y src/app/global-error.tsx en español, con «Reintentar» (reset()) y «Volver a Hoy», sin perder la barra (error.tsx vive dentro del layout). 2) En src/app/recomendacion/Tarjetas.tsx, convertir MeLoPongo en un manejador de cliente que llame a la acción y, si falla la red o navigator.onLine es false, encole el uso con la misma cola de src/cliente/cola-offline.ts que usa FormularioRegistro y enseñe el aviso flotante «En el móvil, se enviará luego». 3) Sustituir exigirUsuario() en las acciones por un helper que haga redirect(`/login?siguiente=${ruta}`) en vez de lanzar. 4) Mientras no haya conexión, desactivar con aviso las acciones que no se pueden encolar (Otro, Guardar configuración). (`SincronizadorOffline.tsx:133`, `Tarjetas.tsx:50`)
- ✔ **Offline: la colección no se abre sin conexión; el SW borra /sin-conexion y sirve la pantalla de Hoy en cualquier URL** · TRV-2 · alta · M
  - *Arreglo:* En public/sw.js: 1) en olvidarDatos(), conservar '/sin-conexion' (añadirlo a la lista de excepciones) o volver a añadirlo con armazon.add('/sin-conexion') tras borrar; 2) en redPrimero, no devolver nunca '/' para otra ruta: si no hay copia de esa URL, servir /sin-conexion; 3) cachear también las peticiones RSC (cabecera 'RSC: 1' o parámetro _rsc) de /, /coleccion, /coleccion/[id] y /recomendacion con redPrimero, usando la ruta como clave; 4) desde SincronizadorOffline, en la primera pantalla con sesión, pedir al SW que vuelva a precachear ARMAZON (mensaje 'precachear'), porque el precache de la instalación se hizo sin sesión y el login lo borró. (`public/sw.js:8`, `sw.js:42`)
- ◐ **Cuenta nueva de amigo: pantallas vacías sin guía, buscador mudo y textos que confunden** · TRV-3 · media · M
  - *Arreglo:* 1) En src/app/page.tsx, con 0 perfumes, una tarjeta «Empieza tu colección» con tres caminos: buscar en el catálogo común (reutilizando /api/catalogo y «Usar esta ficha» de /coleccion/nuevo), importar CSV/Excel (Más → Datos) y Botón de Fragrantica. 2) En FormularioRegistro.tsx, con consulta de 3 o más caracteres y sin resultados, mostrar «No está en tu colección · Añadir «X»» enlazando a /coleccion/nuevo?nombre=X. 3) En coleccion/page.tsx, distinguir colección vacía de filtros sin resultados. 4) En recomendacion/page.tsx, con candidatos.length === 0, «Aún no tienes perfumes que recomendar» y un CTA. 5) En estadisticas, estado vacío hasta tener unos pocos usos, en lugar de KPIs a 0. (`app/page.tsx:78-96`, `FormularioRegistro.tsx:411`)
  - *Matiz de la verificación:* Bajar a media y reformular: el problema central es que Hoy, la pantalla a la que lleva el registro, no tiene estado de bienvenida y que el buscador no da ninguna respuesta cuando no encuentra nada (esto también afecta al usuario principal cuando teclea con erratas).
- ✔ **Navegación sin feedback con red lenta: la pestaña no responde en 2 a 4 s y los formularios de servidor no muestran progreso** · TRV-4 · media · S
  - *Arreglo:* 1) Añadir loading.tsx con un esqueleto (título real y bloques grises) en src/app (raíz), /coleccion, /estadisticas, /mas, /recomendacion y /asistente: así Next precarga la cáscara en el prefetch y el cambio es instantáneo. 2) En NavegacionInferior.tsx, usar useLinkStatus() (disponible en Next 15.5) para marcar la pestaña pulsada de forma optimista mientras carga. 3) Sustituir los botones de envío de mas/configuracion/page.tsx y mas/page.tsx por BotonEnviar con texto pendiente («Guardando…», «Saliendo…»). (`mas/configuracion/page.tsx:83`, `mas/page.tsx:36`)
- ◐ **Recordatorio diario: tres controles independientes, sin confirmación, una hora que no hace nada y escondido en «Configuración»** · TRV-6 · media · M
  - *Arreglo:* Unificarlo en un solo interruptor «Recordarme por la noche si no he apuntado nada». Al activarlo: pedir el permiso, suscribir el dispositivo (AvisosDiarios.activar) y guardar activo=true con la misma acción, mostrando «Activo en este móvil». (`mas/configuracion/page.tsx:94-128`, `recordatorio.ts:130`)
  - *Matiz de la verificación:* Mantener la unificación en un solo interruptor (permiso, suscripción y activo=true en una sola acción, con el estado «Activo en este móvil»), la entrada propia en Más y la confirmación al guardar.
- ✔ **Los controles nativos se pintan en tema claro y los bordes de campos y chips no llegan a 3:1** · TRV-9 · media · S
  - *Arreglo:* Añadir `html { color-scheme: dark; }` en globals.css (y viewport.colorScheme = 'dark' en layout.tsx) más `accent-color: theme(colors.acento)` para casillas y radios. Crear un token borde-control de al menos 3:1 sobre fondo (por ejemplo, alrededor de #75654f) para inputs, .chip, .opcion y .boton-secundario, y dejar `borde` para separadores decorativos. (`tailwind.config.ts:39`, `globals.css:40`)
- ✔ **Todas las pantallas se titulan «Scentify»** · TRV-14 · media · S
  - *Arreglo:* En layout.tsx, title: { default: 'Scentify', template: '%s · Scentify' }, y en cada page.tsx `export const metadata = { title: 'Colección' }` (o generateMetadata con el nombre del perfume en /coleccion/[id]). (`layout.tsx:19`)
- ＋ **Sin conexión, el buscador de Hoy no encuentra nada y solo se pueden registrar los 5 recientes, aunque el banner dice «Puedes registrar igual»** · nuevo · media · S
  - *Arreglo:* En src/app/page.tsx, pasar a FormularioRegistro la lista ligera de la colección activa (id, nombre, marca, spraysHabituales; son de 20 a 200 filas). Así va dentro del HTML de '/' que cachea el SW. (`FormularioRegistro.tsx:159-161`, `consultas.ts:239`)
- ◐ **No hay gestión de cuenta: ni recuperar ni cambiar la contraseña, ni borrar la cuenta, ni ver con qué cuenta estás, ni cerrar sesiones remotas** · TRV-5 · baja · M
  - *Arreglo:* Añadir en Más una sección «Cuenta» (nueva ruta src/app/mas/cuenta/page.tsx) con: el correo de la sesión; «Cambiar contraseña» (actual + nueva, con hashearPassword); «Cerrar sesión en todos los dispositivos», incluyendo un usuario.version_sesion en la carga firmada de abrirSesion() y comprobándolo en usuarioActual(); y «Borrar mi cuenta», con confirmación escribiendo el correo y el enlace a la copia JSON (/api/exportar) antes, ya que el cascade existe. (`auth.ts:6`, `mas/page.tsx:8-17`)
  - *Matiz de la verificación:* Reformular como fricción menor en una app para un grupo pequeño de confianza: lo que aporta valor con esfuerzo S es mostrar el correo de la sesión en Más y un «Cambiar contraseña» (actual + nueva).
- ◐ **Textos técnicos de administrador para el usuario final y una pestaña principal muerta (Asistente sin clave)** · TRV-7 · baja · S
  - *Arreglo:* En layout.tsx (componente de servidor), pasar a NavegacionInferior un indicador asistenteDisponible() y, si es false, poner Estadísticas en esa posición. Reescribir los textos para el usuario: «El asistente no está activado en esta instalación. (`asistente/page.tsx:18-21`, `AvisosDiarios.tsx:105`)
  - *Matiz de la verificación:* Bajar a baja y limitarlo a instalaciones sin clave: reescribir los dos mensajes para el usuario final («El asistente no está activado en esta instalación», «Los avisos no están disponibles en esta instalación») y llevar el detalle técnico al README o a los logs.
- ◐ **Login: un error borra correo y contraseña, no se anuncia al lector de pantalla, y la barra de navegación aparece en las pantallas de acceso** · TRV-8 · baja · S
  - *Arreglo:* accionIniciarSesion devuelve { error, email } y FormularioLogin usa defaultValue={estado?.email}, con autoFocus en la contraseña tras el error. Añadir role="alert" a los dos aviso-error. (`acciones.ts:87-92`, `acciones.ts:108-134`)
  - *Matiz de la verificación:* Mantener las tres correcciones (esfuerzo S): devolver { error, email } con defaultValue, añadir role="alert" a los dos aviso-error y ocultar la barra en SIN_SESION.
- ◐ **404 genérica de Next en inglés, también al abrir el enlace de un perfume que te pasa un amigo** · TRV-10 · baja · S
  - *Arreglo:* Crear src/app/not-found.tsx en español con el estilo de la app y enlaces a Hoy y Colección. En coleccion/[id]/page.tsx, si el id no es tuyo pero su ficha existe (fichaParaAlta), mostrar la ficha compartida en solo lectura con «Añadir a mi colección» y «A mi wishlist» (ver la idea de enlace compartible). (`coleccion/[id]/page.tsx:32`)
  - *Matiz de la verificación:* Limitar el hallazgo al 404 genérico (crear src/app/not-found.tsx en español, con el estilo de la app y enlaces a Hoy y Colección).
- ◐ **Instalar la app no tiene guía, aunque los avisos en iPhone y el «Compartir → Scentify» de Android la exigen; el manifest tiene huecos** · TRV-11 · baja · S
  - *Arreglo:* Crear un componente <InstalarApp/> en Más y en el arranque guiado: en Android captura beforeinstallprompt y ofrece «Instalar»; en iOS, si no está en modo standalone, enseña «Compartir → Añadir a pantalla de inicio» con un dibujo. (`AvisosDiarios.tsx:96`, `InstalarBoton.tsx:107`)
  - *Matiz de la verificación:* Centrarlo en iOS: guía «Compartir → Añadir a pantalla de inicio» cuando no está en modo standalone, en Más y junto al botón de avisos, que es donde hace falta.
- ✔ **La cola offline descarta en silencio los usos de una cuenta si en ese móvil entra otra** · TRV-13 · baja · S
  - *Arreglo:* Guardar en cada uso encolado un identificador de cuenta no secreto (por ejemplo, un hash del userId en una cookie legible, puesto al entrar). En vaciarCola(), saltar sin borrar los usos de otra cuenta y avisar «Hay 1 registro de otra cuenta en este móvil». (`SincronizadorOffline.tsx:117-119`, `api/usos/route.ts:45-47`)
- ＋ **La sesión caduca a los 90 días aunque uses la app a diario, y al volver a entrar te deja en Hoy en lugar de donde estabas** · nuevo · baja · S
  - *Arreglo:* Sesión deslizante: un middleware.ts que vuelva a firmar la cookie cuando le queden menos de 30 días (o hacerlo en cada acción de servidor). Sustituir los redirect('/login') de las páginas por un helper exigirSesion(ruta) que redirija a /login?siguiente=<ruta> (destinoSeguro ya valida el destino en acciones.ts). (`auth.ts:84-95`, `auth.ts:80`)

## Catálogo de features

30 features consolidadas a partir de 99 ideas, con lo que se reutiliza del código y los cambios de esquema comprobados. «Ahora» son las de alto impacto y bajo esfuerzo que refuerzan el caso de uso principal. Impacto de 1 a 5 según el uso real descrito en la spec (el dueño cada día, más un grupo pequeño de amigos).

### Ahora

#### Sugerencia del día y accesos rápidos estables en Hoy

*ritual diario · impacto 5/5 · esfuerzo M*

**Problema.** De pie por la mañana, «Un toque y listo» solo ofrece «Repetir el de ayer» y los 5 últimos usados (usadosRecientemente ordena por max(fecha)): justo lo que la rotación quiere evitar. Con los datos demo el perfume del día está entre los chips solo el 51 % de los días (HOY-8) y los chips cambian de orden en cada registro. La sugerencia del motor vive en Sugerir, a otra pestaña y debajo de cuatro bloques de controles. El contexto por defecto solo distingue laborable y fin de semana.

**Propuesta.** Fase 1: primer chip destacado «★ Ameerat Al Arab · 22 días» con una línea de motivo debajo («encaja con Oficina, Día y otoño»): un toque lo registra con el aviso Deshacer/Ajustar de siempre y «↻» lo descarta por hoy y trae el siguiente; sigue el cambio de momento Día/Noche del formulario. Fase 2: el resto de chips quita lo ya registrado hoy, mezcla los más frecuentes en ese contexto y momento con los recientes y mantiene un orden estable para que la mano aprenda dónde está cada uno; mantener pulsado abre el formulario relleno en vez de registrar. Fase 3, «semana tipo»: el contexto por defecto sale del día de la semana exacto cuando hay datos (≥4 usos y ≥50 %), y en Configuración una rejilla L-D × Día/Noche permite fijarlo a mano («viernes mañana: Gimnasio») o marcar «esta noche no suelo salir».

**Cómo se construye.** src/app/page.tsx ya calcula zona, momentoDeAhora, estacionEfectivaDe(userId, hoy, momento), contextoHabitual(DIA/NOCHE) y usosDelDia en un Promise.all: se añaden candidatosParaRecomendar(userId) y descartesDeHoy(userId, hoy) (src/servicios/consultas.ts:108 y :152) y se llama dos veces a recomendar() (src/dominio/recomendacion.ts:200; función pura) con {coleccion, momento, contextoId: habitual, estacionesCompatibles: estacion.estaciones, hoy, descartados: descartes + perfumeId de los usos de hoy, limite: 2}, una por momento, para que el chip siga al conmutador. FormularioRegistro.tsx recibe una prop `sugerido` (PerfumeBreve + motivo) y reutiliza registrarAlToque (l.241) y el aviso flotante. «↻» usa accionDescartarRecomendacion (src/app/acciones.ts:239), que hoy solo hace revalidatePath('/recomendacion'): añadir revalidatePath('/'). Fase 2: consulta nueva frecuentesEn(userId, momento, contextoId, dias=60) en consultas.ts junto a usadosRecientemente (l.239). Fase 3: contextoHabitual (consultas.ts:289) ya agrupa con extract(isodow): pasa a isodow exacto con la regla de umbral en una función pura de src/dominio con test, y un ajuste 'semana_tipo' ({isodow: {DIA, NOCHE: contextoId|null|'NO'}}) leído por leerConfiguracion y guardado con guardarAjuste (src/servicios/ajustes.ts:55/:90), con la rejilla en src/app/mas/configuracion/page.tsx. Sin cambios de esquema.

**Ajuste tras la revisión crítica.** Solo la fase 1 (el chip ★, aditivo) es «ahora». La fase 2 cambia la regla explícita de la spec 6.1 («los 5 usados más recientemente»): necesita tu visto bueno o ir como opción. La fase 3 (semana tipo) va a «siguiente», después de que los contextos se puedan editar.

**Riesgos.** Dos consultas más en la pantalla crítica (candidatosParaRecomendar trae marcas de toda la colección; con 150 frascos sigue siendo una consulta por tabla, pero medir en Neon HTTP). Que el chip no empuje el buscador hacia abajo (chip, no tarjeta). Offline la página cacheada enseña la sugerencia de ayer: marcarla o recalcularla en cliente (ver «Offline de verdad»). Debe ser exactamente la misma lógica que Sugerir para no contradecirse.

#### Cierre del día en Hoy: valoración y duración a un toque

*ritual diario · impacto 5/5 · esfuerzo S*

**Problema.** Duración percibida y valoración del día alimentan los promedios de la ficha, la recomendación y casi todos los insights, pero casi nunca se rellenan: viven en «Completar detalles» del historial de la ficha, a ~9 toques y ~950 px de scroll (HOY-2). Tras registrar, Hoy sigue igual que antes con media pantalla vacía (HOY-6) y el registro de un toque nunca enseña el desglose de idoneidad (HOY-7).

**Propuesta.** Tras registrar, el uso de hoy sube arriba como tarjeta «Hoy llevas Khamrah · Noche · Cita» con su desglose de idoneidad, y el buscador y los chips se pliegan tras «¿Te pones otro?». Desde las 18:00, o al llegar desde el aviso con ?cierre=1, la tarjeta pregunta «¿Qué tal?»: 5 botones de valoración y 5 chips de duración que guardan al tocarlos, sin botón Guardar, más «Cambiar» y «Borrar». Debajo, «Te faltan 3 de esta semana» abre una cola con los usos sin completar de los últimos 7 días, uno tras otro. Si el perfume lleva menos de 3 usos, la pregunta sale aunque sea de día. Nada de esto toca el registro de la mañana.

**Cómo se construye.** src/app/page.tsx ya carga usosDelDia (src/servicios/usos.ts:239), que devuelve duracionPercibida, valoracionDia e idoneidadDetalle (añadir comentario). Componente cliente nuevo TarjetaCierre que reutiliza DesgloseIdoneidad/InsigniaIdoneidad (src/componentes/Idoneidad.tsx), DURACION_LEGIBLE (src/componentes/BloquePromedios.tsx) y las opciones de src/app/coleccion/[id]/CompletarUso.tsx. Ojo: accionCompletarUso (src/app/acciones.ts:199) pone a null todo campo vacío porque el formulario manda siempre los cuatro, así que hace falta una acción nueva accionCompletarCampo(usoId, campo, valor) que pase solo ese campo a completarUso (usos.ts:201), que ya ignora los undefined y no toca el snapshot. Borrar con accionBorrarUso. Cola semanal: consulta nueva usosSinCompletar(userId, desde) en servicios/usos.ts (valoracion_dia o duracion_percibida null, fecha ≥ hoy-7). Sin cambios de esquema.

**Riesgos.** Los toques de cierre no pasan por la cola offline (solo encola POST de usos): sin red, deshabilitar con aviso o ampliar la cola a PATCH. Que por la mañana la tarjeta no desplace al buscador (pregunta solo de noche o con ?cierre). Toques accidentales sin botón Guardar: permitir cambiar el valor tocando otro.

#### Recategorización con evidencia: lo que haces frente a lo que marcaste

*recomendacion / planificacion · impacto 5/5 · esfuerzo M*

**Problema.** La recomendación, los huecos y la tasa de acierto dependen de las marcas declaradas, y la realidad se desvía: en la demo Khamrah está marcado para Cita/Amigos/Elegante, Otoño-Invierno y Noche, pero su contexto más frecuente es Oficina y su estación Verano; Amber Oud Gold tiene 16 de 22 usos fuera de lo marcado. La ficha enseña el dato («Contexto más frecuente: Oficina») y nadie actúa. Los «Otro» se guardan y solo sirven ese día.

**Propuesta.** En la ficha, encima de «Cómo lo tengo marcado», tarjetas con evidencia: «Lo has llevado 10 veces a la Oficina (4,0/5) y no lo tienes marcado [Añadir Oficina] [Fue casualidad]», y al revés «Marcado para Gimnasio y sin un solo uso allí en 12 meses [Quitar]». Un toque aplica solo ese cambio, sin pasar por el editor de 8 pasos. En Huecos, «Ya lo cubres sin saberlo» y «Casi lo cubren» con «Marcar también para Invierno» y cuántos huecos se cierran. En Estadísticas, las 3 propuestas de más peso. Los «Otro» repetidos en una combinación cuentan como evidencia («lo has descartado 4 veces para Gimnasio»). Nada se aplica sin confirmar y las idoneidades históricas no cambian (criterio 10).

**Cómo se construye.** Función pura nueva src/dominio/recategorizacion.ts desajustesDeMarcas(usos, marcasActuales, descartes, hoy), con tests: recalcula cada uso contra las marcas ACTUALES con calcularIdoneidad (src/dominio/idoneidad.ts:52), no contra el snapshot idoneidad_detalle. Reglas iniciales: ≥4 usos en 180 días con valoración media ≥3,5 (o sin valorar, dicho) → proponer añadir; media ≤2,5 → no proponer; marca sin uso en 12 meses con el perfume en uso → proponer quitar. Para el eje estación solo cuentan usos con origen_estacion TEMPERATURA o MANUAL. Datos: historialDePerfume (src/servicios/consultas.ts:518) o una consulta agregada por perfume×contexto×momento×estación, y marcasDePerfume. Aplicar: acción nueva accionAjustarMarca(perfumeId, eje, valor, añadir|quitar) que inserta/borra en perfume_contexto/perfume_estacion/perfume_momento tras comprobar propiedad (patrón comprobarContextos de src/servicios/perfumes.ts:82) y sin dejar un eje vacío (validar(), perfumes.ts:67). Huecos: detectarHuecos (src/dominio/huecos.ts) con la colección modificada para decir cuántos cierra; leer el parámetro en src/app/mas/huecos/page.tsx. Migración: recomendacion_descarte gana contexto_id y momento nullable (la PK sigue siendo user+perfume+fecha o pasa a índice). Rechazos en ajuste 'recategorizacion_descartada' [{perfumeId, eje, valor, hasta}] durante 90 días.

**Riesgos.** En la demo 242 de 244 usos tienen estación por CALENDARIO: el eje estación tendrá poca evidencia hasta que haya temperatura real. Marcar de más degrada la recomendación (por eso el umbral de valoración). No debe convertirse en «la app aprende sola»: siempre confirma el usuario.

#### Aviso nocturno accionable: un solo push que registra o cierra el día

*ritual diario · impacto 4/5 · esfuerzo M*

**Problema.** El único push (recordatorio.ts) sale solo si no hay ningún uso hoy (`if (yaRegistrado) continue;`) y únicamente abre la app con «¿Qué te has puesto hoy?»: casi siempre la respuesta es «lo de ayer», que el sistema ya sabe, y aun así hacen falta abrir, buscar y tocar. Si se registró por la mañana, nadie pide la duración ni la valoración.

**Propuesta.** La pasada diaria decide UN aviso, como mucho uno al día. (a) Sin registro hoy: «¿Qué te has puesto hoy?» con acciones «Repetir: Asad» y «Lo de siempre: Khamrah» que registran desde la propia notificación sin abrir la app y dejan una confirmación «Apuntado: Asad · Día · Oficina [Deshacer]». (b) Con usos sin valorar: «¿Qué tal aguantó Khamrah?» con acciones de duración («4-6 h», «Más de 8 h») o, al tocar, Hoy en modo cierre. (c) Nada pendiente: no avisa. En iPhone, sin botones en las notificaciones web, el toque abre /?toque=ayer o /?cierre=1. Configuración suma la casilla «Pregúntame qué tal». Fase opcional: una línea «Mañana, 19°: Fakhar Black para la Oficina» en el mismo aviso nocturno, sin cron nuevo.

**Cómo se construye.** src/servicios/recordatorio.ts: enviarRecordatoriosPendientes (l.113) ya recorre usuarios, mide la hora y el «hoy» en su zona y deduplica con recordatorio_enviado (PK usuario+fecha, que sigue valiendo con un único aviso al día). La elección del aviso pasa a una función pura nueva src/dominio/aviso-diario.ts con tests, alimentada por usosDelDia, usoDeAyer y usadosRecientemente/contextoHabitual (consultas.ts:239/261/289). El JSON del push gana `tipo` y `acciones: [{id, titulo, uso: {perfumeId, momento, contextoId, sprays, fecha}}]`. public/sw.js: el listener 'push' pasa `actions` y la plantilla en `data` a showNotification; 'notificationclick' (l.247) atiende evento.action: genera crypto.randomUUID(), hace POST /api/usos (idempotente por id, src/app/api/usos/route.ts) y, si falla o da 401, lo guarda con abrirBd/operar en la misma cola IndexedDB que ya vacía vaciarCola + sync. Rutas nuevas: DELETE /api/usos/[id] que llama a borrarUso (usos.ts:220, ya filtra por userId) para «Deshacer», y PATCH /api/usos/[id] con un solo campo para la duración (completarUso). Ajuste 'recordatorio' (JSON en ajuste) gana {cierre: boolean}. Subir VERSION del SW (hoy 'v6'). El cron de vercel.json (0 20 * * *) no cambia.

**Depende de:** Registrar de un toque desde fuera de Hoy: enlaces con parámetro, atajos del icono, NFC y botón en la ficha; Cierre del día en Hoy: valoración y duración a un toque.

**Riesgos.** Sesión caducada (401) desde el SW: encolar y notificar «Abre Scentify para entrar». Registrar «lo de ayer» a ciegas exige confirmación con Deshacer y debe usar el momento y contexto del uso de ayer, no NOCHE por la hora de las 21:00 (HOY-5/HOY-15). Las acciones no existen en iOS Safari. El cron de Hobby puede caer en cualquier minuto de la hora.

#### Registrar de un toque desde fuera de Hoy: enlaces con parámetro, atajos del icono, NFC y botón en la ficha

*ritual diario · impacto 4/5 · esfuerzo S*

**Problema.** El atajo del icono «Registrar uso» solo abre «/» (manifest.webmanifest), así que siguen haciendo falta abrir la app y tocar. Desde la ficha de un perfume no se puede decir «me lo pongo hoy» y Hoy no acepta un perfume preseleccionado (COL-6). La pegatina en la balda o el atajo de Android no tienen a dónde apuntar.

**Propuesta.** Hoy acepta ?toque=ayer, ?toque=sugerido y ?toque=<perfumeId>: al cargar ejecuta el registro de un toque con su aviso Deshacer/Ajustar, limpia el parámetro de la URL y no repite si ese perfume ya está registrado hoy. El manifest suma los atajos «Repetir el de ayer», «Lo sugerido de hoy», «Valorar hoy» (?cierre=1) y «Añadir perfume» (pulsación larga del icono en Android). Una pegatina NFC en la balda con https://…/?toque=<id> abre la PWA instalada y apunta ese frasco. En la ficha, botón «Me lo pongo hoy» que registra con los valores por defecto y vuelve a Hoy.

**Cómo se construye.** src/componentes/FormularioRegistro.tsx: efecto al montar que lee ?toque= y llama a registrarAlToque(perfume, momentoInicial, contextoPorDefecto(momentoInicial)) (l.241) o repetirAyer (l.306); router.replace para limpiar la URL y una marca en sessionStorage para no re-ejecutar en recargas. src/app/page.tsx resuelve ?toque=<id> a PerfumeBreve con una consulta ligera (o el resumen de /api/perfumes/[id]/resumen) y comprueba yaRegistradoEse (consultas.ts:313). public/manifest.webmanifest: ampliar `shortcuts` (hoy «Registrar uso» y «Recomiéndame»). src/app/coleccion/[id]/page.tsx: enlace a /?toque=<id>. Sin cambios de esquema.

**Riesgos.** Registro accidental por un enlace viejo o un atajo pulsado sin querer: Deshacer visible y no repetir si ya hay uso de ese perfume hoy. El efecto debe correr en el cliente, no en el servidor, para que el prefetch de <Link> no registre nada. NFC solo abre la PWA en Android; en iOS va por Atajos (ver «Registrar con una frase»).

### Siguiente

#### Planes con fecha, separados de los usos

*recomendacion / planificacion · impacto 4/5 · esfuerzo M*

**Problema.** «Me lo pondré» (Sugerir → Mañana) crea un uso real con fecha futura: cuenta en estadísticas y apaga el recordatorio aunque luego cambies de idea, y no se ve en ningún sitio (SUG-13). Solo se puede planificar mañana, no la cita del viernes ni la semana.

**Propuesta.** Un plan es una intención, no un uso. «Me lo pondré» guarda fecha, momento, contexto y perfume. Sugerir suma «Otro día» (hasta 15 días, lo que da la previsión) y una vista «Planificar la semana» que encadena recomendaciones sin repetir perfume, editable día a día. Ese día, Hoy lo enseña en el sitio de la sugerencia: «Planeado: Hawas · Noche · Cita [Me lo he puesto] [Hoy no]»; confirmar registra el uso con el tiempo real de ese día. Sugerir señala lo reservado («Lo guardas para la Cita del viernes») sin cambiar el orden. Un plan sin confirmar caduca solo, no cuenta en estadísticas y no apaga el recordatorio. El calendario pinta los planes en los días futuros. «Mañana me pongo este» en los olvidados de Estadísticas crea un plan.

**Cómo se construye.** Migración: tabla plan_uso(id uuid, user_id FK cascade, fecha date, momento, contexto_id FK, perfume_id FK restrict, uso_id uuid null FK set null, descartado bool default false, creado_en) con índice (user_id, fecha); migración de datos que mueve a plan_uso los usos con fecha > hoy (los actuales «para mañana»). accionRegistrarDesdeRecomendacion (src/app/acciones.ts:172), que con dia=manana inserta hoy en uso, pasa a insertar el plan. recomendar() (src/dominio/recomendacion.ts) recibe `reservados` para el texto y generaliza paraManana a días de antelación (tests en tests/recomendacion.test.ts). estacionEfectivaDe(userId, fecha, momento, nombreDia) (src/servicios/usos.ts:63) ya usa la previsión y DIAS_MAX_PREVISION = 15 está en src/dominio/asistente.ts. Hoy confirma con registrarAlToque y fija plan_uso.uso_id. SelectorPeticion.tsx gana el selector de día. Copia JSON v3 (src/servicios/datos.ts: copiaCompleta, restaurarCopia, aVersion2) incluye plan_uso.

**Depende de:** Sugerencia del día y accesos rápidos estables en Hoy.

**Ajuste tras la revisión crítica.** Mientras llega la tabla de planes, conviene un arreglo pequeño ya: «Me lo pondré» crea hoy un uso con fecha futura, que la spec 6.1 no contempla (fecha editable hacia atrás). Guardarlo como plan provisional y no como uso.

**Riesgos.** Migrar los usos futuros existentes sin perder ninguno. La previsión a 10-15 días es poco fiable: marcar la estación como «según previsión». «Mañana» hereda hoy el momento de la hora (SUG-6): el plan debe pedir momento explícito.

#### Frasco vivo: nivel estimado, ritmo de consumo, coste por uso y despedida

*frasco y dominio de coleccionista · impacto 4/5 · esfuerzo M*

**Problema.** La colección guarda volumen_ml, fecha_compra y los sprays de cada uso, pero no los relaciona: no sabes qué frascos se están acabando (para reponer) ni cuáles no se gastan nunca, ni cuánto te cuesta cada puesta. Al pasar un frasco a «Lo tuve» no queda por qué (se acabó, lo regalé, lo vendí) ni qué deja sin cubrir.

**Propuesta.** En la ficha, bloque Inventario: «≈ 57 ml (estimado) · a tu ritmo de los últimos 90 días, ~9 meses», solo si has marcado un nivel; si no, «482 sprays apuntados desde febrero». «¿Cuánto queda?» con 5 siluetas (lleno, ¾, ½, ¼, últimas) o ml exactos; con dos lecturas se calibra el ml por spray de ese atomizador. Por debajo del 15 %: «queda poco» en la lista, en los chips de Hoy y en Sugerir (informa, no excluye) y «Reponer» crea el deseo con nombre, marca, URL y prioridad Lo necesito. Orden «Se acaba antes» en Colección. Precio pagado opcional, prerrellenado con el precio objetivo al convertir un deseo: «22 usos desde feb 2026 → 1,59 €/uso», bloque «Mejor y peor valor» y el «dinero parado» de lo que no usas. Al pasar a «Lo tuve», una hoja de despedida: motivo (Se acabó, Regalado, Vendido, Cambiado), fecha y qué deja sin cubrir («sin Khamrah te quedas sin nada para Cita · Noche · Invierno»).

**Cómo se construye.** Migración: tabla perfume_nivel(perfume_id FK cascade, fecha date, ml decimal(6,1), creado_en; PK perfume_id+fecha); perfume.precio_compra decimal(10,2) null check ≥0; enum motivo_salida (ACABADO, REGALADO, VENDIDO, CAMBIADO, OTRO) y perfume.motivo_salida/fecha_salida null. Ajuste 'ml_por_spray' (0,1 por defecto) en src/servicios/ajustes.ts. agregadosDeUso (src/servicios/consultas.ts:38) gana sum(sprays) y sprays desde la última lectura. Función pura nueva src/dominio/inventario.ts (mlRestantes, ritmo, calibrar, costePorUso) con tests y la fecha por parámetro. UI en src/app/coleccion/[id]/page.tsx junto a BloquePromedios; precio en seccionInventario de src/componentes/FormularioPerfume.tsx (l.701) y en esquemaPerfume de src/app/acciones.ts; el enlace «Convertir en colección» de src/app/mas/wishlist/page.tsx (l.83) pasa también el precio. «Reponer» con crearDeseo (src/servicios/wishlist.ts:29). Despedida: cambiarEstado/accionCambiarEstado (perfumes.ts:425, acciones.ts:365) + detectarHuecos con y sin el frasco. FiltrosColeccion.orden 'se-acaba'. Llevar las columnas a CABECERAS_COLECCION (src/dominio/csv.ts), a la hoja Excel (src/dominio/hoja-actualizacion.ts, patrón leerVolumen), a la copia v3 y a PerfumeExportable (src/dominio/exportacion-ia.ts).

**Riesgos.** Los usos empiezan en feb 2026 y los frascos son de 2024: sin nivel de partida no se afirma nada. Usos sin sprays: usar la media y decirlo. El ml por spray varía entre 0,05 y 0,17. El precio es dato sensible: nunca visible para amigos.

#### Desear sin teclear: compartir a la wishlist, deseo enlazado a su ficha y conversión que cierra el deseo

*alta y datos · impacto 4/5 · esfuerzo M*

**Problema.** Compartir desde Fragrantica, el botón «Enviar a Scentify» e /importar solo llevan al alta en la colección. Un perfume que quieres pero no tienes se teclea a mano en la wishlist, sin notas de fondo, así que el aviso de solapamiento (10.2) casi nunca funciona (los 4 deseos de la demo tienen 0 notas). «Convertir en colección» no marca el deseo como convertido y se queda en la lista: marcarConvertido existe pero nadie la llama (WIS-1, ALTA-7).

**Propuesta.** Tras Compartir → Scentify, el bookmarklet o /importar, dos botones grandes: «Lo tengo» (el alta de siempre) y «Lo quiero»: crea el deseo con nombre, marca, URL y las notas de fondo leídas, y enseña al momento el aviso de solapamiento. En el formulario de deseo, el nombre se autocompleta con el catálogo común y trae sus notas de fondo. «Convertir en colección» va directo a «Usar esta ficha», propone el precio objetivo como precio pagado y saca el deseo de la lista.

**Cómo se construye.** destinoDeCompartido (src/servicios/compartido.ts:77) devuelve hoy siempre /coleccion/nuevo?…: pasa a una pantalla intermedia con los dos botones; la ficha leída viaja empaquetada con empaquetarFicha/desempaquetarFicha (src/dominio/ficha-compartida.ts) y FichaFragrantica.notas.fondo; accionGuardarDeseo (src/app/acciones.ts:393) ya acepta fragranticaUrl y notasFondo y devuelve el aviso. Migración: wishlist.ficha_id uuid null FK ficha on delete set null, rellenada en la propia migración para los deseos cuya claveBusqueda (src/dominio/texto.ts:20) case con una sola ficha. FormularioDeseo.tsx consulta /api/catalogo (buscarEnCatalogo, consultas.ts:577). Conversión: el enlace de src/app/mas/wishlist/page.tsx (l.83) pasa deseoId y fichaId; al guardar se llama a marcarConvertido (src/servicios/wishlist.ts:66) y listarWishlist filtra los convertidos. Copia v3.

**Ajuste tras la revisión crítica.** Las notas de fondo que trae deben pasar por el mismo saneo de vocabulario (inglés → español y sinónimos) para que el aviso de solapamiento funcione.

**Riesgos.** Sin sesión, lo compartido se pierde (ALTA-8): el mismo camino debe sobrevivir al login. Fichas del catálogo sin pirámide no dan notas de fondo.

#### Asistente que actúa: propuestas con confirmación, el motor como herramienta y preguntas desde cada pantalla

*IA · impacto 4/5 · esfuerzo M*

**Problema.** Las respuestas del asistente no permiten actuar: el perfume recomendado no se puede registrar ni abrir y la conversación se pierde al ir a hacerlo (IA-2). El asistente y Sugerir recomiendan con criterios distintos e ignora los «Otro» del día (IA-7). Es una pantalla aislada con 4 sugerencias fijas y ninguna pantalla la enlaza.

**Propuesta.** Herramientas que no escriben: proponen una tarjeta en el chat con [Confirmar] / [Cambiar] para registrar un uso, completar uno, crear un deseo (precio objetivo solo si lo dices tú) o preparar la maleta (enlace a /mas/viaje con lugar y fechas puestos). Una herramienta de lectura, recomendacion_del_motor, devuelve lo mismo que Sugerir con los descartes del día, y el asistente parte de ella. /asistente?q=… y ?perfume= con entradas desde la ficha («¿Con qué lo combino?», «¿A qué se parece de lo que tengo?»), la wishlist, Huecos, Viaje y Sugerir («¿Por qué este?»). Memoria visible y editable («no me gusta el pachulí», «en la oficina nada de oud fuerte») que solo se guarda al confirmar, se borra en Configuración y nunca entra en el motor de Sugerir. La conversación sobrevive a ir a la ficha y volver. Con permiso explícito de los amigos, una herramienta que conoce lo que tiene el grupo.

**Cómo se construye.** toolRunner y betaZodTool ya montados en src/servicios/asistente.ts (prevision_tiempo, historial_de_usos y emitir). EventoAsistente (src/dominio/asistente.ts:37) gana el tipo 'propuesta'; src/app/asistente/Chat.tsx pinta la tarjeta y llama a acciones existentes: accionRegistrarDesdeRecomendacion, accionCompletarUso, accionGuardarDeseo y accionDescartarRecomendacion (src/app/acciones.ts). recomendar + candidatosParaRecomendar + descartesDeHoy para la herramienta del motor. documentoParaIa con opción conIds solo en el contexto del asistente (enum de ids en las herramientas). /mas/viaje ya lee lugar, lat, lon, fecha, contextos, momentos y tope de searchParams; geocodificar (src/servicios/clima.ts:153). Chat.tsx acepta ?q= y guarda la conversación en sessionStorage. Memoria en ajuste 'preferencias_ia' (máx. ~30), en un bloque de sistema tras la colección cacheada. Sin cambios de esquema.

**Depende de:** IA bajo control: privacidad, coste y tope por cuenta, y kit «pregúntale a cualquier IA» sin clave.

**Riesgos.** Ids equivocados del modelo: enums y confirmación siempre. Antes hay que resolver IA-1 (la conversación se bloquea tras respuestas largas). La memoria no puede convertirse en una regla oculta del motor.

#### Offline de verdad: instantánea de la colección y motor de recomendación en el cliente

*plataforma / PWA · impacto 4/5 · esfuerzo L*

**Problema.** La spec exige caché offline de la colección y una PWA que funcione sin conexión, y el README dice que el dominio es puro justamente para calcular en el cliente. Pero sin red Colección no se abre, el SW sirve Hoy en cualquier URL (TRV-2) y «Me lo pongo»/«Otro» tumban la app con «Application error» (SUG-1, TRV-1). Con mala cobertura, abrir Hoy espera a la red sin límite (HOY-13).

**Propuesta.** En cada apertura con red se guarda una instantánea de la colección (candidatos con marcas y promedios, contextos, umbrales, últimos usos y la sugerencia del día). Sin conexión, Colección se pinta en solo lectura desde ella, Sugerir calcula en el navegador con el mismo motor y la estación de respaldo por calendario («Sin datos de tiempo, usando otoño por fecha»), y «Me lo pongo» y «Otro» van por la cola offline. Un sello discreto «Datos de hace 2 h» dice qué se está viendo. Con mala cobertura, Hoy se sirve de caché a los pocos segundos.

**Cómo se construye.** Endpoint nuevo /api/coleccion-instantanea con candidatosParaRecomendar, listarContextos y leerConfiguracion. Funciones puras ya preparadas para el cliente: recomendar (src/dominio/recomendacion.ts), calcularEstacionEfectiva/estacionPorCalendario (src/dominio/estacion.ts) y calcularIdoneidad (src/dominio/idoneidad.ts). Almacén nuevo en la IndexedDB 'scentify' junto a la cola de src/cliente/cola-offline.ts; los descartes offline se encolan también. Sugerir y Colección necesitan un modo cliente (hoy son Server Components con Server Actions que fallan sin red). public/sw.js: redPrimero (l.72) con timeout para las navegaciones y sin servir Hoy en URLs que no son Hoy; subir VERSION. Sin cambios de esquema.

**Depende de:** Sugerencia del día y accesos rápidos estables en Hoy.

**Ajuste tras la revisión crítica.** La parte que hoy rompe el flujo principal (fronteras de error, «Me lo pongo» por la cola offline, timeout en el service worker, /sin-conexion de verdad) no espera a esta feature: va en la fase 0 del roadmap como arreglo. Aquí queda solo la instantánea y el motor en el cliente.

**Riesgos.** Duplicar el render en cliente y servidor. Las cachés no distinguen cuentas: la instantánea se borra al llegar al login, como ya se hace con las páginas (TRV-13). Datos viejos presentados como actuales: el sello es obligatorio.

#### Centro de cuenta y dispositivos

*plataforma / PWA · impacto 4/5 · esfuerzo M*

**Problema.** Con amigos usando la app, no se puede cambiar ni recuperar la contraseña (hay que tocar la base a mano), ni ver con qué cuenta estás, ni cerrar la sesión de un móvil perdido, ni ver en qué dispositivos están activos los avisos, ni borrar la cuenta (TRV-5). Rotar el código de invitación exige redesplegar.

**Propuesta.** /mas/cuenta: con qué correo estás, cambiar contraseña, «Cerrar sesión en todos los dispositivos», lista de dispositivos con avisos (navegador, fecha, «Quitar»), descargar la copia completa y «Borrar mi cuenta» con la copia como paso previo. Para el anfitrión: un enlace de restablecimiento de un solo uso y caducidad corta para el amigo que olvidó la contraseña, y rotar el código de invitación desde la app sin redesplegar.

**Cómo se construye.** hashearPassword y passwordCorrecta (src/servicios/auth.ts:44/:49). La sesión es una cookie firmada sin tabla: migración usuario.version_sesion int incluido en la carga firmada para invalidar todas las sesiones; usuario.restablecer_hash y restablecer_expira; push_suscripcion.agente text para nombrar el dispositivo; borrarSuscripcion (src/servicios/recordatorio.ts:94); /api/exportar/[que] para la copia previa; destinoSeguro para volver. Código de invitación en un ajuste global con prioridad sobre SCENTIFY_CODIGO_INVITACION. Borrado de cuenta: las tablas cuelgan de usuario con ON DELETE CASCADE, pero uso.perfume_id y uso.contexto_id son ON DELETE RESTRICT (drizzle/0000_esquema_inicial.sql), que se comprueba al instante: borrar usos y descartes explícitamente antes y fijarlo con un test de integración.

**Ajuste tras la revisión crítica.** Con amigos ya dentro, es el cimiento de lo social y va antes que cualquier feature social. Dos piezas S para «ahora»: renovar la cookie al usarla (hoy caduca a los 90 días aunque uses la app a diario) y limitar los intentos de login.

**Riesgos.** Borrar la cuenta no es «borrar un perfume» (la regla dura sigue para el frasco individual), pero es irreversible: copia obligatoria y doble confirmación. Las fichas que creó esa cuenta sobreviven (creada_por set null). El enlace de restablecimiento debe ser de un solo uso y corto.

#### Capas (layering) en un solo registro

*ritual diario · impacto 3/5 · esfuerzo M*

**Problema.** En perfumería árabe es habitual combinar dos fragancias (un aceite bajo un EDP, dos EDP). Hoy hay que registrar dos usos por separado, cada uno con su momento y contexto, y ni la ficha ni las estadísticas saben que fueron juntos.

**Propuesta.** En el formulario y en el aviso flotante del registro de un toque, «+ Capa» abre el mismo buscador para un segundo perfume, con el mismo momento, contexto y fecha y sus propios sprays; registrar uno solo sigue igual de rápido. «Registrado hoy», el historial de la ficha y el día del calendario lo enseñan como una tarjeta «Khamrah + Ana Abiyedh». Si una combinación se repite, aparece entre los accesos rápidos como «Repetir capa». La ficha muestra «Lo combinas con…» (veces y valoración media) y Estadísticas, «Tus capas». Fase posterior con IA: «¿Con qué lo combino?» propone parejas de tu colección marcadas como sugerencia.

**Cómo se construye.** Migración 0006: uso.capa_id uuid null + índice (user_id, capa_id). Cada capa es un uso con su propio snapshot de idoneidad, así que calcularIdoneidad y registrarUso (src/servicios/usos.ts:166) no cambian. Zod de src/app/api/usos/route.ts y UsoPendiente de src/cliente/cola-offline.ts aceptan capaId (cada uso conserva su UUID: la cola sigue siendo idempotente). FormularioRegistro.tsx: el estado `elegido` pasa a lista y deshacer() borra todos los usos de la capa. usosDelDia, historialDePerfume (consultas.ts:518) y usosPorDia agrupan por capa_id; pares en Estadísticas con un self-join de uso por capa_id. exportarUsosCsv y copiaCompleta/restaurarCopia (src/servicios/datos.ts:219/:439/:584) añaden la columna (copia v3 que siga leyendo la v2); UsoAgregado de src/dominio/exportacion-ia.ts. Fase IA: patrón strict de src/servicios/sugerencia-contextos.ts sin búsqueda web.

**Riesgos.** Una puesta en capas cuenta dos usos (correcto por perfume, pero «usos» deja de ser «puestas»). La valoración del día se duplica en ambas capas. La segunda capa puede tener idoneidad baja: informa, no bloquea.

#### Tu semana a la vista: tira de 7 días en Hoy, racha con gracia y calendario por perfume

*ritual diario · impacto 3/5 · esfuerzo S*

**Problema.** Hoy deja vacía la mitad inferior de la pantalla y los días sin registrar solo se descubren entrando en Más → Calendario. El calendario mensual solo pinta puntos (●/○): para saber qué te pusiste hay que abrir día a día, y no se puede ver cuándo usaste un perfume concreto.

**Propuesta.** Bajo «Registrado hoy», una tira L-D con un punto o inicial por perfume; los días sin registro llevan «+» y abren /mas/calendario/[fecha], donde ya se registra con esa fecha. En el Calendario, «Llevas 23 días apuntando» con un día de gracia por semana (cuenta que apuntas, no que repitas perfume) y la racha más larga. Una línea discreta debajo de todo: «Hace un año: Amber Oud Gold · Noche · Cita». Cada día del mes lleva el filete de color de la familia del perfume y sus iniciales, y ?perfume=<id> resalta los días en que lo usaste, enlazado desde la ficha («Ver en el calendario») y desde el ranking de Estadísticas.

**Cómo se construye.** usosPorDia (src/servicios/usos.ts:265) ampliado con perfume y familia principal (ficha_familia con orden 0); semanasDelMes y EstadoDia (src/dominio/calendario.ts); función pura nueva rachaDeRegistro(dias, gracia) en dominio/calendario.ts con tests, que no cuente los meses anteriores al primer registro (CAL-2); usosDelDia(userId, desplazarDias(hoy, -365)); tonoDeFamilia (src/componentes/tono-familia.ts); src/app/mas/calendario/[fecha]/page.tsx ya monta FormularioRegistro con fechaFija. Ajuste opcional 'racha_gracia'. Sin cambios de esquema.

**Riesgos.** Espacio en Hoy: nunca por encima del buscador. Que la racha empuje a registrar por registrar: mostrarla en Calendario, no en Hoy.

#### Rotación a tu manera: criterio de orden, ver todos los que encajan, olvidados y ronda

*recomendacion / planificacion · impacto 3/5 · esfuerzo M*

**Problema.** El motor ordena solo por días sin usar: con los datos demo empuja lo que menos te gusta (Ventana 3,3/5, 51 días) y casi nunca tu favorito reciente (Najdia 4,7/5); muchas mañanas no quieres rotar, quieres acertar. Solo se ven 3 sugerencias y no se puede preguntar «¿y este?». «Olvidados» y «sin estrenar» no tienen vista ni orden en Colección, y Estadísticas enseña «Sin usar» sin ninguna acción.

**Propuesta.** Fase 1: en Sugerir, chips Rotar (el de la spec, por defecto) / Sobre seguro (mejor valoración media con un mínimo de días sin usar) / Descubrir (no estrenados y más de 30 días); «Ver los N que encajan» y un buscador «¿Y este?» que enseña el desglose por eje de cualquier perfume con «Me lo pongo igualmente»; el nombre enlaza a la ficha. Fase 2: Colección gana vistas rápidas «Para ahora», «Olvidados» (>45 días), «Sin estrenar» y «★4+», cada una una URL; Estadísticas, una tarjeta «Rescata tus olvidados» con «Me lo pongo» y «Planear». Fase 3: la «ronda» (8 de 15 · faltan 7, con frascos excluibles) y una «Revisión de dormidos» (sin uso en N días): «Darle una semana», «Apartar» (archivar: sale de recomendaciones y sigue en estadísticas) o «Se queda» (silencia 6 meses). Fase 4, opcional: retos elegidos por el usuario con insignias calculadas del historial. Sin rachas que castiguen.

**Cómo se construye.** recomendar() (src/dominio/recomendacion.ts:200) gana `criterio: 'rotar'|'seguro'|'descubrir'` junto a ordenarPorTiempoSinUsar; promedios.valoracionMedia ya llega en PerfumeCandidato y `limite` ya es configurable (tiene test). «¿Y este?»: buscarEnColeccion (consultas.ts:213) + /api/idoneidad + DesgloseIdoneidad. Colección: FiltrosColeccion (consultas.ts:335) gana sinUsarDesde y sinEstrenar (agregadosDeUso ya da ultimoUso y vecesUsado); «Para ahora» filtra por idoneidad 100 con estacionEfectivaDe y contextoHabitual. Ronda: función pura nueva src/dominio/ronda.ts; exclusiones en ajuste 'ronda_excluidos'. Dormidos: ajustes 'dias_dormido' y 'revision_frascos'; «Apartar» reutiliza archivarPerfume (src/servicios/perfumes.ts:412), sin tercer estado. Retos: ajuste 'retos' y src/dominio/retos.ts. Criterio preferido en ajuste 'criterio_recomendacion'. Sin cambios de esquema.

**Depende de:** Planes con fecha, separados de los usos.

**Ajuste tras la revisión crítica.** La spec 7.2 y el criterio 8 piden un bloque fijo «Nunca los has usado»; la decisión 3 del README lo sustituyó por meter los no estrenados primero. Antes de construir encima, confirma esa decisión o repón el bloque (S). «Sobre seguro» solo como elección explícita: Rotar sigue por defecto.

**Riesgos.** «Sobre seguro» va contra el espíritu de rotación de 7.2: solo como elección explícita, Rotar por defecto y el criterio dicho en el motivo. La gamificación puede agobiar: todo opcional y sin castigos.

#### Viaje de varios días: destino por nombre, maleta, plan por día y viaje activo

*recomendacion / planificacion · impacto 3/5 · esfuerzo M*

**Problema.** El modo viaje calcula un único día, pide latitud y longitud a mano aunque ya existe un geocodificador (VIA-1) y su resultado no ayuda a hacer la maleta ni se recuerda (VIA-2, VIA-3). Durante el viaje, Hoy y Sugerir siguen proponiendo frascos que se quedaron en casa y con el tiempo de El Campello.

**Propuesta.** Destino por nombre, rango de fechas y contextos por día («lun-vie Oficina, sáb Cita»). Resultado: el set mínimo con su volumen, casillas «en la maleta» y botón de compartir, más un plan por día que reparte los frascos con la estación de cada día en el destino. «Hacer la maleta» guarda el viaje: durante esas fechas Hoy dice «De viaje en Sevilla hasta el 14 · 3 frascos», los chips y la sugerencia salen de la maleta (con «Ver toda la colección») y la estación usa el tiempo del destino; la ubicación vuelve sola al terminar. A la vuelta: «Usaste 2 de 3» y «¿Registrar lo que usaste?» abre el calendario con los frascos del viaje como accesos.

**Cómo se construye.** resolverViaje (src/dominio/viaje.ts:77, cobertura exacta con máscaras de bits) no cambia salvo aceptar varios días. geocodificar y obtenerClima/previsionSinCache (src/servicios/clima.ts:153/:86/:144). src/app/mas/viaje/FormularioViaje.tsx y page.tsx ya leen contextos, momentos, tope, fecha, lat, lon y lugar. Plan por día: recomendar() con `descartados` acumulados. Migración: tabla viaje(id, user_id, desde, hasta, destino jsonb {lat, lon, etiqueta}, creado_en) y viaje_frasco(viaje_id, perfume_id, en_maleta bool). leerConfiguracion (src/servicios/ajustes.ts:55) devuelve la ubicación del viaje activo cuando hoy ∈ [desde, hasta], así estacionEfectivaDe no cambia. Hoy filtra los candidatos por viaje_frasco. Copia v3.

**Depende de:** Sugerencia del día y accesos rápidos estables en Hoy; Planes con fecha, separados de los usos.

**Ajuste tras la revisión crítica.** La parte que cumple la spec 10.3 (rango de días, destino por nombre con el geocodificador que ya existe, estación de día y de noche) es S-M y sin esquema: puede ir antes. La maleta y el viaje activo van después.

**Riesgos.** Más allá de 15 días no hay previsión: caer al calendario y decirlo. Un viaje que nadie cierra termina solo en `hasta`. La ubicación por viaje no debe pisar la de configuración.

#### Probar antes de comprar: decants y muestras con veredicto, y acierto de las compras a ciegas

*frasco y dominio de coleccionista · impacto 3/5 · esfuerzo M*

**Problema.** Decants, muestras y miniaturas son la forma habitual de probar perfumería árabe antes de comprar, pero en Scentify son frascos iguales a los demás: tapan huecos como si fueran para siempre, el modo viaje no los prefiere y nada ayuda a decidir «¿lo quiero en grande?». Tampoco se sabe si las compras a ciegas salen bien.

**Propuesta.** Formato del frasco (Frasco, Decant, Muestra, Miniatura) en Inventario, con etiqueta en la lista, en el buscador de Hoy y en las tarjetas; se registran igual en 10 s y cuentan en estadísticas. A los 3 usos de una muestra o decant, la ficha enseña un «Veredicto» con datos reales (valoración media, duración, contextos, solapamiento con lo que tienes) y dos botones: «Lo quiero en grande» (deseo con nombre, marca, URL y notas de fondo ya puestas) y «Paso» (Lo tuve). Huecos distingue «cubierto solo con muestra» y el modo viaje prefiere el decant a igual cobertura. «¿Cómo llegó?» (A ciegas, Lo olí antes, Por muestra, Regalo) y, a los 30 días o 5 usos, una única pregunta «¿Acierto?» alimentan «A ciegas: 4 de 6 aciertos; probados: 7 de 7».

**Cómo se construye.** Migración: enum formato_frasco y perfume.formato not null default 'FRASCO'; enum origen_compra y perfume.origen_compra null; enum acierto y perfume.acierto null. Un decant y un frasco de la misma ficha son dos filas de perfume con la misma ficha_id (no hay unique user_id+ficha_id; miFrascoDeFicha, consultas.ts:620, ya hace order by creado_en limit 1). PerfumeCandidato gana formato; detectarHuecos (src/dominio/huecos.ts) añade `soloMuestras` en la misma pasada que `frageles`; compararPreferencia (src/dominio/viaje.ts:63) desempata por formato; motivoDeRecomendacion lo etiqueta. Veredicto con BloquePromedios + detectarSolapamiento (src/dominio/solapamiento.ts:54) + crearDeseo. Formulario en seccionInventario (FormularioPerfume.tsx:701), filtro en src/app/coleccion/Filtros.tsx y listarColeccion. buscarEnColeccion y usadosRecientemente enseñan el formato. CSV, hoja Excel, copia v3 y exportación para IA.

**Depende de:** Frasco vivo: nivel estimado, ritmo de consumo, coste por uso y despedida; Desear sin teclear: compartir a la wishlist, deseo enlazado a su ficha y conversión que cierra el deseo.

**Riesgos.** «Ya lo tienes» del alta debe permitir un segundo frasco de otra forma. Dos frascos de la misma ficha deben distinguirse en el buscador de Hoy o se registra el equivocado.

#### Alta rápida y sin pérdidas: «marca los que tienes», lote por lista, contextos propuestos y borrador

*alta y datos · impacto 3/5 · esfuerzo M*

**Problema.** Una cuenta nueva de un amigo empieza vacía y sin guía (TRV-3, HOY-12) aunque el grupo ya ha dado de alta fichas completas; las alternativas son 30 altas de 8 pasos o un CSV estricto. Los contextos son lo único que falta incluso con una ficha del catálogo, y sin clave de Claude se marcan siempre a mano. El alta vive solo en estado de React: un fallo de red o tocar la barra inferior pierde todo (ALTA-2, ALTA-5).

**Propuesta.** Con la colección vacía, Hoy muestra «Empieza tu colección»: un buscador del catálogo común con casillas («Marca los que tienes») que crea los frascos en bloque, con las estaciones y momentos de la ficha como punto de partida visible y editable. «Pega tu lista» (una línea por perfume) se resuelve contra el catálogo con la misma previsualización que el CSV. Los contextos se proponen sin IA a partir de tu propia colección («tus amaderados con oud los usas en Cita y Elegante») o se eligen para todo el lote. El alta guarda borrador («Tienes un alta a medias de Fakhar Black · Continuar / Descartar») y, sin red, se encola como los usos. En el paso 1, «Pegar enlace» lee el portapapeles, y el icono gana el atajo «Añadir perfume».

**Cómo se construye.** buscarEnCatalogo y fichaParaAlta (src/servicios/consultas.ts:577/:638), crearPerfume con fichaId (src/servicios/perfumes.ts:345); previsualización de src/app/mas/datos/PanelDatos.tsx e importarColeccion (src/servicios/datos.ts:355), con la regla 7 del README (al menos un contexto, estación y momento por fila). Propuesta de contextos: función pura nueva en src/dominio que puntúa contextos por cercanía de notas de fondo (notasComunes, src/dominio/solapamiento.ts:35) y familias, con los usos por contexto de esos perfumes. Borrador: almacén nuevo en la IndexedDB 'scentify' (patrón de src/cliente/cola-offline.ts) con ValoresPerfume (src/componentes/valores-perfume.ts). Alta offline: accionGuardarPerfume/crearPerfume aceptan un id generado en el cliente (idempotencia) y public/sw.js lo reenvía con sync. Portapapeles: esUrlDeFichaValida y datosDeUrlFragrantica (src/dominio/fragrantica.ts:653/:621). Sin cambios de esquema.

**Riesgos.** fichaParaAlta copia hoy en silencio las marcas del primer frasco: deben verse marcadas y editables. Un alta offline puede crear una ficha que otro dio de alta mientras tanto: resolverFicha ya engancha a la existente por clave. Para el dueño, con la colección ya cargada, el valor es menor que para los amigos.

#### Tu nariz: notas navegables, parecidos en tu colección, notas que mejor valoras e «inspirado en»

*insights / analisis · impacto 3/5 · esfuerzo M*

**Problema.** En colecciones de perfumería árabe abundan los parecidos y los clones, pero no se puede saber qué más tienes con oud o vainilla (el filtro por nota está en el servicio pero no en la pantalla, COL-9) ni qué frascos son redundantes; el solapamiento solo se usa al desear. La app tiene valoraciones de frasco y de día pero nunca dice qué notas te gustan, y nada avisa antes de comprar algo con notas que sueles puntuar bajo.

**Propuesta.** Fase 1: cada nota y familia de la ficha enlaza a /coleccion?nota=…/?familia=…, y la ficha suma «Se parece a»: tus perfumes que comparten 3 o más notas de fondo («Khamrah — vainilla, haba tonka, benjuí»). Fase 2: «Tu nariz» en Estadísticas, las 5 notas y familias que mejor y peor valoras frente a tu media, siempre con el número de frascos y valoraciones detrás (mínimo 3 frascos o 5 valoraciones); en la wishlist y en el alta, una línea informativa: «Lleva oud y cedro, que puntúas por debajo de tu media (5 y 3 frascos)». Fase 3: «Inspirado en / se compara con» en la ficha común, con candidatos leídos del bloque «también les gusta» de la página de Fragrantica que compartes (nunca afirmado por un LLM ni guardado sin confirmar) y avisos «Ya tienes CDNIM, inspirado en Aventus». Fase 4 opcional con IA: 3-5 frases que explican tu perfil citando solo números de la tabla.

**Cómo se construye.** FiltrosColeccion.notaId y su EXISTS en listarColeccion (src/servicios/consultas.ts:335/:349) ya existen: añadir el control a src/app/coleccion/Filtros.tsx y los enlaces en src/app/coleccion/[id]/page.tsx. «Se parece a»: notasComunes/detectarSolapamiento y MINIMO_NOTAS_COMUNES (src/dominio/solapamiento.ts) sobre ficha_nota FONDO, con la consulta de solapamientoConLaColeccion (src/servicios/wishlist.ts:135) como modelo (excluyendo LO_TUVE, SOL-1). Fase 2: función pura nueva src/dominio/afinidad.ts con tests; consulta tipo porNota de calcularEstadisticas (src/servicios/estadisticas.ts:84) con avg(valoracion_dia), avg(perfume.valoracion) y count; aviso en FormularioDeseo.tsx junto a accionComprobarSolapamiento (acciones.ts:418) y en la revisión del alta. Fase 3: migración tabla ficha_referencia(id, ficha_id FK cascade, original_nombre, original_marca, original_busqueda_normalizada, original_ficha_id null FK set null, propuesta_por null, creado_en) con índice por original_busqueda_normalizada; FichaFragrantica gana `similares` sin persistir (el fixture tests/fixtures/fragrantica-pegado-ruidoso.txt contiene el bloque «también les gusta»). Fase 4: validador de números en src/dominio y caché en ajuste 'perfil_gusto'.

**Depende de:** Desear sin teclear: compartir a la wishlist, deseo enlazado a su ficha y conversión que cierra el deseo.

**Ajuste tras la revisión crítica.** Depende de sanear el vocabulario de notas: una ficha de fragrantica.com trae «Vanilla» y las semillas tienen «Vainilla», e «Incienso»/«Olíbano» son la misma nota. Sin un mapa de alias, «Se parece a» y la afinidad por nota fallan en silencio. Impacto 3 hasta tenerlo.

**Riesgos.** Con 20-40 perfumes las medias por nota tienen n muy bajo: enseñar siempre n y no concluir por debajo del mínimo. El solapamiento actual cuenta «Lo tuve» como «ya tienes» (SOL-1). «Inspirado en» es una afirmación sobre una ficha común: siempre confirmada por una persona.

#### Cumplidos: qué perfume te los da y dónde

*insights / analisis · impacto 3/5 · esfuerzo S*

**Problema.** Para muchos usuarios de perfumería árabe el criterio que cuenta es «¿me dicen algo cuando lo llevo?», y hoy solo cabe en el comentario libre, donde no se puede contar ni filtrar.

**Propuesta.** En el cierre del día (y en Completar detalles y en el día del calendario), un contador de un toque «Cumplidos: 0 · 1 · 2+»; nunca en el registro de la mañana. Ficha: «5 cumplidos en 11 puestas · casi todos en Cita». Estadísticas: «Los más elogiados» por tasa (cumplidos por uso, con un mínimo de 3 usos), con los filtros de contexto y momento que ya hay. En Sugerir, como dato y sin cambiar el orden: «te lo han elogiado 3 veces en Cita». El asistente y la exportación para IA lo reciben.

**Cómo se construye.** Migración: uso.cumplidos smallint null con check 0-20. Zod de accionCompletarUso (src/app/acciones.ts:199), de la acción de un solo campo del cierre y de /api/usos; completarUso (src/servicios/usos.ts:201) ya acepta campos sueltos. Consulta nueva en calcularEstadisticas con condicionesUso (src/servicios/estadisticas.ts), que hereda momento y contexto. Cumplidos por contexto en agregadosDeUso → PerfumeCandidato → motivoDeRecomendacion (src/dominio/recomendacion.ts). UsoAgregado de src/dominio/exportacion-ia.ts. exportarUsosCsv y copia v3.

**Depende de:** Cierre del día en Hoy: valoración y duración a un toque.

**Riesgos.** Dato escaso y subjetivo: normalizar por usos y mostrar n. No premiar al más usado. Si se piden en la mañana, rompen el registro de 10 s.

#### Rendimiento según el tiempo: duración, valoración y dosis por temperatura

*insights / analisis · impacto 3/5 · esfuerzo M*

**Problema.** En un clima costero húmedo la misma fragancia rinde distinto con 18° que con 30°, y se aplican muchos sprays. registrarUso tira la temperatura con la que decidió la estación, así que hoy no se puede saber «con calor me dura poco» ni ajustar la dosis; los sprays se prerrellenan con la media de siempre.

**Propuesta.** Fase 0, cuanto antes: cada uso guarda como snapshot la temperatura que decidió su estación y si hubo bochorno (los datos tardan meses en acumularse). Fase 1: en la ficha, «Con este tiempo»: duración más frecuente y valoración media por banda de tus umbrales (≥28, 24-28, 18-24…) y por tramo de sprays, solo con 3 o más registros y siempre con n («Con 24-28°: 2-4 h · 5 registros»). Estadísticas suma «Aguantan el calor». En Sugerir, una línea informativa «con 27° suele durarte poco», sin reordenar. Fase 2: el registro prerrellena los sprays con la mediana de ese perfume en condiciones parecidas cuando los datos lo sostienen; si no, la media de siempre.

**Cómo se construye.** calcularEstacionEfectiva ya devuelve temperaturaUsada y ajusteBochorno (ResultadoEstacionEfectiva, src/dominio/estacion.ts:114) y registrarUso (src/servicios/usos.ts:166) no los guarda. Migración: uso.temperatura_usada decimal(4,1) null y uso.bochorno boolean null (snapshot inmutable como idoneidad_pct); relleno opcional de usos antiguos desde clima_diario marcado como aproximado. Bandas desde leerConfiguracion().umbrales (src/servicios/ajustes.ts:55), así que se mueven con ellos. Función pura nueva src/dominio/rendimiento.ts con tests; consulta junto a promediosDePerfume (src/servicios/consultas.ts:179) y /api/perfumes/[id]/resumen, que ya alimenta el formulario de registro; FormularioRegistro prerrellena desde spraysHabituales; línea en src/app/recomendacion/Tarjetas.tsx. CSV de usos y copia v3.

**Depende de:** Cierre del día en Hoy: valoración y duración a un toque.

**Riesgos.** Sin cierre del día casi no hay duraciones. Los usos con estación por CALENDARIO (casi todos en la demo) no tienen temperatura. n bajo por banda: no concluir con menos de 3.

#### Amigos con consentimiento mutuo, privacidad por secciones e invitaciones personales

*social · impacto 3/5 · esfuerzo M*

**Problema.** La app ya admite cuentas de amigos y fichas comunes, pero «nadie ve los de nadie» y no existe la noción de amigo: no hay alias (solo el correo), ni consentimiento, ni forma de decidir qué se comparte. El registro depende de un único código global en una variable de entorno. Cualquier feature social sin este cimiento filtraría datos.

**Propuesta.** Un alias visible, que se pide al activar lo social; el correo no se enseña nunca. Cada cuenta tiene un enlace personal de amistad (token regenerable): quien lo abre ve el alias y pulsa «Aceptar», y la relación es mutua y cualquiera la rompe. Más → Amigos con la lista. En Configuración, «Qué ven tus amigos» con interruptores apagados por defecto: colección, opiniones (valoración, estaciones, momentos), wishlist, actividad agregada y «el asistente de mis amigos puede usar mis datos». «Invitar a alguien» genera un enlace de un solo uso que caduca a los 7 días, con tope por cuenta, y deja la amistad hecha al registrarse. Con todo apagado la app se comporta exactamente como ahora.

**Cómo se construye.** Migración: usuario.alias text unique null; tabla amistad(user_id, amigo_id, estado, creado_en) con PK (user_id, amigo_id), check user_id <> amigo_id y dos filas por relación; tabla invitacion(token_hash PK, creada_por, caduca_en, usada_por null, usada_en null, revocada bool). Privacidad en ajuste 'privacidad' (jsonb de booleanos) y 'codigo_amistad' (hash). Tokens con el patrón de codigoInvitacionValido (src/servicios/auth.ts:108: sha256 + timingSafeEqual); registrarUsuario (auth.ts:126) acepta ?inv= además del código global; destinoSeguro (src/dominio/navegacion.ts:14) para volver tras el login. Servicio nuevo src/servicios/amigos.ts con una única comprobación puedeVer(observador, dueño, seccion) y DTOs de lista blanca (nunca notasPersonales, fechaCompra, precio, comentarios ni usos día a día). Entrada en SECCIONES de src/app/mas/page.tsx e interruptores en src/app/mas/configuracion/page.tsx. Tests de integración ampliando el aislamiento de tests/integracion/registro.test.ts: sin amistad, con amistad y sección apagada, con sección encendida.

**Ajuste tras la revisión crítica.** Impacto 3: la spec define una app personal y el valor social depende de cuántos amigos la usen de verdad. Va después del centro de cuenta.

**Riesgos.** Fuga de datos entre cuentas: es el riesgo principal y exige tests de integración antes de enseñar nada. El driver HTTP de Neon no tiene transacciones: crear cuenta + amistad + siembra debe deshacerse a mano si falla (como ya hace registrarUsuario).

#### Lo que tiene el grupo: quién lo tiene, escaparate de un amigo y enlace de ficha

*social · impacto 3/5 · esfuerzo M*

**Problema.** Las fichas son comunes, pero no hay forma de pasarle a un amigo «este es el que te dije»: /coleccion/<id> le da un 404 en inglés (TRV-10). Antes de comprar a ciegas no sabes que Ana lo tiene y podría dejártelo oler, y no se puede curiosear la colección de un amigo.

**Propuesta.** Fase 1, sin amistad: botón «Compartir» en la ficha que genera /f/<fichaId>; quien lo abre (con cuenta) ve la ficha común —pirámide, familias, cuántos del grupo lo tienen— con «Lo tengo → a mi colección» (alta precargada) y «Lo quiero → a mi wishlist»; si ya lo tiene, va a su frasco. Fase 2, con amigos: en la wishlist y en «Ya está en Scentify» del alta, «Lo tiene Ana · Lo tuvo Luis» (solo amigos con la colección visible). Más → Amigos → Ana: su colección en solo lectura con «También lo tienes» y «En tu wishlist», y un «lo usa mucho / a veces / casi nunca» por terciles en vez de recuentos y fechas; «Añadir a mi wishlist» crea el deseo con su ficha y notas de fondo.

**Cómo se construye.** Ruta nueva src/app/f/[fichaId]/page.tsx con fichaParaAlta (src/servicios/consultas.ts:638), la subconsulta personas de buscarEnCatalogo (l.577) y miFrascoDeFicha (l.620); /coleccion/nuevo con ficha precargada; crearDeseo (src/servicios/wishlist.ts:29); navigator.share. Fase 2: listarColeccion (consultas.ts:349) reutilizada con un select de lista blanca coleccionVisible(observador, dueño, filtros) tras puedeVer; src/app/coleccion/Filtros.tsx y el marcado de src/app/coleccion/page.tsx; contextos cruzados por slug (los ids son por cuenta); la subconsulta personas pasa a alias de amigos con permiso. Opcional perfume.oculto_a_amigos boolean default false. Una página not-found propia en español.

**Depende de:** Amigos con consentimiento mutuo, privacidad por secciones e invitaciones personales; Desear sin teclear: compartir a la wishlist, deseo enlazado a su ficha y conversión que cierra el deseo.

**Ajuste tras la revisión crítica.** La fase 1 (/f/<fichaId>, enlace de ficha entre cuentas) no depende de la amistad y puede adelantarse.

**Riesgos.** La fase 2 depende de que el aislamiento esté probado. Revelar rutinas: terciles en vez de fechas. /f/ debe exigir sesión: las fichas son comunes al grupo, no públicas.

#### IA bajo control: privacidad, coste y tope por cuenta, y kit «pregúntale a cualquier IA» sin clave

*IA · impacto 3/5 · esfuerzo S*

**Problema.** La IA (asistente y sugerencia de contextos) usa una clave del dueño para todas las cuentas sin que nadie sepa qué se envía, cuánto cuesta ni con qué límite (IA-12). Sin clave, una de las cinco pestañas lleva a una pantalla muerta con instrucciones de despliegue (IA-3, TRV-7), y la exportación para IA está escondida en Datos como fichero (IA-8).

**Propuesta.** Más → Configuración → «Inteligencia artificial»: interruptor por cuenta (cada función tiene su camino manual), «Enviar mis notas personales y comentarios» sí/no, consumo del mes («23 consultas · ~0,41 $») y un tope diario por cuenta que fija el dueño, con mensaje claro al alcanzarlo. Una línea fija en cada entrada de IA: «Se envía a Claude (Anthropic). Scentify no guarda la conversación». Sin clave, /asistente ofrece plantillas («¿Qué notas me faltan?», «Plan para esta semana con el tiempo de El Campello», «¿Qué compro con 50 €?») con «Copiar» y «Compartir» que llevan la pregunta y el JSON de tu colección a la app de IA que uses.

**Cómo se construye.** Envoltorio nuevo llamarClaude(userId, tarea, …) en src/servicios/claude.ts, que ya centraliza MODELO, claudeDisponible y opcionesFallback: comprueba interruptor y tope y anota response.usage en ajuste 'ia_consumo:AAAA-MM'; interruptor y privacidad en ajuste 'ia'. Lo usan src/servicios/asistente.ts y src/servicios/sugerencia-contextos.ts. Filtrar notasPersonales y comentario en documentoParaIa (src/dominio/exportacion-ia.ts:146) y en la herramienta historial_de_usos (asistente.ts:79). Modelo por tarea con SCENTIFY_MODELO_EXTRACCION junto a SCENTIFY_ASISTENTE_MODELO. Kit: exportarColeccionIa (src/servicios/datos.ts:177) y /api/exportar/ia, con el patrón navigator.clipboard de src/app/mas/importador/InstalarBoton.tsx. Sin cambios de esquema.

**Ajuste tras la revisión crítica.** Partirla: el tope diario por cuenta y lanzar la sugerencia de contextos solo bajo demanda son S y van «ahora», porque la clave del dueño ya sirve sin límite a todas las cuentas invitadas. El consumo visible, la privacidad de notas y el kit sin clave quedan en «siguiente».

**Riesgos.** La tabla de precios en código envejece: rotular «aprox.». Contadores en ajuste con escrituras concurrentes (aceptable a esta escala).

### Después

#### Qué comprar: deseos que tapan huecos, huecos con salida y candidatos con búsqueda web

*frasco y dominio de coleccionista · impacto 3/5 · esfuerzo M*

**Problema.** Un hueco es hoy una etiqueta roja que no lleva a ninguna parte: el enlace a la wishlist pierde el parámetro (HUE-1) y muchos «huecos» son combinaciones que el usuario no vive (HUE-2). La wishlist no sabe qué aportaría cada deseo a la colección, solo su prioridad y antigüedad.

**Propuesta.** Al pulsar un hueco, una hoja con tres salidas: «Casi lo cubren» (enlaza con la recategorización), «Desear algo que lo cubra» (deseo con el hueco ya marcado) e «Ideas para cubrirlo». Los deseos pueden llevar las mismas casillas que un frasco (estaciones, momento, contextos), prerrellenadas desde el hueco o con «Marcar según Fragrantica». La app calcula «tapa 6 huecos, 2 frágiles» y la wishlist suma el orden «Lo que más aporta»; Huecos dice «Lo taparía Hawas Ice (de tu wishlist)» y se ordena por las combinaciones que de verdad vives. Con clave de Claude, «Ideas para cubrirlo» y «¿Me lo compro?» buscan en la web 3 candidatos fuera de tu colección con notas y fuentes; la cobertura y el solapamiento los calcula la app, y el precio encontrado va a notas con su fuente, nunca a precio_objetivo.

**Cómo se construye.** Migración: tablas wishlist_estacion, wishlist_momento y wishlist_contexto, como las de perfume. detectarHuecos(coleccion + [deseo como PerfumeCandidato]) y agruparPorContexto (src/dominio/huecos.ts:42/:83); leer ?hueco= en src/app/mas/wishlist/page.tsx y FormularioDeseo.tsx; masVotadas (src/dominio/votos.ts); solapamientoConLaColeccion (src/servicios/wishlist.ts:135); ponderación por uso real con contextoHabitual/usos por combinación. IA: patrón de src/servicios/sugerencia-contextos.ts (web_search_20260209, herramienta strict, reanudación de pause_turn) a través de llamarClaude, y accionGuardarDeseo (src/app/acciones.ts:393), que ya devuelve el aviso de solapamiento. Copia v3.

**Depende de:** Desear sin teclear: compartir a la wishlist, deseo enlazado a su ficha y conversión que cierra el deseo; Tu nariz: notas navegables, parecidos en tu colección, notas que mejor valoras e «inspirado en»; Recategorización con evidencia: lo que haces frente a lo que marcaste; IA bajo control: privacidad, coste y tope por cuenta, y kit «pregúntale a cualquier IA» sin clave.

**Ajuste tras la revisión crítica.** Depende también del saneo del vocabulario de notas.

**Riesgos.** Empuja a comprar más, justo lo contrario del «dinero parado»: enseñar siempre el solapamiento. Coste de las búsquedas web. Precios de la web envejecen: con fecha y fuente.

#### Ficha común viva: comparar con Fragrantica, historial de cambios y pirámide sugerida con procedencia

*alta y datos · impacto 3/5 · esfuerzo M*

**Problema.** Las fichas comunes envejecen o se crearon a mano sin pirámide, y «Volver a consultar Fragrantica» abre el paso 1 sin consultar nada (COL-4, ALTA-9). Editar una ficha la cambia para todo el grupo sin rastro de quién ni qué. Cuando Fragrantica bloquea y no se pega el texto, la ficha se queda sin notas.

**Propuesta.** «Comparar con Fragrantica» (lectura automática, texto pegado o botón) enseña el diff de pirámide, familias, año y concentración con casillas para aplicar cada cambio, avisando de que lo verán N personas. Cada edición de una ficha guarda quién, qué y el antes y el después: «Editada por Ana hace 2 días · ver cambios · Deshacer». Con clave de Claude y sin Fragrantica, la sugerencia de contextos devuelve además una pirámide «sugerida por IA (sin verificar)» con sus fuentes y [Usar estas notas]; la ficha guarda la procedencia y una lectura posterior de Fragrantica la sustituye. Nunca se generan votos de estación o momento.

**Cómo se construye.** leerFichaFragrantica (src/dominio/fragrantica.ts:584) y familiasDeAcordes (src/dominio/familias.ts:70). sincronizarFicha, completarFicha y sobrescribirFicha (src/servicios/perfumes.ts:152/:191/:249) son el único punto que escribe fichas: ahí se registra el cambio, y leerPiramideYFamilias (l.222) da el «antes». Migración: tabla ficha_cambio(id, ficha_id FK cascade, user_id null FK set null, antes jsonb, despues jsonb, creado_en), recortada a los 20 últimos por ficha (Neon free 0,5 GB); ficha.origen_piramide enum (FRAGRANTICA, MANUAL, IA_SUGERIDA) null; completarFicha deja que una pirámide de Fragrantica pise una IA_SUGERIDA. IA: esquemaPropuesta/interpretarPropuesta (src/dominio/sugerencia-contextos.ts:99/:137) ganan piramide_sugerida y acordes en la misma llamada con web_search de src/servicios/sugerencia-contextos.ts; aplicarFicha() de FormularioPerfume.tsx (l.280) ya aplica notas como sugerencia. compartidaCon (fichaDePerfume) para el aviso, que ya existe en FormularioPerfume.tsx (l.896). El enlace de la ficha deja de mandar ?fragrantica=1 a un editor que no lo lee.

**Depende de:** Amigos con consentimiento mutuo, privacidad por secciones e invitaciones personales; IA bajo control: privacidad, coste y tope por cuenta, y kit «pregúntale a cualquier IA» sin clave.

**Riesgos.** Guerras de edición entre amigos (por eso el historial y Deshacer). La IA puede inventar notas: siempre etiquetada, confirmada y sustituible (spec 5.2 lo permite solo así). Sin alias, «editada por otra persona».

#### Tu año (y tu mes) en perfumes

*insights / analisis · impacto 3/5 · esfuerzo M*

**Problema.** Las estadísticas son números que hay que interpretar y no hay ningún momento que celebre lo registrado ni algo que enseñar al grupo de amigos; el esfuerzo diario de apuntar no tiene recompensa visible.

**Propuesta.** /mas/tu-ano: tarjetas verticales que se pasan con el dedo, abiertas todo el año como «lo que llevas» y destacadas en diciembre: el perfume del año, el mes con más registros, la nota y la familia del año, el descubrimiento, el olvidado, la estación dominante, la tasa de acierto, la racha más larga y los sprays totales con su equivalente en ml. Todo sale de la base; una tarjeta sin datos se esconde y si el año está incompleto lo dice («de febrero a hoy»). «Compartir» genera un PNG para el grupo. Opcional con clave: «Tu mes en perfumes», 5-6 frases que narran los números del mes sin poder citar otros, con 1-2 olvidados y «Me lo pongo».

**Cómo se construye.** calcularEstadisticas con el periodo 'anio-en-curso' (src/servicios/estadisticas.ts:84) ya da ranking, sinUsar, porNota, porFamilia, porEstacion, heatmap, promedios y comparativa con periodoAnterior (src/dominio/estadisticas.ts:63). Función pura nueva resumenAnual() en src/dominio con tests. Imagen con ImageResponse de next/og (presente en node_modules/next/og.js, Next 15.5) en una ruta /api/tu-ano/imagen, excluida de la caché del service worker. Entrada en SECCIONES de src/app/mas/page.tsx y enlace en src/app/estadisticas/page.tsx. Mes narrado: llamarClaude/MODELO/opcionesFallback (src/servicios/claude.ts) y caché en ajuste 'resumen_mes:AAAA-MM'. Sin cambios de esquema.

**Depende de:** Tu semana a la vista: tira de 7 días en Hoy, racha con gracia y calendario por perfume; IA bajo control: privacidad, coste y tope por cuenta, y kit «pregúntale a cualquier IA» sin clave.

**Riesgos.** La fuente Fraunces hay que cargarla a mano en ImageResponse. Lo que se comparte puede revelar rutinas: el usuario elige qué tarjetas. Narración con IA que invente cifras: validador obligatorio.

#### La opinión del grupo: agregados en la ficha, «marcar como el grupo», afinidad y huecos que el grupo cubre

*social · impacto 3/5 · esfuerzo M*

**Problema.** Al dar de alta desde una ficha común se copian en silencio las estaciones y momentos del primero que la creó (fichaParaAlta ordena por creado_en y toma el primero). Con varias personas usando el mismo perfume, nadie aprovecha cómo lo llevan los demás, y los huecos se resuelven siempre comprando.

**Propuesta.** En la ficha, un bloque «En el grupo»: «4 lo tienen · valoración media 4,2 · suele durar más de 8 h · 7 sprays · lo marcan para Otoño-Invierno, Noche», solo con cuentas que comparten opiniones y sin medias por debajo de 3 personas. En la revisión del alta, «Marcar como el grupo» propone la mayoría, en vez de copiar al primero. En el perfil de un amigo, «Afinidad 72 %» con su explicación y vuestros desacuerdos. Bajo cada hueco, «En el grupo lo cubren: Hawas Ice (Ana, 5/5)» con «A mi wishlist» y «Pedir para probar». Una tarjeta «Esta semana en el grupo» en Más → Amigos con estrenos y lo más llevado de forma agregada, nunca «Ana se puso X el martes»; sin push ni feed.

**Cómo se construye.** promediosDePerfume y agregadosDeUso (src/servicios/consultas.ts:179/:38) generalizados a una ficha_id y un conjunto de usuarios con permiso (índice idx_perfume_ficha ya existe); masVotadas y PROPORCION_DE_LA_PRIMERA (src/dominio/votos.ts) para la mayoría; fichaParaAlta (consultas.ts:638) deja de copiar al primero; BloquePromedios para pintarlo. Afinidad: función pura nueva src/dominio/afinidad.ts (coseno de vectores de familias y notas de fondo ponderados por usos). Huecos: candidatosParaRecomendar del amigo por la lista blanca y calcularIdoneidad con contextos por slug, en src/app/mas/huecos/page.tsx. Semana: rangoDePeriodo (src/dominio/estadisticas.ts:36) y el ranking de calcularEstadisticas generalizado a varios usuarios. Sin cambios de esquema.

**Depende de:** Amigos con consentimiento mutuo, privacidad por secciones e invitaciones personales; Lo que tiene el grupo: quién lo tiene, escaparate de un amigo y enlace de ficha.

**Riesgos.** k-anonimato en grupos de 3-5: un agregado de dos personas revela a la otra; umbral mínimo 3. Opiniones del grupo como propuesta, nunca sustituyendo las marcas propias (son del frasco, no de la ficha).

#### Intercambio entre amigos: pedir para probar, préstamos y wishlist de regalos

*social · impacto 3/5 · esfuerzo L*

**Problema.** Probar antes de comprar entre amigos (un decant, un préstamo) y no repetir regalos se resuelve hoy fuera de la app, y lo que se prueba no queda registrado en la colección de quien lo recibe.

**Propuesta.** Desde «quién lo tiene» o el escaparate: «Pedir un decant (2, 5 o 10 ml)» o «Pedir el frasco prestado», con nota opcional. El dueño acepta o rechaza en Más → Amigos → Préstamos (push al momento si tiene avisos). Al marcarlo «Entregado», a quien lo recibe se le crea un frasco propio sobre la misma ficha (formato Decant, «decant de Ana») que registra en 10 s como cualquiera; «Devuelto» o «Gastado» lo pasa a Lo tuve y el historial se conserva. Wishlist visible para amigos (opcional, deseo a deseo; el precio solo si se permite): «Lo regalo yo» la reserva en secreto para el resto y el dueño nunca lo ve; día de cumpleaños DD-MM y, 7 días antes, un aviso a los amigos con avisos activos.

**Cómo se construye.** Migración: tabla prestamo(id, perfume_id del dueño, dueno_id, receptor_id, tipo DECANT|FRASCO, ml null, estado PEDIDO|ACEPTADO|RECHAZADO|ENTREGADO|DEVUELTO, nota, perfume_receptor_id null, creado_en, actualizado_en); tabla reserva_regalo(wishlist_id PK, user_id, creado_en); wishlist.oculto_a_amigos boolean; ajuste 'cumpleanos'; tabla aviso_cumple_enviado(user_id, amigo_id, anio). crearPerfume con fichaId y cambiarEstado (src/servicios/perfumes.ts:345/:425); webpush y push_suscripcion (src/servicios/recordatorio.ts) para el aviso inmediato desde la Server Action, sin cron; el cumpleaños entra en la pasada diaria existente de /api/cron/recordatorio. Las acciones siguen el patrón exigirUsuario + propiedad + puedeVer de src/app/acciones.ts. marcarConvertido (src/servicios/wishlist.ts:66) cierra las reservas.

**Depende de:** Amigos con consentimiento mutuo, privacidad por secciones e invitaciones personales; Lo que tiene el grupo: quién lo tiene, escaparate de un amigo y enlace de ficha; Probar antes de comprar: decants y muestras con veredicto, y acierto de las compras a ciegas; Desear sin teclear: compartir a la wishlist, deseo enlazado a su ficha y conversión que cierra el deseo.

**Riesgos.** Flujos de dos personas con muchos estados (por eso L). La reserva secreta exige un test que fije que la consulta de la propia wishlist no lee reservas. Más avisos push: deben seguir siendo raros.

#### Registrar y cerrar el día con una frase: intérprete determinista, Claude cuando no basta, y Siri/Atajos

*IA · impacto 3/5 · esfuerzo M*

**Problema.** Cuando el perfume no está entre los chips, registrar exige buscar, elegir y pulsar; desde Siri, un atajo o una pegatina NFC en iOS no hay forma de apuntar nada. Completar valoración y duración por la noche cuesta varios toques por uso.

**Propuesta.** Fase 1, sin IA: un intérprete determinista entiende «Khamrah, seis sprays, cita, ayer» (nombre de tu colección, número, contexto, «noche», «ayer») cuando la búsqueda de Hoy no encuentra nada, y enseña la tarjeta con idoneidad y [Registrar] / [Ajustar]. El mismo intérprete atiende Atajos de iOS, HTTP Shortcuts o una automatización NFC con un token personal: «Oye Siri, Scentify» → dictado → respuesta que Siri lee («Apuntado Khamrah · Noche · Cita. Encaja del todo»); si duda entre dos, devuelve las opciones. Fase 2, con clave: si el intérprete no basta («ayer me puse Khamrah, 6 sprays, cena con amigos, aguantó todo el día»), Claude extrae con salida estructurada usando enums de tus ids y contextos y solo rellena lo que la frase dice; en el cierre del día, «Cuéntamelo» rellena valoración, duración y un comentario literal por uso.

**Cómo se construye.** Función pura nueva src/dominio/interprete-frase.ts con tests, sobre normalizar y claveBusqueda (src/dominio/texto.ts) y desplazarDias. src/componentes/FormularioRegistro.tsx: el efecto de búsqueda contra /api/buscar, hoySegunElMovil (l.68), encolarUso (src/cliente/cola-offline.ts:118) y el aviso flotante. Servidor: registrarUso y previsualizarIdoneidad (src/servicios/usos.ts:166/:105), listarContextos, contextoHabitual. Ruta nueva POST /api/atajo; migración: tabla token_personal(id, user_id, nombre, hash sha256, creado_en, ultimo_uso_en, revocado_en), enseñado una sola vez y revocable en Configuración; pantalla de instrucciones con el patrón de src/app/mas/importador/InstalarBoton.tsx. Fase 2: patrón strict de src/servicios/sugerencia-contextos.ts vía llamarClaude; completarUso para el cierre.

**Depende de:** Cierre del día en Hoy: valoración y duración a un toque; Registrar de un toque desde fuera de Hoy: enlaces con parámetro, atajos del icono, NFC y botón en la ficha; IA bajo control: privacidad, coste y tope por cuenta, y kit «pregúntale a cualquier IA» sin clave.

**Riesgos.** Un token de API amplía la superficie de ataque: solo crea usos, con límite y revocable. Dictado ambiguo: confirmación salvo en el atajo explícito. No debe tocar el camino de un toque: solo aparece cuando la búsqueda falla.

#### Alta por foto del frasco o de la caja

*IA · impacto 3/5 · esfuerzo M*

**Problema.** Dar de alta exige teclear nombre y marca, y en perfumería árabe las etiquetas mezclan árabe y nombres parecidos entre clones; para un amigo que empieza con 30 frascos es la mayor fricción.

**Propuesta.** En el paso 1 del alta, «Hacer foto al frasco»: la imagen se reduce en el navegador (≤1568 px, ~300 KB) y Claude devuelve solo lo que pone la etiqueta —texto leído (también en árabe), marca, nombre, concentración, ml y confianza—, nunca notas ni estaciones. La app busca en el catálogo común: «¿Es este? Khamrah · Lattafa · EDP · lo tienen 2 personas [Usar esta ficha]»; si no está, prerrellena nombre, marca, concentración y ml y salta al paso de Fragrantica. La foto no se guarda. Fase posterior: foto de la estantería → lista de frascos detectados con casillas → alta en lote.

**Cómo se construye.** Ruta nueva /api/foto-perfume (la imagen llega reducida, por debajo del límite de 4,5 MB de cuerpo de Vercel) con salida estructurada siguiendo el patrón strict de src/servicios/sugerencia-contextos.ts, a través de llamarClaude. src/componentes/FormularioPerfume.tsx ya tiene el efecto que consulta /api/catalogo?q= al escribir, usarFicha(id) (l.260), conFicha() (l.1007) y el modo 'revision'; la foto solo rellena nombre, marca, concentración y volumen. buscarEnCatalogo y fichaParaAlta (src/servicios/consultas.ts). Sin cambios de esquema (el lote puede vivir en sessionStorage).

**Depende de:** IA bajo control: privacidad, coste y tope por cuenta, y kit «pregúntale a cualquier IA» sin clave; Alta rápida y sin pérdidas: «marca los que tienes», lote por lista, contextos propuestos y borrador.

**Riesgos.** Clones con nombres casi iguales: siempre confirmación. Coste por foto. No contradice el descarte del README (aquello era leer recuentos de votos por OCR; esto identifica una etiqueta).

### Descartadas y por qué

- **Aviso matinal a la hora que elija cada usuario.** Exige más de una pasada al día o un cron por usuario: Vercel Hobby solo admite crons diarios y el README ya limita el recordatorio a las 21:00 por esto. Lo útil (adelantar la sugerencia de mañana) cabe en el único aviso nocturno; un segundo cron diario a hora fija queda como opción posterior, nunca a la hora elegida.
- **Penalizar en el orden lo descartado con «Otro».** Altera en silencio el orden de la spec 7.2 (días sin usar). Los descartes se aprovechan como evidencia en la recategorización, que siempre confirma el usuario.
- **Bajar en el orden lo reservado para un plan.** Mismo motivo: cambia el orden de 7.2 sin que el usuario lo vea. Se señala («Lo guardas para el viernes») sin reordenar.
- **Aplicar solas las marcas que «aprende» la app (recategorización automática).** Contradice la regla de la spec de que las estaciones, momentos y contextos los marca el usuario. Las propuestas solo se aplican con un toque de confirmación.
- **Perfume del día del grupo con reacciones.** Es un feed social de actividad diaria: choca con la promesa del README («nadie ve los de nadie») y con el principio «sin feed» de las ideas sociales; impacto bajo para el uso real. Lo aprovechable («quién más lo tiene») está en «Lo que tiene el grupo».
- **Precios vistos y ofertas aportados por el grupo, con push de ofertas.** Impacto bajo para 4-5 personas, convierte la wishlist en comparador de precios (la spec define precio_objetivo como tu máximo, no un dato de mercado) y añade avisos push extra. No se leen páginas de tiendas, pero tampoco compensa mantener precios a mano.
- **Rellenar precio_objetivo con el precio que encuentre la IA.** Contradice la spec: precio_objetivo es el máximo que tú pagarías, no una estimación. El precio encontrado va a notas con su fuente.
- **Generar con un LLM los votos o las estaciones/momentos de una ficha sin Fragrantica.** Prohibido por la spec 5.2 (los votos son datos concretos que un modelo se inventaría). Solo la pirámide puede sugerirse, marcada y confirmada.
- **Excluir de la recomendación los frascos casi vacíos o las muestras.** Sería un filtro duro nuevo que la spec 7.2 no contempla; el nivel estimado es una aproximación. Se avisa («queda poco») sin excluir.
- **Tercer estado «Para vender» en estado_perfume.** La spec 4.2 fija dos estados con test de regla dura; LO_TENGO/LO_TUVE se usan en muchas consultas. «Apartar» reutiliza archivar, que ya saca de recomendaciones y conserva estadísticas.
- **Estado de frasco «por completar» en el alta en lote.** Contradice la decisión 7 del README (la importación exige al menos un contexto, estación y momento porque el motor no sabe tratar un perfume a medias). Se resuelve proponiendo contextos sin IA.
- **Lote, fecha de apertura, maceración por lote y proyección en el cierre.** Añade campos al cierre nocturno (más fricción justo donde ya cuesta rellenar) y con colecciones de 20-40 frascos no hay datos para concluir nada por lote.
- **Conversaciones del asistente guardadas en base de datos.** Guarda en Neon (0,5 GB) lo que se envió a un tercero, con poco valor frente a mantener la conversación en sessionStorage mientras se navega.
- **Push extra: «Tienes 3 frascos dormidos», ofertas y resumen semanal del grupo.** Rompen el principio de un solo aviso al día que sostiene el recordatorio; esos datos se enseñan al abrir la pantalla correspondiente.
- **Lista preparada para 150: agrupación por marca, índice A-Z y modo compacto.** Es el arreglo de los hallazgos COL-13 y COL-14, no una feature nueva: va al backlog de UX.
- **Tema claro automático y modo alto contraste.** Es la solución del hallazgo TRV-9 (contraste y controles nativos en claro): backlog de UX, no catálogo de features.
