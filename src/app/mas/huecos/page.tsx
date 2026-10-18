/**
 * Seccion 10.1 — Deteccion de huecos.
 *
 * Cada hueco enlaza a crear una entrada de wishlist, que es para lo que sirve
 * saber que te falta.
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { usuarioActual } from '@/servicios/auth';
import {
  candidatosParaRecomendar,
  listarContextos,
  usosPorCombinacion,
} from '@/servicios/consultas';
import {
  agruparPorContexto,
  detectarHuecos,
  ponderarHuecos,
  type Combinacion,
} from '@/dominio/huecos';
import { huecosQueCierra } from '@/dominio/recategorizacion';
import { PropuestasMarcas } from '@/componentes/PropuestasMarcas';
import { propuestasDeLaColeccion } from '@/servicios/recategorizacion';
import { desplazarDias, hoyIso } from '@/servicios/usos';
import { zonaDelUsuario } from '@/servicios/zona';
import type { Estacion, Momento } from '@/dominio/tipos';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Huecos' };

export const dynamic = 'force-dynamic';

const NOMBRE_ESTACION: Record<Estacion, string> = {
  PRIMAVERA: 'Primavera',
  VERANO: 'Verano',
  OTONO: 'Otoño',
  INVIERNO: 'Invierno',
};

const NOMBRE_MOMENTO: Record<Momento, string> = { DIA: 'Día', NOCHE: 'Noche' };

export default async function PaginaHuecos() {
  const userId = await usuarioActual();
  if (!userId) redirect('/login');

  const hoy = hoyIso(await zonaDelUsuario());
  // Un año: lo bastante para ver las cuatro estaciones, lo bastante cerca
  // para que cuente como lo que haces ahora.
  const [contextos, coleccion, propuestas, usosVividos] = await Promise.all([
    listarContextos(userId),
    candidatosParaRecomendar(userId),
    propuestasDeLaColeccion(userId, hoy),
    usosPorCombinacion(userId, desplazarDias(hoy, -364)),
  ]);
  const contextoIds = contextos.map((c) => c.id);
  const atemporales = contextos.filter((c) => c.atemporal).map((c) => c.id);

  // «Ya lo cubres sin saberlo»: marcas que tus usos respaldan y que cerrarian
  // huecos. Antes la pantalla pedia comprar lo que ya tenias.
  const cubresSinSaberlo = propuestas
    .filter((p) => p.accion === 'añadir')
    .map((p) => ({ ...p, cierra: huecosQueCierra(coleccion, contextoIds, p, atemporales) }))
    .filter((p) => p.cierra > 0)
    .sort((a, b) => b.cierra - a.cierra)
    .slice(0, 5);

  const resultado = detectarHuecos(coleccion, contextoIds, atemporales);
  const ponderados = ponderarHuecos(resultado, usosVividos, atemporales);
  const teoricosPorContexto = agruparPorContexto(ponderados.teoricos);
  const nombreContexto = (id: string) => contextos.find((c) => c.id === id)?.nombre ?? '—';
  // Un contexto atemporal no tiene momento ni estacion: es una casilla sola.
  const momentoYEstacion = (c: Combinacion) =>
    c.estacion && c.momento ? [NOMBRE_ESTACION[c.estacion], NOMBRE_MOMENTO[c.momento]] : [];
  const describir = (c: Combinacion, separador = ' · ') =>
    [nombreContexto(c.contextoId), ...momentoYEstacion(c)].join(separador);
  const enlaceWishlist = (hueco: Combinacion) =>
    `/mas/wishlist?hueco=${encodeURIComponent(describir(hueco, ' + '))}`;

  const porcentaje = Math.round((100 * resultado.cubiertas) / (resultado.totalCombinaciones || 1));

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="titulo">Huecos</h1>
        <p className="text-sm text-texto-tenue">
          Contextos × momentos × estaciones que no cubre ningún perfume que tengas.
        </p>
      </header>

      <section className="tarjeta space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-bold">{porcentaje}%</span>
          <span className="text-sm text-texto-tenue">
            {resultado.cubiertas} de {resultado.totalCombinaciones} cubiertas
          </span>
        </div>
        <div className="h-2 overflow-hidden bg-superficie-alta">
          <div className="h-full bg-acento" style={{ width: `${porcentaje}%` }} />
        </div>
        {ponderados.coberturaReal !== null ? (
          <p className="text-sm text-texto-tenue">
            Contando lo que haces de verdad: el {ponderados.coberturaReal} % de tus usos del último
            año fue en una situación que tienes cubierta.
          </p>
        ) : null}
      </section>

      {cubresSinSaberlo.length > 0 ? (
        <section className="space-y-2">
          <h2 className="subtitulo">Ya lo cubres sin saberlo</h2>
          <p className="text-sm text-texto-tenue">
            Te los pones así y no los tienes marcados. Marcarlos cierra huecos sin comprar nada.
          </p>
          <PropuestasMarcas
            propuestas={cubresSinSaberlo.map((p) => ({
              ...p,
              nombre: `${p.nombre} (cierra ${p.cierra} ${p.cierra === 1 ? 'hueco' : 'huecos'})`,
            }))}
            contextos={contextos}
            conPerfume
          />
        </section>
      ) : null}

      {resultado.huecos.length === 0 ? (
        <p className="tarjeta text-sm text-texto">
          No te falta ninguna combinación. Enhorabuena, y lo siento por tu cartera.
        </p>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="subtitulo">Los que te encuentras</h2>
            {ponderados.vividos.length > 0 ? (
              <>
                <p className="text-sm text-texto-tenue">
                  Situaciones en las que has estado este último año sin nada marcado para ellas, de
                  más a menos veces.
                </p>
                <ul className="space-y-1">
                  {ponderados.vividos.map((hueco) => (
                    <li key={`${hueco.contextoId}-${hueco.momento}-${hueco.estacion}`}>
                      <Link href={enlaceWishlist(hueco)} className="fila-toque justify-between">
                        <span className="min-w-0 flex-1 truncate text-id-nula">
                          {describir(hueco)}
                        </span>
                        <span className="etiqueta text-xs">
                          {hueco.usos} {hueco.usos === 1 ? 'vez' : 'veces'}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="tarjeta text-sm text-texto-tenue">
                Ninguno: en el último año, todo lo que has vivido lo tenías cubierto.
              </p>
            )}
          </section>

          {ponderados.teoricos.length > 0 ? (
            <details className="space-y-4">
              <summary className="subtitulo cursor-pointer">
                Combinaciones que no has vivido ({ponderados.teoricos.length})
              </summary>
              <p className="mt-2 text-sm text-texto-tenue">
                Nadie las cubre, pero en el último año no te has visto en ellas: no apremian.
              </p>
              {[...teoricosPorContexto.entries()].map(([contextoId, huecos]) => (
                <div key={contextoId} className="mt-3 space-y-2">
                  <h3 className="text-sm font-medium">
                    {nombreContexto(contextoId)}{' '}
                    <span className="text-texto-tenue">({huecos.length})</span>
                  </h3>
                  <ul className="flex flex-wrap gap-2">
                    {huecos.map((hueco) => (
                      <li key={`${hueco.momento}-${hueco.estacion}`}>
                        <Link href={enlaceWishlist(hueco)} className="chip">
                          {momentoYEstacion(hueco).join(' · ') || 'Cualquier día y estación'}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </details>
          ) : null}
        </>
      )}

      {resultado.frageles.length > 0 ? (
        <section className="space-y-2">
          <h2 className="subtitulo">Pendientes de un hilo</h2>
          <p className="text-sm text-texto-tenue">
            Estas las cubre un solo frasco: si lo vendes o se acaba, se abre un hueco.
          </p>
          <ul className="flex flex-wrap gap-2">
            {resultado.frageles.map((c) => (
              <li
                key={`${c.contextoId}-${c.momento}-${c.estacion}`}
                className="etiqueta text-sm text-id-parcial"
              >
                {describir(c)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
