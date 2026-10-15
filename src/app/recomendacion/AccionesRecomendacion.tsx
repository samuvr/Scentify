'use client';

/**
 * «Me lo pongo» y «Otro», en el navegador.
 *
 * Eran formularios con accion de servidor, y sin cobertura un toque tumbaba la
 * app entera con un «Application error» justo debajo del aviso que promete
 * «Puedes registrar igual». Ahora «Me lo pongo» va por la misma cola que el
 * registro de un toque de Hoy: con red se guarda y se va a Hoy; sin red se
 * queda en el movil y se envia solo al volver. «Otro» no tiene cola (un
 * descarte de hoy no sirve de nada mañana): si falla, lo dice y ya.
 *
 * La fecha sale del reloj del movil al pulsar, no del HTML: una PWA abierta
 * desde anoche apuntaria el uso en el dia anterior.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { encolarUso } from '@/cliente/cola-offline';
import { hoySegunElMovil } from '@/cliente/fecha';
import { desplazar } from '@/dominio/estadisticas';
import type { Estacion, Momento } from '@/dominio/tipos';
import { accionDescartarRecomendacion } from '../acciones';

const AVISOS = {
  encolado: 'Sin conexión: apuntado en el móvil. Se enviará solo al volver la cobertura.',
  'sin-sesion': 'Tu sesión ha caducado: guardado en el móvil. Vuelve a entrar y se enviará solo.',
  error: 'No se ha podido registrar. Inténtalo otra vez.',
  descarte: 'Sin conexión: no se ha podido descartar. Inténtalo al volver la cobertura.',
} as const;

export function AccionesRecomendacion({
  perfumeId,
  nombre,
  sprays,
  momento,
  contextoId,
  fecha,
  paraManana = false,
  estaciones,
  compacto = false,
}: {
  perfumeId: string;
  nombre: string;
  sprays: number | null;
  momento: Momento;
  contextoId: string;
  /** La fecha de la peticion, para el descarte (hoy o mañana). */
  fecha: string;
  paraManana?: boolean;
  estaciones?: Estacion[];
  compacto?: boolean;
}) {
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);
  const [descartando, iniciarDescarte] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);
  const [encolado, setEncolado] = useState(false);
  const ocupado = guardando || descartando || encolado;

  async function meLoPongo() {
    if (ocupado) return;
    setGuardando(true);
    setAviso(null);
    const hoy = hoySegunElMovil();
    const resultado = await encolarUso({
      id: crypto.randomUUID(),
      perfumeId,
      fecha: paraManana ? desplazar(hoy, 1) : hoy,
      momento,
      contextoId,
      sprays,
      duracionPercibida: null,
      valoracionDia: null,
      comentario: null,
      ...(estaciones?.length ? { estacionesForzadas: estaciones } : {}),
    });
    setGuardando(false);

    if (resultado === 'guardado') {
      router.push(paraManana ? '/?registrado=manana' : '/?registrado=1');
      return;
    }
    setAviso(AVISOS[resultado]);
    // Ya esta en la cola: otro toque lo apuntaria dos veces.
    if (resultado !== 'error') setEncolado(true);
  }

  function otro() {
    if (ocupado) return;
    setAviso(null);
    iniciarDescarte(async () => {
      const datos = new FormData();
      datos.set('perfumeId', perfumeId);
      datos.set('fecha', fecha);
      try {
        await accionDescartarRecomendacion(datos);
      } catch {
        setAviso(AVISOS.descarte);
      }
    });
  }

  return (
    <div className={compacto ? 'space-y-2' : 'w-full space-y-2'}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={meLoPongo}
          disabled={ocupado}
          aria-busy={guardando}
          aria-label={`${paraManana ? 'Me lo pondré' : 'Me lo pongo'}: ${nombre}`}
          className={compacto ? 'boton-secundario px-4 text-sm' : 'boton-primario flex-1'}
        >
          {guardando ? 'Guardando…' : encolado ? 'Apuntado' : paraManana ? 'Me lo pondré' : 'Me lo pongo'}
        </button>
        <button
          type="button"
          onClick={otro}
          disabled={ocupado}
          aria-busy={descartando}
          aria-label={`Otro: descartar ${nombre} ${paraManana ? 'para mañana' : 'por hoy'}`}
          className={compacto ? 'boton-fantasma px-3 text-sm' : 'boton-secundario px-5'}
        >
          Otro
        </button>
      </div>
      <p role="status" aria-live="polite" className={aviso ? 'text-sm text-texto-tenue' : 'sr-only'}>
        {aviso ?? ''}
      </p>
    </div>
  );
}
