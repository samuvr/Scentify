'use client';

/**
 * Registra el service worker y vacia la cola de usos pendientes al recuperar
 * conexion. Si hay algo encolado lo dice, para que nunca haya duda de si el
 * registro de esta mañana llego o no.
 *
 * Vive en el layout, no en una pantalla: el service worker tiene que estar
 * registrado entre en la pantalla que entre (el aviso de recordatorio lo
 * espera), y la cola se vacia en cuanto se abre la app con conexion, no solo
 * cuando la conexion vuelve con la app abierta.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { EVENTO_COLA, usosPendientes, vaciarCola } from '@/cliente/cola-offline';
import { COOKIE_ZONA, zonaValida } from '@/dominio/zona';

/** Pantallas sin sesion: no hay que pedir que se entre, ya se esta en ello. */
const SIN_SESION = ['/login', '/registro'];

export function SincronizadorOffline() {
  const router = useRouter();
  const ruta = usePathname();
  const [pendientes, setPendientes] = useState(0);
  const [sinConexion, setSinConexion] = useState(false);
  const [sinSesion, setSinSesion] = useState(false);
  const enPantallaDeAcceso = SIN_SESION.includes(ruta);

  /**
   * En el login se acaba de cerrar sesion, o ha caducado: se borran las
   * paginas y datos guardados por el service worker, que no distinguen de
   * quien son.
   */
  useEffect(() => {
    if (!enPantallaDeAcceso) return;
    navigator.serviceWorker?.ready
      .then((registro) => registro.active?.postMessage({ tipo: 'olvidar-datos' }))
      .catch(() => undefined);
  }, [enPantallaDeAcceso]);

  /**
   * La zona horaria del movil, para que el servidor calcule «hoy» y el
   * momento del dia con el mismo reloj que ve el usuario. Si cambia (primera
   * visita, un viaje), se repinta para que la pantalla ya la use.
   */
  useEffect(() => {
    const zona = zonaValida(Intl.DateTimeFormat().resolvedOptions().timeZone);
    if (!zona) return;
    const actual = document.cookie
      .split('; ')
      .find((c) => c.startsWith(`${COOKIE_ZONA}=`))
      ?.slice(COOKIE_ZONA.length + 1);
    if (actual && decodeURIComponent(actual) === zona) return;
    document.cookie = `${COOKIE_ZONA}=${encodeURIComponent(zona)}; path=/; max-age=31536000; samesite=lax`;
    if (!enPantallaDeAcceso) router.refresh();
  }, [router, enPantallaDeAcceso]);

  useEffect(() => {
    navigator.serviceWorker?.register('/sw.js').catch(() => undefined);

    const contar = () => usosPendientes().then((lista) => setPendientes(lista.length));

    const sincronizar = async () => {
      setSinConexion(false);
      const resultado = await vaciarCola();
      setSinSesion(resultado.sinSesion);
      if (resultado.enviados > 0) router.refresh();
      contar();
    };

    const desconectar = () => setSinConexion(true);

    // El service worker avisa cuando ha vaciado la cola con Background Sync.
    const desdeWorker = (evento: MessageEvent) => {
      if (evento.data?.tipo === 'usos-sincronizados') {
        contar();
        router.refresh();
      }
      if (evento.data?.tipo === 'sesion-caducada') setSinSesion(true);
    };
    navigator.serviceWorker?.addEventListener('message', desdeWorker);

    setSinConexion(!navigator.onLine);
    // Al abrir la app con conexion se envia lo que quedara de otro dia.
    usosPendientes().then((lista) => {
      setPendientes(lista.length);
      if (lista.length > 0 && navigator.onLine && !enPantallaDeAcceso) void sincronizar();
    });

    window.addEventListener('online', sincronizar);
    window.addEventListener('offline', desconectar);
    const alCambiarLaCola = (evento: Event) => {
      if ((evento as CustomEvent<{ sinSesion?: boolean }>).detail?.sinSesion) setSinSesion(true);
      contar();
    };
    window.addEventListener(EVENTO_COLA, alCambiarLaCola);
    return () => {
      window.removeEventListener('online', sincronizar);
      window.removeEventListener('offline', desconectar);
      window.removeEventListener(EVENTO_COLA, alCambiarLaCola);
      navigator.serviceWorker?.removeEventListener('message', desdeWorker);
    };
  }, [router, enPantallaDeAcceso]);

  if (pendientes === 0 && !sinConexion) return null;

  const uno = pendientes === 1;

  return (
    <p
      role="status"
      className="mb-3 border border-borde bg-superficie-alta px-4 py-2 text-sm text-texto-tenue"
    >
      {pendientes > 0 && (sinSesion || enPantallaDeAcceso) ? (
        <>
          {pendientes} {uno ? 'registro guardado' : 'registros guardados'} en este móvil.{' '}
          {enPantallaDeAcceso ? (
            uno ? 'Se enviará al entrar.' : 'Se enviarán al entrar.'
          ) : (
            <>
              Tu sesión ha caducado:{' '}
              <Link href={`/login?siguiente=${encodeURIComponent(ruta)}`} className="text-texto underline">
                entra
              </Link>
              {uno ? ' y se enviará solo.' : ' y se enviarán solos.'}
            </>
          )}
        </>
      ) : pendientes > 0 ? (
        `${pendientes} ${uno ? 'registro pendiente' : 'registros pendientes'} de enviar. Se sincronizan solos al volver la cobertura.`
      ) : (
        'Sin conexión. Puedes registrar igual: se enviará al volver la cobertura.'
      )}
    </p>
  );
}
