/**
 * Cola de registros de usos sin conexion (seccion 11).
 *
 * No es un cache de lectura: es escritura diferida con reintento. Un uso que no
 * se puede enviar se guarda en IndexedDB y se reenvia al volver la conexion,
 * con Background Sync si el navegador lo soporta y con el evento `online` si no.
 *
 * El id del uso lo genera el cliente, asi que reenviar dos veces el mismo
 * registro es inofensivo: el servidor lo resuelve con ON CONFLICT DO NOTHING.
 */

const BD = 'scentify';
const ALMACEN = 'usos-pendientes';
const ETIQUETA_SYNC = 'sincronizar-usos';

export interface UsoPendiente {
  id: string;
  perfumeId: string;
  fecha: string;
  momento: 'DIA' | 'NOCHE';
  contextoId: string;
  sprays: number | null;
  duracionPercibida: string | null;
  valoracionDia: number | null;
  comentario: string | null;
}

/**
 * `sin-sesion`: la sesion ha caducado o se ha cerrado. El uso queda en la
 * cola igual que sin conexion, y sale en cuanto se vuelva a entrar.
 */
export type ResultadoEnvio = 'guardado' | 'encolado' | 'sin-sesion' | 'error';

/**
 * Lo que el aviso de pendientes escucha para volver a contar. Lleva en
 * `detail.sinSesion` si lo ultimo encolado fue por falta de sesion.
 */
export const EVENTO_COLA = 'scentify:cola';

/**
 * 401 es «no hay sesion», no «datos rotos»: reintentar con sesion lo arregla.
 * Se trata como la falta de red, y nunca se tira el registro por ello.
 */
const SIN_SESION = 401;

function avisarCambioDeCola(sinSesion = false) {
  window.dispatchEvent(new CustomEvent(EVENTO_COLA, { detail: { sinSesion } }));
}

function abrirBd(): Promise<IDBDatabase> {
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

function transaccion<T>(
  modo: IDBTransactionMode,
  operacion: (almacen: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return abrirBd().then(
    (bd) =>
      new Promise<T>((resolver, rechazar) => {
        const tx = bd.transaction(ALMACEN, modo);
        const peticion = operacion(tx.objectStore(ALMACEN));
        peticion.onsuccess = () => resolver(peticion.result);
        peticion.onerror = () => rechazar(peticion.error);
        tx.oncomplete = () => bd.close();
      }),
  );
}

async function guardarPendiente(uso: UsoPendiente): Promise<void> {
  await transaccion('readwrite', (almacen) => almacen.put(uso));
}

async function olvidarPendiente(id: string): Promise<void> {
  await transaccion('readwrite', (almacen) => almacen.delete(id));
}

export async function usosPendientes(): Promise<UsoPendiente[]> {
  try {
    return await transaccion<UsoPendiente[]>('readonly', (almacen) => almacen.getAll());
  } catch {
    // Modo privado o IndexedDB bloqueado: la cola no existe, pero la app sigue.
    return [];
  }
}

async function pedirSincronizacion(): Promise<void> {
  try {
    const registro = await navigator.serviceWorker?.ready;
    const sync = (registro as ServiceWorkerRegistration & { sync?: { register(t: string): Promise<void> } })
      ?.sync;
    await sync?.register(ETIQUETA_SYNC);
  } catch {
    // Sin Background Sync se reintenta con el evento `online`.
  }
}

async function enviar(uso: UsoPendiente): Promise<Response> {
  return fetch('/api/usos', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(uso),
  });
}

/**
 * Intenta enviar el uso; si la red falla o no hay sesion, lo encola. El resto
 * de 4xx no se encola: los datos son invalidos y reintentar no los arregla.
 */
export async function encolarUso(uso: UsoPendiente): Promise<ResultadoEnvio> {
  let sinSesion = false;
  try {
    const respuesta = await enviar(uso);
    if (respuesta.ok) return 'guardado';
    if (respuesta.status === SIN_SESION) {
      sinSesion = true;
      throw new Error('Sin sesión');
    }
    if (respuesta.status >= 400 && respuesta.status < 500) return 'error';
    throw new Error(`Estado ${respuesta.status}`);
  } catch {
    try {
      await guardarPendiente(uso);
      avisarCambioDeCola(sinSesion);
      if (sinSesion) return 'sin-sesion';
      await pedirSincronizacion();
      return 'encolado';
    } catch {
      return 'error';
    }
  }
}

/** Saca de la cola un uso que aun no se ha enviado ("Deshacer" sin conexion). */
export async function descartarPendiente(id: string): Promise<void> {
  await transaccion('readwrite', (almacen) => almacen.delete(id));
  avisarCambioDeCola();
}

/**
 * Reenvia todo lo pendiente. Devuelve cuantos se han sincronizado y si se ha
 * parado por falta de sesion, para que el aviso pida entrar.
 */
export async function vaciarCola(): Promise<{ enviados: number; sinSesion: boolean }> {
  const pendientes = await usosPendientes();
  let enviados = 0;
  for (const uso of pendientes) {
    let respuesta: Response;
    try {
      respuesta = await enviar(uso);
    } catch {
      break; // Sigue sin haber red: se deja el resto para el proximo intento.
    }
    // Sin sesion no sale ninguno: se paran todos, y se conservan.
    if (respuesta.status === SIN_SESION) return { enviados, sinSesion: true };
    // El resto de 4xx no se va a arreglar solo: se saca de la cola para no
    // reintentar eternamente un registro roto. Un 5xx se queda para luego.
    if (respuesta.ok || (respuesta.status >= 400 && respuesta.status < 500)) {
      await olvidarPendiente(uso.id);
      if (respuesta.ok) enviados += 1;
    }
  }
  return { enviados, sinSesion: false };
}
