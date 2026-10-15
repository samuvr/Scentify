'use client';

/**
 * Seccion 10.4 — El recordatorio de la noche, en un solo interruptor.
 *
 * Antes eran tres controles sueltos (una casilla, una hora y un boton para
 * este dispositivo), cada uno con su «Guardar», y se podia dejar activado sin
 * ningun dispositivo suscrito. Ahora activarlo pide el permiso, suscribe este
 * movil y lo guarda todo de una vez.
 *
 * El permiso de notificaciones se pide SOLO al pulsar, nunca al abrir la app:
 * un permiso pedido de golpe se deniega y ya no hay vuelta atras.
 */
import { useEffect, useState, useTransition } from 'react';
import { accionAjustarRecordatorio } from '@/app/acciones';

type Estado = 'cargando' | 'no-soportado' | 'sin-configurar' | 'bloqueado' | 'listo';

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

export function AvisosDiarios({
  clavePublica,
  ajuste,
  horaMaxima,
}: {
  clavePublica: string;
  ajuste: { activo: boolean; hora: number; cierre?: boolean };
  horaMaxima: number;
}) {
  const [estado, setEstado] = useState<Estado>('cargando');
  const [suscrito, setSuscrito] = useState(false);
  const [activo, setActivo] = useState(ajuste.activo);
  const [cierre, setCierre] = useState(ajuste.cierre !== false);
  const [hora, setHora] = useState(Math.min(ajuste.hora, horaMaxima));
  const [error, setError] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();

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
      .then((suscripcion) => setSuscrito(Boolean(suscripcion)))
      .catch(() => setSuscrito(false))
      .finally(() => setEstado('listo'));
  }, [clavePublica]);

  async function guardar(cambios: { activo?: boolean; hora?: number; cierre?: boolean }) {
    const respuesta = await accionAjustarRecordatorio(cambios);
    if (!respuesta.ok) throw new Error('No se ha podido guardar.');
  }

  function activar() {
    setError(null);
    iniciar(async () => {
      try {
        const permiso = await Notification.requestPermission();
        if (permiso !== 'granted') {
          if (permiso === 'denied') setEstado('bloqueado');
          return;
        }
        const registro = await navigator.serviceWorker.ready;
        const suscripcion =
          (await registro.pushManager.getSubscription()) ??
          (await registro.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: aBufferDeClave(clavePublica),
          }));
        const respuesta = await fetch('/api/push', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(suscripcion.toJSON()),
        });
        if (!respuesta.ok) throw new Error('El servidor rechazó la suscripción.');
        await guardar({ activo: true });
        setSuscrito(true);
        setActivo(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se ha podido activar.');
      }
    });
  }

  function desactivar() {
    setError(null);
    iniciar(async () => {
      try {
        await guardar({ activo: false });
        setActivo(false);
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
        setSuscrito(false);
      } catch {
        setError('No se ha podido desactivar: no hay conexión.');
      }
    });
  }

  function cambiar(cambios: { hora?: number; cierre?: boolean }) {
    setError(null);
    iniciar(async () => {
      try {
        await guardar(cambios);
      } catch {
        setError('No se ha podido guardar: no hay conexión.');
      }
    });
  }

  if (estado === 'cargando') return null;

  if (estado === 'no-soportado') {
    return (
      <p className="text-sm text-texto-tenue">
        Este navegador no admite avisos. En iPhone hay que instalar la app en la pantalla de inicio
        primero (Compartir → Añadir a pantalla de inicio) y abrirla desde ahí.
      </p>
    );
  }

  if (estado === 'sin-configurar') {
    return (
      <p className="text-sm text-texto-tenue">Los avisos no están disponibles en esta instalación.</p>
    );
  }

  if (estado === 'bloqueado') {
    return (
      <p className="aviso-atencion">
        Has bloqueado las notificaciones para este sitio. Hay que volver a permitirlas desde los
        ajustes del navegador.
      </p>
    );
  }

  const enEste = activo && suscrito;

  return (
    <div className="space-y-3">
      <button
        type="button"
        role="switch"
        aria-checked={enEste}
        disabled={ocupado}
        onClick={enEste ? desactivar : activar}
        className="opcion w-full justify-between"
      >
        Recordarme por la noche
        <span className={enEste ? 'text-id-total' : 'text-texto-tenue'}>
          {ocupado ? '…' : enEste ? 'Activo en este móvil' : 'Desactivado'}
        </span>
      </button>
      {activo && !suscrito ? (
        <p className="aviso-atencion">
          Está activado, pero este dispositivo no recibe avisos. Pulsa el interruptor para recibirlos
          aquí.
        </p>
      ) : null}

      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={cierre}
          disabled={ocupado}
          onChange={(e) => {
            setCierre(e.target.checked);
            cambiar({ cierre: e.target.checked });
          }}
          className="h-5 w-5"
        />
        Pregúntame qué tal (duración y valoración) si ya he registrado algo
      </label>

      <details className="text-sm">
        <summary className="cursor-pointer text-texto-tenue">Hora del aviso</summary>
        <div className="mt-2 space-y-1">
          <select
            aria-label="Hora del aviso"
            value={hora}
            disabled={ocupado}
            onChange={(e) => {
              const nueva = Number(e.target.value);
              setHora(nueva);
              cambiar({ hora: nueva });
            }}
          >
            {Array.from({ length: horaMaxima + 1 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}:00
              </option>
            ))}
          </select>
          <p className="text-xs text-texto-tenue">
            La comprobación se hace una vez al día, hacia las 21:00 (las 22:00 en verano): si eliges
            una hora anterior, el aviso llega igualmente en esa pasada.
          </p>
        </div>
      </details>

      <p className="text-xs text-texto-tenue">
        Un solo aviso al día. Si no has registrado nada, te deja repetir el de ayer o el de siempre
        desde la propia notificación; si ya lo has hecho, te pregunta cuánto ha durado. En iPhone, al
        tocarlo se abre la app con eso mismo preparado.
      </p>
      {error ? <p className="aviso-error">{error}</p> : null}
    </div>
  );
}
