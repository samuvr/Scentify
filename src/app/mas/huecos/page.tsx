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

  const [contextos, coleccion] = await Promise.all([
    listarContextos(userId),
    candidatosParaRecomendar(userId),
  ]);

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
        <h1 className="text-2xl font-bold">Huecos</h1>
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

      {resultado.huecos.length === 0 ? (
        <p className="tarjeta text-sm text-texto">
          No te falta ninguna combinación. Enhorabuena, y lo siento por tu cartera.
        </p>
      ) : (
        <section className="space-y-4">
          {[...porContexto.entries()].map(([contextoId, huecos]) => (
            <div key={contextoId} className="space-y-2">
              <h2 className="text-lg font-semibold">
                {nombreContexto(contextoId)}{' '}
                <span className="text-sm font-normal text-texto-tenue">
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
                      className="etiqueta border-id-nula/40 text-sm text-id-nula"
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
          <h2 className="text-lg font-semibold">Pendientes de un hilo</h2>
          <p className="text-sm text-texto-tenue">
            Estas las cubre un solo frasco: si lo vendes o se acaba, se abre un hueco.
          </p>
          <ul className="flex flex-wrap gap-2">
            {resultado.frageles.map((c) => (
              <li
                key={`${c.contextoId}-${c.momento}-${c.estacion}`}
                className="etiqueta border-id-parcial/40 text-sm text-id-parcial"
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
