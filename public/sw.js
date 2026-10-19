/*
 * Service worker de Scentify (seccion 11).
 *
 * Tres trabajos, y ninguno mas:
 *
 *  1. Dejar la app instalable y arrancable sin conexion: el armazon y los
 *     estaticos se sirven de cache.
 *  2. Cachear las lecturas de la coleccion para poder abrirla en el metro.
 *  3. Reenviar la cola de registros de usos cuando vuelve la cobertura.
 *  4. Enseñar el recordatorio diario que manda el servidor (seccion 10.4).
 *
 * Lo que NO hace: cachear la consulta a Fragrantica ni la de idoneidad. La
 * primera no tiene sentido sin red y la segunda debe fallar limpiamente para
 * que el formulario diga que no ha podido calcularla.
 */

/**
 * Subir esta version es obligatorio al cambiar cualquier fichero del ARMAZON
 * que no lleve hash en el nombre: los iconos y el manifest se sirven cache
 * primero, asi que sin esto un navegador que ya tenga la app instalada seguiria
 * enseniando los de la version anterior para siempre. Cambiarla hace dos cosas
 * a la vez: el navegador detecta un sw.js distinto y vuelve a instalar, y
 * `activate` borra las caches cuya clave no acabe en este valor.
 *
 * v2: interfaz monocroma. Cambian icono.svg, los PNG y los colores del manifest.
 * v3: el manifest incorpora share_target para «Compartir → Scentify».
 * v4: el share_target pasa a POST para admitir el texto de la pagina.
 * v5: paleta calida con acento ambar. Cambian icono.svg, los PNG y los colores
 *     del manifest.
 * v6: la cola conserva los usos sin sesion, el cierre de sesion borra las
 *     paginas y datos guardados, y la copia de seguridad ya no se cachea.
 * v7: sin red, una pantalla no guardada da /sin-conexion (antes se servia Hoy
 *     en cualquier URL); /sin-conexion sobrevive al cierre de sesion; no se
 *     guardan las redirecciones al login; las navegaciones esperan a la red
 *     como mucho unos segundos si hay copia; y el armazon se vuelve a guardar
 *     ya con sesion.
 * v9: el alta con parametros (?url=, ?ficha=, ?deseo=) va siempre a la red y
 *     no se guarda: una copia de un despliegue anterior volvia a leer la ficha
 *     con el codigo viejo.
 */
const VERSION = 'v9';
const CACHE_ARMAZON = `scentify-armazon-${VERSION}`;
const CACHE_DATOS = `scentify-datos-${VERSION}`;
const ETIQUETA_SYNC = 'sincronizar-usos';

const BD = 'scentify';
const ALMACEN = 'usos-pendientes';

/** Lo minimo para que la app arranque estando sin conexion. */
const ARMAZON = ['/', '/coleccion', '/recomendacion', '/sin-conexion', '/manifest.webmanifest', '/icono.svg'];

/** Lo que no lleva datos de nadie y se conserva al cerrar sesion. */
const SIN_DATOS = ['/sin-conexion', '/manifest.webmanifest'];

/**
 * Con copia guardada, una navegacion no espera a la red mas que esto: en el
 * portal, con una raya de cobertura, la PWA se quedaba en blanco hasta que el
 * navegador abandonaba la peticion.
 */
const ESPERA_NAVEGACION_MS = 3500;

/**
 * Una respuesta que se puede guardar: correcta y sin redirecciones. La
 * primera visita es al login, sin sesion, y '/' redirige alli: guardar esa
 * respuesta dejaba el login en la cache como si fuera Hoy.
 */
const guardable = (respuesta) => respuesta.ok && !respuesta.redirected && respuesta.type === 'basic';

/** Guarda el armazon una URL a una (addAll falla entero si falla una sola). */
async function precachearArmazon() {
  const cache = await caches.open(CACHE_ARMAZON);
  await Promise.allSettled(
    ARMAZON.map(async (url) => {
      const respuesta = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
      if (guardable(respuesta)) await cache.put(url, respuesta);
    }),
  );
}

self.addEventListener('install', (evento) => {
  evento.waitUntil(precachearArmazon().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) =>
        Promise.all(
          claves
            .filter((c) => c.startsWith('scentify-') && !c.endsWith(VERSION))
            .map((c) => caches.delete(c)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/* ------------------------------------------------------------- estrategias */

/**
 * La pagina de reserva cuando no hay red ni copia de lo pedido. Nunca otra
 * pantalla: servir Hoy al pedir la coleccion era enseñar algo equivocado sin
 * decirlo. Si tampoco esta guardada, una minima escrita aqui.
 */
async function paginaSinConexion() {
  const guardada = await caches.match('/sin-conexion');
  if (guardada) return guardada;
  return new Response(
    '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Sin conexión · Scentify</title><body style="background:#14110e;color:#f3ece3;font-family:system-ui,sans-serif;padding:4rem 1.5rem;text-align:center">' +
      '<h1>Sin conexión</h1><p>Esta pantalla no estaba guardada en el móvil. Vuelve a intentarlo con cobertura.</p>' +
      '<p><a href="/" style="color:#d6a45e">Volver a Hoy</a></p></body></html>',
    { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}

/** Red primero, cache como red de seguridad. Para HTML y lecturas de datos. */
async function redPrimero(peticion, nombreCache, esperaMaxima) {
  const cache = await caches.open(nombreCache);
  // Hoy con parametros (?toque=ayer, ?cierre=1, los atajos del icono) es la
  // misma pantalla: sin red se sirve la copia de Hoy. Y no se guarda aparte,
  // para que una copia vieja no vuelva a pedir el mismo toque.
  const url = new URL(peticion.url);
  const hoyConParametros =
    peticion.mode === 'navigate' && url.pathname === '/' && url.search !== '';
  const guardada = await cache.match(peticion, { ignoreSearch: hoyConParametros });

  const desdeRed = fetch(peticion).then((respuesta) => {
    if (guardable(respuesta) && !hoyConParametros) cache.put(peticion, respuesta.clone());
    return respuesta;
  });
  // Si gana la espera y luego la red falla, que no quede un rechazo suelto.
  desdeRed.catch(() => undefined);

  try {
    // Solo se corta la espera si hay algo que enseñar en su lugar. La
    // peticion sigue y, si llega, deja la copia al dia para la proxima vez.
    if (guardada && esperaMaxima) {
      const tarde = new Promise((resolver) => setTimeout(() => resolver(null), esperaMaxima));
      return (await Promise.race([desdeRed, tarde])) ?? guardada;
    }
    return await desdeRed;
  } catch (error) {
    if (guardada) return guardada;
    if (peticion.mode === 'navigate') return paginaSinConexion();
    throw error;
  }
}

/** Cache primero. Para los estaticos con hash, que nunca cambian. */
async function cachePrimero(peticion) {
  const guardada = await caches.match(peticion);
  if (guardada) return guardada;
  const respuesta = await fetch(peticion);
  if (respuesta.ok) (await caches.open(CACHE_ARMAZON)).put(peticion, respuesta.clone());
  return respuesta;
}

self.addEventListener('fetch', (evento) => {
  const { request } = evento;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Estos dos tienen que fallar de verdad cuando no hay red, no dar una
  // respuesta vieja que confunda. Las exportaciones, incluida la copia
  // completa, no se guardan: son la cuenta entera en un fichero.
  if (
    url.pathname.startsWith('/api/fragrantica') ||
    url.pathname.startsWith('/api/idoneidad') ||
    url.pathname.startsWith('/api/exportar')
  ) {
    return;
  }

  if (url.pathname.startsWith('/_next/static/') || url.pathname === '/icono.svg') {
    evento.respondWith(cachePrimero(request));
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    evento.respondWith(redPrimero(request, CACHE_DATOS));
    return;
  }

  // El alta con lo que llega de Fragrantica es de un solo uso: lo que trae
  // depende del catalogo de ese momento, y una copia vieja lo enseñaria mal.
  if (request.mode === 'navigate' && url.pathname === '/coleccion/nuevo' && url.search !== '') {
    evento.respondWith(fetch(request).catch(() => paginaSinConexion()));
    return;
  }

  if (request.mode === 'navigate') {
    evento.respondWith(redPrimero(request, CACHE_ARMAZON, ESPERA_NAVEGACION_MS));
  }
});

/* ------------------------------------------------- cola de usos pendientes */

function abrirBd() {
  return new Promise((resolver, rechazar) => {
    const peticion = indexedDB.open(BD, 1);
    peticion.onupgradeneeded = () => {
      const bd = peticion.result;
      if (!bd.objectStoreNames.contains(ALMACEN)) bd.createObjectStore(ALMACEN, { keyPath: 'id' });
    };
    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => rechazar(peticion.error);
  });
}

function operar(modo, operacion) {
  return abrirBd().then(
    (bd) =>
      new Promise((resolver, rechazar) => {
        const tx = bd.transaction(ALMACEN, modo);
        const peticion = operacion(tx.objectStore(ALMACEN));
        peticion.onsuccess = () => resolver(peticion.result);
        peticion.onerror = () => rechazar(peticion.error);
        tx.oncomplete = () => bd.close();
      }),
  );
}

/**
 * Reenvia lo pendiente. El id del uso lo genero el cliente, asi que reenviar
 * dos veces el mismo registro no duplica nada en el servidor.
 */
async function vaciarCola() {
  const pendientes = await operar('readonly', (almacen) => almacen.getAll());

  for (const uso of pendientes) {
    let respuesta;
    try {
      respuesta = await fetch('/api/usos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(uso),
      });
    } catch (error) {
      // Sigue sin haber red: se reintenta en el proximo sync.
      throw error;
    }
    // Sin sesion (caducada o cerrada) no se tira nada: se para aqui y se le
    // pide a la pagina que diga que hay que volver a entrar.
    if (respuesta.status === 401) {
      const clientes = await self.clients.matchAll({ type: 'window' });
      for (const cliente of clientes) cliente.postMessage({ tipo: 'sesion-caducada' });
      return;
    }
    // El resto de 4xx no se arregla reintentando: se saca de la cola para no
    // quedarse atascado en un registro roto para siempre.
    if (respuesta.ok || (respuesta.status >= 400 && respuesta.status < 500)) {
      await operar('readwrite', (almacen) => almacen.delete(uso.id));
    }
  }

  const clientes = await self.clients.matchAll({ type: 'window' });
  for (const cliente of clientes) cliente.postMessage({ tipo: 'usos-sincronizados' });
}

self.addEventListener('sync', (evento) => {
  if (evento.tag === ETIQUETA_SYNC) evento.waitUntil(vaciarCola());
});

/**
 * Al llegar al login (tras cerrar sesion o con la sesion caducada) se borra
 * lo que lleva datos de la cuenta: las paginas guardadas y las lecturas de la
 * API. Las caches van por URL, no por usuario, y en un movil compartido la
 * siguiente persona veria sin conexion la coleccion de la anterior. Los
 * estaticos se quedan. La cola de usos pendientes, tambien: es lo que aun no
 * ha llegado al servidor.
 */
async function olvidarDatos() {
  await caches.delete(CACHE_DATOS);
  const armazon = await caches.open(CACHE_ARMAZON);
  for (const peticion of await armazon.keys()) {
    const ruta = new URL(peticion.url).pathname;
    if (!ruta.startsWith('/_next/static/') && !ruta.startsWith('/icono') && !SIN_DATOS.includes(ruta)) {
      await armazon.delete(peticion);
    }
  }
}

self.addEventListener('message', (evento) => {
  // Sin Background Sync (Safari, por ejemplo) la pagina pide el vaciado a mano.
  if (evento.data?.tipo === 'vaciar-cola') evento.waitUntil(vaciarCola());
  if (evento.data?.tipo === 'olvidar-datos') evento.waitUntil(olvidarDatos());
  // Ya con sesion: la instalacion se hizo en el login y no pudo guardar las
  // pantallas de la cuenta. Se guardan ahora para poder abrirlas sin red.
  if (evento.data?.tipo === 'precachear') evento.waitUntil(precachearArmazon());
});

/* ------------------------------------------- recordatorio diario (10.4) */

/*
 * El aviso de la noche trae botones que actuan sin abrir la app: registrar el
 * dia («Repetir: Asad») o completar la duracion («4-6 h»). Cada accion lleva
 * ya el uso decidido por el servidor. Si no hay red o la sesion ha caducado,
 * el uso va a la misma cola que la app y sale al volver a abrirla.
 *
 * Donde las notificaciones no tienen botones (iPhone), tocar el aviso abre la
 * app en el toque equivalente (`urlSinAcciones`), con su Deshacer.
 */

const ETIQUETA_AVISO = 'recordatorio-diario';

function textoMomento(momento) {
  return momento === 'DIA' ? 'Día' : 'Noche';
}

function admiteBotones() {
  return (self.Notification?.maxActions ?? 0) > 0;
}

self.addEventListener('push', (evento) => {
  let datos = { titulo: 'Scentify', cuerpo: '¿Qué te has puesto hoy?', url: '/', acciones: [] };
  try {
    if (evento.data) datos = { ...datos, ...evento.data.json() };
  } catch {
    // Carga ilegible: se enseña el aviso por defecto en vez de perderlo.
  }
  const conBotones = admiteBotones() && Array.isArray(datos.acciones) && datos.acciones.length > 0;

  evento.waitUntil(
    self.registration.showNotification(datos.titulo, {
      body: datos.cuerpo,
      icon: '/icono-192.png',
      badge: '/icono-192.png',
      lang: 'es',
      // Una sola notificacion al dia: una nueva reemplaza a la anterior.
      tag: ETIQUETA_AVISO,
      renotify: false,
      actions: conBotones
        ? datos.acciones.slice(0, self.Notification?.maxActions ?? 2).map((a) => ({
            action: a.id,
            title: a.titulo,
          }))
        : [],
      data: {
        url: conBotones ? datos.url : (datos.urlSinAcciones ?? datos.url),
        acciones: datos.acciones ?? [],
      },
    }),
  );
});

/** Abre (o trae delante) la app en `destino`. */
function abrirEn(destino) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clientes) => {
    const url = new URL(destino, self.location.origin);
    // Ya abierta en esa pantalla y sin nada que hacer al llegar: basta traerla.
    const enDestino = clientes.find((c) => new URL(c.url).href === url.href);
    if (enDestino) return enDestino.focus();
    // Abierta en otra: se reutiliza la ventana y se lleva al destino.
    const abierta = clientes.find((c) => 'navigate' in c);
    if (abierta) {
      const llevada = await abierta.navigate(url.href).catch(() => null);
      return (llevada ?? abierta).focus();
    }
    return self.clients.openWindow(url.href);
  });
}

/** Una notificacion de respuesta, en el mismo sitio que el aviso. */
function responder(titulo, opciones = {}) {
  return self.registration.showNotification(titulo, {
    icon: '/icono-192.png',
    badge: '/icono-192.png',
    lang: 'es',
    tag: ETIQUETA_AVISO,
    renotify: false,
    ...opciones,
  });
}

async function registrarDesdeAviso(plantilla) {
  const uso = {
    id: crypto.randomUUID(),
    perfumeId: plantilla.perfumeId,
    fecha: plantilla.fecha,
    momento: plantilla.momento,
    contextoId: plantilla.contextoId,
    sprays: plantilla.sprays ?? null,
    duracionPercibida: null,
    valoracionDia: null,
    comentario: null,
  };
  const apuntado = `Apuntado: ${plantilla.nombre} · ${textoMomento(plantilla.momento)} · ${plantilla.contexto}`;

  let respuesta = null;
  try {
    respuesta = await fetch('/api/usos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(uso),
    });
  } catch {
    // Sin red: a la cola, como desde la app.
  }

  if (respuesta?.ok) {
    return responder(apuntado, {
      body: 'Si no era eso, deshazlo o ajústalo en la app.',
      actions: admiteBotones() ? [{ action: 'deshacer', title: 'Deshacer' }] : [],
      data: { url: '/', deshacer: { usoId: uso.id, enCola: false } },
    });
  }
  if (respuesta && respuesta.status !== 401 && respuesta.status < 500) {
    // El perfume ya no esta, o los datos no valen: no se arregla reintentando.
    return responder('No se ha podido apuntar', {
      body: 'Ábrelo en Scentify para registrarlo.',
      data: { url: '/' },
    });
  }

  await operar('readwrite', (almacen) => almacen.put(uso));
  try {
    await self.registration.sync?.register(ETIQUETA_SYNC);
  } catch {
    // Sin Background Sync, la app lo envia al abrirse.
  }
  return responder(apuntado, {
    body:
      respuesta?.status === 401
        ? 'Guardado en el móvil. Abre Scentify para entrar y se enviará solo.'
        : 'Sin conexión: guardado en el móvil, se enviará solo.',
    actions: admiteBotones() ? [{ action: 'deshacer', title: 'Deshacer' }] : [],
    data: { url: '/', deshacer: { usoId: uso.id, enCola: true } },
  });
}

async function deshacerDesdeAviso({ usoId, enCola }) {
  // Si aun estaba en la cola, se saca de ahi; y si ya se envio, se borra.
  await operar('readwrite', (almacen) => almacen.delete(usoId)).catch(() => undefined);
  if (!enCola) {
    try {
      const respuesta = await fetch(`/api/usos/${usoId}`, { method: 'DELETE' });
      if (!respuesta.ok) throw new Error(String(respuesta.status));
    } catch {
      return responder('No se ha podido deshacer', {
        body: 'Sigue apuntado. Bórralo desde Hoy cuando tengas conexión.',
        data: { url: '/' },
      });
    }
  }
  return responder('Deshecho', { body: 'No se ha apuntado nada.', data: { url: '/' } });
}

async function completarDesdeAviso({ usoId, duracionPercibida }, titulo) {
  try {
    const respuesta = await fetch(`/api/usos/${usoId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ duracionPercibida }),
    });
    if (!respuesta.ok) throw new Error(String(respuesta.status));
  } catch {
    return responder('No se ha podido guardar', {
      body: 'Toca para completarlo en la app.',
      data: { url: '/?cierre=1' },
    });
  }
  return responder(`Duración: ${titulo}`, {
    body: 'Toca para valorar el día.',
    data: { url: '/?cierre=1' },
  });
}

self.addEventListener('notificationclick', (evento) => {
  const { notification: aviso, action } = evento;
  aviso.close();
  const datos = aviso.data ?? {};

  if (action === 'deshacer' && datos.deshacer) {
    evento.waitUntil(deshacerDesdeAviso(datos.deshacer));
    return;
  }
  const accion = action ? (datos.acciones ?? []).find((a) => a.id === action) : null;
  if (accion?.registrar) {
    evento.waitUntil(registrarDesdeAviso(accion.registrar));
    return;
  }
  if (accion?.completar) {
    evento.waitUntil(completarDesdeAviso(accion.completar, accion.titulo));
    return;
  }
  evento.waitUntil(abrirEn(datos.url ?? '/'));
});
