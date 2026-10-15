'use client';

/**
 * Un uso ya registrado, con el cierre del dia a un toque.
 *
 * La duracion y la valoracion son los datos de los que viven los promedios,
 * la recomendacion y casi cualquier conclusion futura, y completarlos desde la
 * ficha costaba unos nueve toques en otra pestaña: casi nunca se hacia. Aqui
 * cada boton guarda al tocarlo, sin boton Guardar. Lo demas (sprays,
 * comentario, borrar) sigue en «Más detalles».
 *
 * Se usa en Hoy y en el dia del calendario.
 */
import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { accionValorarUso } from '@/app/acciones';
import { CompletarUso } from './CompletarUso';
import { DesgloseIdoneidad, InsigniaIdoneidad } from './Idoneidad';
import type { DuracionPercibida, EjesIdoneidad } from '@/dominio/tipos';

const DURACIONES: { valor: DuracionPercibida; texto: string }[] = [
  { valor: 'MENOS_2H', texto: '<2 h' },
  { valor: 'DE_2_4H', texto: '2-4 h' },
  { valor: 'DE_4_6H', texto: '4-6 h' },
  { valor: 'DE_6_8H', texto: '6-8 h' },
  { valor: 'MAS_8H', texto: '>8 h' },
];

export interface UsoParaTarjeta {
  id: string;
  perfumeId: string;
  nombre: string;
  marca: string;
  momento: 'DIA' | 'NOCHE';
  contexto: string;
  sprays: number | null;
  duracionPercibida: DuracionPercibida | null;
  valoracionDia: number | null;
  comentario: string | null;
  idoneidadPct: number;
  idoneidadDetalle: EjesIdoneidad;
}

export function TarjetaUso({
  uso,
  preguntar,
  enfocar = false,
}: {
  uso: UsoParaTarjeta;
  /**
   * Si la tarjeta pregunta «¿Qué tal?» de entrada. Por la mañana es pronto
   * para valorar el dia: queda detras de un boton.
   */
  preguntar: boolean;
  /** Llegando desde el aviso de la noche (?cierre=1): se trae a la vista. */
  enfocar?: boolean;
}) {
  const [valoracion, setValoracion] = useState(uso.valoracionDia);
  const [duracion, setDuracion] = useState(uso.duracionPercibida);
  const [abierto, setAbierto] = useState(preguntar || enfocar);
  const [error, setError] = useState(false);
  const [, iniciar] = useTransition();
  const raiz = useRef<HTMLLIElement>(null);

  // Lo que llega del servidor manda: al repintar tras guardar, o si se ha
  // completado en otra pantalla.
  useEffect(() => setValoracion(uso.valoracionDia), [uso.valoracionDia]);
  useEffect(() => setDuracion(uso.duracionPercibida), [uso.duracionPercibida]);

  useEffect(() => {
    if (enfocar) raiz.current?.scrollIntoView({ block: 'center' });
  }, [enfocar]);

  function guardar(campos: { valoracionDia?: number | null; duracionPercibida?: DuracionPercibida | null }) {
    setError(false);
    iniciar(async () => {
      try {
        const resultado = await accionValorarUso(uso.id, campos);
        if (!resultado.ok) setError(true);
      } catch {
        setError(true);
      }
    });
  }

  function valorar(n: number) {
    // Volver a tocar la misma la quita: una errata no obliga a ir a la ficha.
    const nueva = valoracion === n ? null : n;
    setValoracion(nueva);
    guardar({ valoracionDia: nueva });
  }

  function elegirDuracion(d: DuracionPercibida) {
    const nueva = duracion === d ? null : d;
    setDuracion(nueva);
    guardar({ duracionPercibida: nueva });
  }

  const completo = valoracion !== null && duracion !== null;

  return (
    <li ref={raiz} className="tarjeta space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/coleccion/${uso.perfumeId}`} className="nombre-perfume text-lg">
            {uso.nombre}
          </Link>
          <p className="text-sm text-texto-tenue">
            {uso.marca} · {uso.momento === 'DIA' ? 'Día' : 'Noche'} · {uso.contexto}
            {uso.sprays !== null ? ` · ${uso.sprays} sprays` : ''}
          </p>
        </div>
        <InsigniaIdoneidad pct={uso.idoneidadPct} />
      </div>
      {/* El desglose solo cuando algo no encaja: es lo que hay que ver. */}
      {uso.idoneidadPct < 100 ? <DesgloseIdoneidad detalle={uso.idoneidadDetalle} /> : null}

      {abierto ? (
        <div className="space-y-3 border-t border-borde/70 pt-3">
          <div>
            <p className="text-sm font-medium text-texto-tenue">¿Qué tal?</p>
            <div className="mt-1 flex gap-2" role="group" aria-label="Valoración del día">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-label={`${n} de 5`}
                  aria-pressed={valoracion === n}
                  data-activo={valoracion !== null && valoracion >= n}
                  onClick={() => valorar(n)}
                  className="opcion flex-1 px-0"
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-texto-tenue">¿Cuánto ha durado?</p>
            <div className="mt-1 flex flex-wrap gap-2" role="group" aria-label="Duración percibida">
              {DURACIONES.map((d) => (
                <button
                  key={d.valor}
                  type="button"
                  aria-pressed={duracion === d.valor}
                  onClick={() => elegirDuracion(d.valor)}
                  className="chip px-3"
                >
                  {d.texto}
                </button>
              ))}
            </div>
          </div>
          <p role="status" aria-live="polite" className={error ? 'aviso-error' : 'sr-only'}>
            {error
              ? 'No se ha podido guardar: no hay conexión. Vuelve a tocarlo en un rato.'
              : completo
                ? 'Día cerrado.'
                : ''}
          </p>
          <CompletarUso
            usoId={uso.id}
            sprays={uso.sprays}
            duracion={duracion}
            valoracion={valoracion}
            comentario={uso.comentario}
            etiqueta="Más detalles"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="boton-fantasma px-1 text-sm"
          aria-expanded={false}
        >
          {completo ? 'Editar valoración' : '¿Qué tal? Valorar'}
        </button>
      )}
    </li>
  );
}
