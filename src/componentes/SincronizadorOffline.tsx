'use client';

/**
 * Registra el service worker y vacia la cola de usos pendientes al recuperar
 * conexion. Si hay algo encolado lo dice, para que nunca haya duda de si el
 * registro de esta mañana llego o no.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usosPendientes, vaciarCola } from '@/cliente/cola-offline';

export function SincronizadorOffline() {
  const router = useRouter();
  const [pendientes, setPendientes] = useState(0);
  const [sinConexion, setSinConexion] = useState(false);

  useEffect(() => {
    navigator.serviceWorker?.register('/sw.js').catch(() => undefined);

    const contar = () => usosPendientes().then((lista) => setPendientes(lista.length));
    contar();

    const sincronizar = async () => {
      setSinConexion(false);
      if ((await vaciarCola()) > 0) router.refresh();
      contar();
    };

    const desconectar = () => setSinConexion(true);

    setSinConexion(!navigator.onLine);
    window.addEventListener('online', sincronizar);
    window.addEventListener('offline', desconectar);
    return () => {
      window.removeEventListener('online', sincronizar);
      window.removeEventListener('offline', desconectar);
    };
  }, [router]);

  if (pendientes === 0 && !sinConexion) return null;

  return (
    <p
      role="status"
      className="mb-3 rounded-xl border border-borde bg-superficie-alta px-4 py-2 text-sm text-texto-tenue"
    >
      {pendientes > 0
        ? `${pendientes} ${pendientes === 1 ? 'registro pendiente' : 'registros pendientes'} de enviar. Se sincronizan solos al volver la cobertura.`
        : 'Sin conexión. Puedes registrar igual: se enviará al volver la cobertura.'}
    </p>
  );
}
