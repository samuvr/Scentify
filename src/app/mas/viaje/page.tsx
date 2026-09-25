/**
 * Seccion 10.3 — Modo viaje.
 *
 * La estacion se calcula con el tiempo del DESTINO, no con el de casa, que es
 * justo el punto de la funcion.
 */
import { redirect } from 'next/navigation';
import { usuarioActual } from '@/servicios/auth';
import { candidatosParaRecomendar, listarContextos } from '@/servicios/consultas';
import { leerConfiguracion } from '@/servicios/ajustes';
import { obtenerClima } from '@/servicios/clima';
import { calcularEstacionEfectiva } from '@/dominio/estacion';
import { resolverViaje } from '@/dominio/viaje';
import { hoyIso } from '@/servicios/usos';
import type { Momento } from '@/dominio/tipos';
import { FormularioViaje } from './FormularioViaje';
import { BloquePromedios } from '@/componentes/BloquePromedios';

export const dynamic = 'force-dynamic';

const NOMBRE_MOMENTO: Record<Momento, string> = { DIA: 'Día', NOCHE: 'Noche' };

export default async function PaginaViaje({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const userId = await usuarioActual();
  if (!userId) redirect('/login');

  const p = await searchParams;
  const [contextos, coleccion, configuracion] = await Promise.all([
    listarContextos(userId),
    candidatosParaRecomendar(userId),
    leerConfiguracion(userId),
  ]);

  const elegidos = (p.contextos ?? '').split(',').filter(Boolean);
  const momentos = ((p.momentos ?? 'DIA,NOCHE').split(',') as Momento[]).filter((m) =>
    ['DIA', 'NOCHE'].includes(m),
  );
  const tope = p.tope ? Number(p.tope) : undefined;
  const fecha = p.fecha || hoyIso();

  // Ubicacion del destino, si se ha indicado; si no, la de casa.
  const destino =
    p.lat && p.lon
      ? { lat: Number(p.lat), lon: Number(p.lon), etiqueta: p.lugar || 'Destino' }
      : configuracion.ubicacion;

  const clima = elegidos.length > 0 ? await obtenerClima(destino, fecha) : null;
  const estacion = calcularEstacionEfectiva({
    fecha,
    momento: 'DIA',
    clima,
    umbrales: configuracion.umbrales,
    etiquetaUbicacion: destino.etiqueta,
  });

  const resultado =
    elegidos.length > 0
      ? resolverViaje({
          coleccion,
          contextoIds: elegidos,
          momentos,
          estacionesCompatibles: estacion.estaciones,
          maximoFrascos: tope,
        })
      : null;

  const nombreContexto = (id: string) => contextos.find((c) => c.id === id)?.nombre ?? '—';

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="titulo">Modo viaje</h1>
        <p className="text-sm text-texto-tenue">
          El set mínimo de frascos que cubre lo que tienes previsto.
        </p>
      </header>

      <FormularioViaje
        contextos={contextos.map((c) => ({ id: c.id, nombre: c.nombre }))}
        elegidos={elegidos}
        momentos={momentos}
        fecha={fecha}
        tope={tope}
        destino={destino}
      />

      {resultado ? (
        <>
          <p className="text-sm text-texto-tenue">{estacion.explicacion}</p>

          {resultado.frascos.length > 0 ? (
            <section className="space-y-3">
              <h2 className="subtitulo">
                Llévate {resultado.frascos.length}{' '}
                {resultado.frascos.length === 1 ? 'frasco' : 'frascos'}
                {resultado.esOptimo ? '' : ' (aproximado)'}
              </h2>
              <ul className="space-y-2">
                {resultado.frascos.map(({ perfume, cubre }) => (
                  <li key={perfume.id} className="tarjeta space-y-2">
                    <div>
                      <p className="nombre-perfume text-lg">{perfume.nombre}</p>
                      <p className="text-sm text-texto-tenue">{perfume.marca}</p>
                    </div>
                    <p className="text-sm">
                      Cubre:{' '}
                      {cubre
                        .map((r) => `${nombreContexto(r.contextoId)} ${NOMBRE_MOMENTO[r.momento]}`)
                        .join(' · ')}
                    </p>
                    {perfume.promedios ? <BloquePromedios promedios={perfume.promedios} /> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="tarjeta text-sm text-texto-tenue">
              Ningún perfume de la colección encaja con esa combinación en el destino.
            </p>
          )}

          {resultado.sinCubrir.length > 0 ? (
            <section className="space-y-2">
              <h2 className="subtitulo">Sin cubrir</h2>
              <ul className="flex flex-wrap gap-2">
                {resultado.sinCubrir.map((r) => (
                  <li
                    key={`${r.contextoId}-${r.momento}`}
                    className="etiqueta text-sm text-id-nula"
                  >
                    {nombreContexto(r.contextoId)} · {NOMBRE_MOMENTO[r.momento]}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : (
        <p className="tarjeta text-sm text-texto-tenue">
          Elige los contextos que esperas y te digo qué llevarte.
        </p>
      )}
    </div>
  );
}
