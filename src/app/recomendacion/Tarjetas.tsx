/**
 * Las tarjetas de recomendacion: explicacion en texto, bloque de promedios y
 * las dos acciones de la seccion 7.2.
 *
 * "Me lo pongo" registra el uso de un toque, sin volver a pedir momento ni
 * contexto. "Otro" descarta la sugerencia durante el resto del dia y deja que
 * entre la siguiente de la lista.
 */
import { BloquePromedios } from '@/componentes/BloquePromedios';
import { DesgloseIdoneidad, InsigniaIdoneidad } from '@/componentes/Idoneidad';
import { accionDescartarRecomendacion, accionRegistrarDesdeRecomendacion } from '../acciones';
import type { PerfumeCandidato, Recomendacion } from '@/dominio/recomendacion';
import type { Momento } from '@/dominio/tipos';

const NOMBRE_EJE: Record<string, string> = {
  momento: 'el momento',
  contexto: 'el contexto',
  estacion: 'la estación',
};

function BotonesUso({
  perfumeId,
  momento,
  contextoId,
  fecha,
  conDescarte,
}: {
  perfumeId: string;
  momento: Momento;
  contextoId: string;
  fecha: string;
  conDescarte: boolean;
}) {
  return (
    <div className="flex gap-2">
      <form action={accionRegistrarDesdeRecomendacion} className="flex-1">
        <input type="hidden" name="perfumeId" value={perfumeId} />
        <input type="hidden" name="momento" value={momento} />
        <input type="hidden" name="contextoId" value={contextoId} />
        <input type="hidden" name="fecha" value={fecha} />
        <button type="submit" className="boton-primario w-full">
          Me lo pongo
        </button>
      </form>
      {conDescarte ? (
        <form action={accionDescartarRecomendacion}>
          <input type="hidden" name="perfumeId" value={perfumeId} />
          <button type="submit" className="boton-secundario px-4">
            Otro
          </button>
        </form>
      ) : null}
    </div>
  );
}

export function TarjetaRecomendacion({
  recomendacion,
  momento,
  contextoId,
  fecha,
}: {
  recomendacion: Recomendacion;
  momento: Momento;
  contextoId: string;
  fecha: string;
}) {
  const { perfume, idoneidad, parcial, ejesQueFallan, explicacion } = recomendacion;

  return (
    <li
      className={`tarjeta space-y-3 ${
        parcial ? 'border-dashed border-id-alta/50' : 'border-ambar/30'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">{perfume.nombre}</p>
          <p className="text-sm text-texto-tenue">{perfume.marca}</p>
        </div>
        <InsigniaIdoneidad pct={idoneidad.pct} />
      </div>

      {parcial ? (
        <p className="rounded-lg bg-id-alta/10 px-3 py-2 text-sm text-id-alta">
          Coincidencia parcial: no encaja{' '}
          {ejesQueFallan.map((eje) => NOMBRE_EJE[eje]).join(' ni ')}.
        </p>
      ) : null}

      <p className="text-sm">{explicacion}</p>

      {perfume.promedios ? <BloquePromedios promedios={perfume.promedios} /> : null}

      <DesgloseIdoneidad detalle={idoneidad.detalle} />

      <BotonesUso
        perfumeId={perfume.id}
        momento={momento}
        contextoId={contextoId}
        fecha={fecha}
        conDescarte
      />
    </li>
  );
}

export function BloqueSinEstrenar({
  perfumes,
  momento,
  contextoId,
  fecha,
}: {
  perfumes: PerfumeCandidato[];
  momento: Momento;
  contextoId: string;
  fecha: string;
}) {
  if (perfumes.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Nunca los has usado</h2>
      <ul className="space-y-2">
        {perfumes.map((p) => (
          <li key={p.id} className="tarjeta space-y-3">
            <div>
              <p className="font-semibold">{p.nombre}</p>
              <p className="text-sm text-texto-tenue">{p.marca}</p>
            </div>
            <BotonesUso
              perfumeId={p.id}
              momento={momento}
              contextoId={contextoId}
              fecha={fecha}
              conDescarte
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
