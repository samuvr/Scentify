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
 */
const VERSION = 'v7';
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
  const guardada = await cache.match(peticion);

  const desdeRed = fetch(peticion).then((respuesta) => {
    if (guardable(respuesta)) cache.put(peticion, respuesta.clone());
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

self.addEventListener('push', (evento) => {
  let datos = { titulo: 'Scentify', cuerpo: '¿Qué te has puesto hoy?', url: '/' };
  try {
    if (evento.data) datos = { ...datos, ...evento.data.json() };
  } catch {
    // Carga ilegible: se enseña el aviso por defecto en vez de perderlo.
  }

  evento.waitUntil(
    self.registration.showNotification(datos.titulo, {
      body: datos.cuerpo,
      icon: '/icono-192.png',
      badge: '/icono-192.png',
      lang: 'es',
      // Una sola notificacion al dia: una nueva reemplaza a la anterior.
      tag: 'recordatorio-diario',
      renotify: false,
      data: { url: datos.url },
    }),
  );
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const destino = evento.notification.data?.url ?? '/';

  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clientes) => {
      const url = new URL(destino, self.location.origin);
      // Ya abierta en esa pantalla: basta con traerla delante.
      const enDestino = clientes.find((c) => new URL(c.url).pathname === url.pathname);
      if (enDestino) return enDestino.focus();
      // Abierta en otra: se reutiliza la ventana y se lleva al destino.
      const abierta = clientes.find((c) => 'navigate' in c);
      if (abierta) {
        const llevada = await abierta.navigate(url.href).catch(() => null);
        return (llevada ?? abierta).focus();
      }
      return self.clients.openWindow(url.href);
    }),
  );
});
