'use client';

/**
 * Seccion 10.4 — Activar el recordatorio diario en este dispositivo.
 *
 * El permiso de notificaciones se pide SOLO cuando se pulsa el botón, nunca al
 * abrir la app: un permiso pedido de golpe se deniega y ya no hay vuelta atrás.
 */
import { useEffect, useState } from 'react';

type Estado = 'cargando' | 'no-soportado' | 'sin-configurar' | 'desactivado' | 'activado' | 'bloqueado';

/**
 * La clave VAPID viaja en base64url y el navegador la quiere en bytes.
 * Se devuelve el ArrayBuffer y no el Uint8Array porque `applicationServerKey`
 * pide un BufferSource respaldado por un ArrayBuffer normal.
 */
function aBufferDeClave(base64url: string): ArrayBuffer {
  const relleno = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + relleno).replace(/-/g, '+').replace(/_/g, '/');
  const crudo = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(crudo.length));
  for (let i = 0; i < crudo.length; i += 1) bytes[i] = crudo.charCodeAt(i);
  return bytes.buffer;
}

export function AvisosDiarios({ clavePublica }: { clavePublica: string }) {
  const [estado, setEstado] = useState<Estado>('cargando');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setEstado('no-soportado');
      return;
    }
    if (!clavePublica) {
      setEstado('sin-configurar');
      return;
    }
    if (Notification.permission === 'denied') {
      setEstado('bloqueado');
      return;
    }
    navigator.serviceWorker.ready
      .then((registro) => registro.pushManager.getSubscription())
      .then((suscripcion) => setEstado(suscripcion ? 'activado' : 'desactivado'))
      .catch(() => setEstado('desactivado'));
  }, [clavePublica]);

  async function activar() {
    setError(null);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== 'granted') {
        setEstado(permiso === 'denied' ? 'bloqueado' : 'desactivado');
        return;
      }

      const registro = await navigator.serviceWorker.ready;
      const suscripcion = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: aBufferDeClave(clavePublica),
      });

      const respuesta = await fetch('/api/push', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(suscripcion.toJSON()),
      });
      if (!respuesta.ok) throw new Error('El servidor rechazó la suscripción.');
      setEstado('activado');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido activar.');
    }
  }

  async function desactivar() {
    const registro = await navigator.serviceWorker.ready;
    const suscripcion = await registro.pushManager.getSubscription();
    if (suscripcion) {
      await fetch('/api/push', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: suscripcion.endpoint }),
      });
      await suscripcion.unsubscribe();
    }
    setEstado('desactivado');
  }

  if (estado === 'cargando') return null;

  if (estado === 'no-soportado') {
    return (
      <p className="text-sm text-texto-tenue">
        Este navegador no admite avisos. En iPhone hay que instalar la app en la pantalla de
        inicio primero.
      </p>
    );
  }

  if (estado === 'sin-configurar') {
    return (
      <p className="text-sm text-texto-tenue">
        Falta configurar las claves VAPID en el servidor para poder enviar avisos.
      </p>
    );
  }

  if (estado === 'bloqueado') {
    return (
      <p className="text-sm text-id-parcial">
        Has bloqueado las notificaciones para este sitio. Hay que volver a permitirlas desde los
        ajustes del navegador.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={estado === 'activado' ? desactivar : activar}
        className={estado === 'activado' ? 'boton-secundario w-full' : 'boton-primario w-full'}
      >
        {estado === 'activado' ? 'Desactivar avisos en este dispositivo' : 'Activar avisos en este dispositivo'}
      </button>
      <p className="text-xs text-texto-tenue">
        Los avisos se activan por dispositivo. Actívalos en el móvil, que es donde los vas a ver.
      </p>
      {error ? <p className="text-sm text-id-nula">{error}</p> : null}
    </div>
  );
}
