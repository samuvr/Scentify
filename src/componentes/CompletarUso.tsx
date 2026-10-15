'use client';

/**
 * Seccion 6.1 — Duracion, valoracion y comentario se rellenan despues, por la
 * noche, desde el historial. No tocan el snapshot de idoneidad.
 */
import { useState, useTransition } from 'react';
import { accionBorrarUso, accionCompletarUso } from '@/app/acciones';
import { BotonEnviar } from '@/componentes/BotonEnviar';
import type { DuracionPercibida } from '@/dominio/tipos';

export function CompletarUso({
  usoId,
  sprays,
  duracion,
  valoracion,
  comentario,
  etiqueta,
}: {
  usoId: string;
  sprays: number | null;
  duracion: DuracionPercibida | null;
  valoracion: number | null;
  comentario: string | null;
  /** Texto del boton que lo abre, si no vale el de siempre. */
  etiqueta?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [borrando, iniciarBorrado] = useTransition();
  const completo = duracion !== null && valoracion !== null;

  function borrar() {
    if (!window.confirm('¿Borrar este registro? No se puede deshacer.')) return;
    const datos = new FormData();
    datos.set('usoId', usoId);
    iniciarBorrado(async () => {
      try {
        await accionBorrarUso(datos);
      } catch {
        setError('No se ha podido borrar: no hay conexión.');
      }
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="boton-fantasma px-1 text-sm"
      >
        {etiqueta ?? (completo ? 'Editar detalles' : 'Completar detalles')}
      </button>

      {abierto ? (
        <form
          action={async (datos) => {
            setError(null);
            try {
              const resultado = await accionCompletarUso(datos);
              // Si algo no vale, el formulario sigue abierto con lo escrito:
              // antes se cerraba sin guardar nada y sin decirlo.
              if (resultado.ok) setAbierto(false);
              else setError(resultado.error);
            } catch {
              setError('No se ha podido guardar: no hay conexión.');
            }
          }}
          className="mt-2 space-y-3"
        >
          <input type="hidden" name="usoId" value={usoId} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`sprays-${usoId}`}>Sprays</label>
              <input
                id={`sprays-${usoId}`}
                name="sprays"
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                step={1}
                defaultValue={sprays ?? ''}
                className="mt-1"
              />
            </div>
            <div>
              <label htmlFor={`val-${usoId}`}>Valoración</label>
              <select id={`val-${usoId}`} name="valoracionDia" defaultValue={valoracion ?? ''} className="mt-1">
                <option value="">—</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor={`dur-${usoId}`}>Duración percibida</label>
            <select id={`dur-${usoId}`} name="duracionPercibida" defaultValue={duracion ?? ''} className="mt-1">
              <option value="">—</option>
              <option value="MENOS_2H">Menos de 2h</option>
              <option value="DE_2_4H">2-4h</option>
              <option value="DE_4_6H">4-6h</option>
              <option value="DE_6_8H">6-8h</option>
              <option value="MAS_8H">Más de 8h</option>
            </select>
          </div>
          <div>
            <label htmlFor={`com-${usoId}`}>Comentario</label>
            <textarea
              id={`com-${usoId}`}
              name="comentario"
              rows={2}
              defaultValue={comentario ?? ''}
              className="mt-1"
            />
          </div>
          <p className="text-xs text-texto-tenue">Deja un campo en blanco para quitarlo.</p>
          {error ? (
            <p role="alert" className="aviso-error">
              {error}
            </p>
          ) : null}
          <BotonEnviar pendiente="Guardando…" className="boton-primario w-full text-sm">
            Guardar
          </BotonEnviar>
          {/*
            Un registro equivocado (otro perfume, otro dia) se borra desde
            aqui. El «Deshacer» de la pantalla de inicio solo dura ocho
            segundos. Va fuera del envio del formulario para que el boton de
            guardar no diga «Guardando…» mientras se borra.
          */}
          <button
            type="button"
            onClick={borrar}
            disabled={borrando}
            className="boton-fantasma w-full text-sm text-id-nula"
          >
            {borrando ? 'Borrando…' : 'Borrar este registro'}
          </button>
        </form>
      ) : null}
    </div>
  );
}
