'use client';

/**
 * Seccion 6.1 — Duracion, valoracion y comentario se rellenan despues, por la
 * noche, desde el historial. No tocan el snapshot de idoneidad.
 */
import { useState } from 'react';
import { accionBorrarUso, accionCompletarUso } from '@/app/acciones';
import { BotonEnviar } from '@/componentes/BotonEnviar';
import type { DuracionPercibida } from '@/dominio/tipos';

export function CompletarUso({
  usoId,
  sprays,
  duracion,
  valoracion,
  comentario,
}: {
  usoId: string;
  sprays: number | null;
  duracion: DuracionPercibida | null;
  valoracion: number | null;
  comentario: string | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const completo = duracion !== null && valoracion !== null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="boton-fantasma px-1 text-sm"
      >
        {completo ? 'Editar detalles' : 'Completar detalles'}
      </button>

      {abierto ? (
        <form
          action={async (datos) => {
            await accionCompletarUso(datos);
            setAbierto(false);
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
          <BotonEnviar pendiente="Guardando…" className="boton-primario w-full text-sm">
            Guardar
          </BotonEnviar>
          {/*
            Un registro equivocado (otro perfume, otro dia) se borra desde
            aqui. El «Deshacer» de la pantalla de inicio solo dura ocho
            segundos.
          */}
          <button
            type="submit"
            formAction={accionBorrarUso}
            onClick={(e) => {
              if (!window.confirm('¿Borrar este registro? No se puede deshacer.')) e.preventDefault();
            }}
            className="boton-fantasma w-full text-sm text-id-nula"
          >
            Borrar este registro
          </button>
        </form>
      ) : null}
    </div>
  );
}
