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
 */
const VERSION = 'v6';
const CACHE_ARMAZON = `scentify-armazon-${VERSION}`;
const CACHE_DATOS = `scentify-datos-${VERSION}`;
const ETIQUETA_SYNC = 'sincronizar-usos';

const BD = 'scentify';
const ALMACEN = 'usos-pendientes';

/** Lo minimo para que la app arranque estando sin conexion. */
const ARMAZON = ['/', '/coleccion', '/recomendacion', '/sin-conexion', '/manifest.webmanifest', '/icono.svg'];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE_ARMAZON)
      // addAll falla entero si una sola URL falla; mejor una a una.
      .then((cache) => Promise.allSettled(ARMAZON.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
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

/** Red primero, cache como red de seguridad. Para HTML y lecturas de datos. */
async function redPrimero(peticion, nombreCache) {
  const cache = await caches.open(nombreCache);
  try {
    const respuesta = await fetch(peticion);
    if (respuesta.ok) cache.put(peticion, respuesta.clone());
    return respuesta;
  } catch (error) {
    const guardada = await cache.match(peticion);
    if (guardada) return guardada;
    if (peticion.mode === 'navigate') {
      return (await cache.match('/sin-conexion')) ?? (await cache.match('/')) ?? Response.error();
    }
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
    evento.respondWith(redPrimero(request, CACHE_ARMAZON));
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
    if (!ruta.startsWith('/_next/static/') && !ruta.startsWith('/icono') && ruta !== '/manifest.webmanifest') {
      await armazon.delete(peticion);
    }
  }
}

self.addEventListener('message', (evento) => {
  // Sin Background Sync (Safari, por ejemplo) la pagina pide el vaciado a mano.
  if (evento.data?.tipo === 'vaciar-cola') evento.waitUntil(vaciarCola());
  if (evento.data?.tipo === 'olvidar-datos') evento.waitUntil(olvidarDatos());
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
