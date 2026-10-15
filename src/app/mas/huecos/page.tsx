/**
 * Seccion 10.1 — Deteccion de huecos.
 *
 * Cada hueco enlaza a crear una entrada de wishlist, que es para lo que sirve
 * saber que te falta.
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { usuarioActual } from '@/servicios/auth';
import { candidatosParaRecomendar, listarContextos } from '@/servicios/consultas';
import { agruparPorContexto, detectarHuecos } from '@/dominio/huecos';
import { huecosQueCierra } from '@/dominio/recategorizacion';
import { PropuestasMarcas } from '@/componentes/PropuestasMarcas';
import { propuestasDeLaColeccion } from '@/servicios/recategorizacion';
import { hoyIso } from '@/servicios/usos';
import { zonaDelUsuario } from '@/servicios/zona';
import type { Estacion, Momento } from '@/dominio/tipos';

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
  const [contextos, coleccion, propuestas] = await Promise.all([
    listarContextos(userId),
    candidatosParaRecomendar(userId),
    propuestasDeLaColeccion(userId, hoy),
  ]);
  const contextoIds = contextos.map((c) => c.id);

  // «Ya lo cubres sin saberlo»: marcas que tus usos respaldan y que cerrarian
  // huecos. Antes la pantalla pedia comprar lo que ya tenias.
  const cubresSinSaberlo = propuestas
    .filter((p) => p.accion === 'añadir')
    .map((p) => ({ ...p, cierra: huecosQueCierra(coleccion, contextoIds, p) }))
    .filter((p) => p.cierra > 0)
    .sort((a, b) => b.cierra - a.cierra)
    .slice(0, 5);

  const resultado = detectarHuecos(
    coleccion,
    contextos.map((c) => c.id),
  );
  const porContexto = agruparPorContexto(resultado.huecos);
  const nombreContexto = (id: string) => contextos.find((c) => c.id === id)?.nombre ?? '—';

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
        <section className="space-y-4">
          {[...porContexto.entries()].map(([contextoId, huecos]) => (
            <div key={contextoId} className="space-y-2">
              <h2 className="subtitulo">
                {nombreContexto(contextoId)}{' '}
                <span className="font-normal normal-case tracking-normal">
                  ({huecos.length} sin cubrir)
                </span>
              </h2>
              <ul className="flex flex-wrap gap-2">
                {huecos.map((hueco) => (
                  <li key={`${hueco.momento}-${hueco.estacion}`}>
                    <Link
                      href={`/mas/wishlist?hueco=${encodeURIComponent(
                        `${nombreContexto(contextoId)} + ${NOMBRE_ESTACION[hueco.estacion]} + ${NOMBRE_MOMENTO[hueco.momento]}`,
                      )}`}
                      className="chip text-id-nula"
                    >
                      {NOMBRE_ESTACION[hueco.estacion]} · {NOMBRE_MOMENTO[hueco.momento]}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
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
                {nombreContexto(c.contextoId)} · {NOMBRE_ESTACION[c.estacion]} ·{' '}
                {NOMBRE_MOMENTO[c.momento]}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
