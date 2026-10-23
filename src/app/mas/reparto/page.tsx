/**
 * Reparto por contexto, momento y estacion: cuantos perfumes tienes para cada
 * casilla.
 *
 * Cada casilla enlaza a la coleccion filtrada, para ver cuales son; las
 * escasas, ademas, a la wishlist.
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { usuarioActual } from '@/servicios/auth';
import { candidatosParaRecomendar, listarContextos } from '@/servicios/consultas';
import { ESTACIONES } from '@/dominio/huecos';
import { repartoPorContexto, type CasillaReparto, type NivelReparto } from '@/dominio/reparto';
import type { Estacion, Momento } from '@/dominio/tipos';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Reparto' };

export const dynamic = 'force-dynamic';

const NOMBRE_ESTACION: Record<Estacion, string> = {
  PRIMAVERA: 'Primavera',
  VERANO: 'Verano',
  OTONO: 'Otoño',
  INVIERNO: 'Invierno',
};

const NOMBRE_MOMENTO: Record<Momento, string> = { DIA: 'Día', NOCHE: 'Noche' };

/** El filete lateral lleva el tono; el numero, el contraste. */
const BORDE_NIVEL: Record<NivelReparto, string> = {
  vacia: 'border-id-nula',
  escasa: 'border-id-parcial',
  normal: 'border-id-total',
  sobrecargada: 'border-acento',
};

const TEXTO_NIVEL: Record<NivelReparto, string> = {
  vacia: 'Vacía',
  escasa: 'Escasa',
  normal: 'Bien',
  sobrecargada: 'De sobra',
};

const claveDe = (c: CasillaReparto) => `${c.contextoId}-${c.momento}-${c.estacion}`;

export default async function PaginaReparto() {
  const userId = await usuarioActual();
  if (!userId) redirect('/login');

  const [contextos, coleccion] = await Promise.all([
    listarContextos(userId),
    candidatosParaRecomendar(userId),
  ]);
  const { casillas, media } = repartoPorContexto(coleccion, contextos);

  const nombreContexto = (id: string) => contextos.find((c) => c.id === id)?.nombre ?? '—';
  // Un contexto atemporal no tiene momento ni estacion: es una casilla sola.
  const partes = (c: CasillaReparto) =>
    c.momento && c.estacion
      ? [nombreContexto(c.contextoId), NOMBRE_MOMENTO[c.momento], NOMBRE_ESTACION[c.estacion]]
      : [nombreContexto(c.contextoId)];
  const enlaceColeccion = (c: CasillaReparto) =>
    `/coleccion?${new URLSearchParams({
      estado: 'LO_TENGO',
      contexto: c.contextoId,
      ...(c.momento ? { momento: c.momento } : {}),
      ...(c.estacion ? { estacion: c.estacion } : {}),
    }).toString()}`;
  const enlaceWishlist = (c: CasillaReparto) =>
    `/mas/wishlist?hueco=${encodeURIComponent(partes(c).join(' + '))}`;

  const sobrecargadas = casillas
    .filter((c) => c.nivel === 'sobrecargada')
    .sort((a, b) => b.cuantos - a.cuantos);
  const porReforzar = casillas
    .filter((c) => c.nivel === 'vacia' || c.nivel === 'escasa')
    .sort((a, b) => a.cuantos - b.cuantos);

  const Casilla = ({ c }: { c: CasillaReparto }) => (
    <Link
      href={enlaceColeccion(c)}
      className={`flex min-h-tactil items-baseline justify-between gap-2 border-l-4 bg-superficie-alta px-3 py-2 ${BORDE_NIVEL[c.nivel]}`}
      aria-label={`${partes(c).join(', ')}: ${c.cuantos} perfumes, ${TEXTO_NIVEL[c.nivel].toLowerCase()}`}
    >
      <span className="text-lg font-bold">{c.cuantos}</span>
      <span className="text-xs text-texto-tenue">{TEXTO_NIVEL[c.nivel]}</span>
    </Link>
  );

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="titulo">Reparto</h1>
        <p className="text-sm text-texto-tenue">
          Cuántos perfumes tienes para cada contexto, momento del día y estación. Uno marcado para
          varios cuenta en todos. Toca una casilla para ver cuáles son.
        </p>
        {casillas.length > 0 ? (
          <p className="text-sm text-texto-tenue">
            Media: {media.toLocaleString('es-ES')} perfumes por casilla.
          </p>
        ) : null}
      </header>

      {casillas.length === 0 ? (
        <p className="tarjeta text-sm text-texto-tenue">No tienes contextos creados.</p>
      ) : (
        contextos.map((contexto) => {
          const delContexto = casillas.filter((c) => c.contextoId === contexto.id);
          const en = (momento: Momento, estacion: Estacion) =>
            delContexto.find((c) => c.momento === momento && c.estacion === estacion)!;
          return (
            <section key={contexto.id} className="tarjeta space-y-2">
              <h2 className="subtitulo">{contexto.nombre}</h2>
              {contexto.atemporal ? (
                <>
                  <p className="text-sm text-texto-tenue">Cualquier momento y estación.</p>
                  <Casilla c={delContexto[0]!} />
                </>
              ) : (
                <div className="grid grid-cols-[minmax(0,1fr)_6rem_6rem] items-center gap-2 text-sm">
                  <span />
                  <span className="text-center font-medium text-texto-tenue">Día</span>
                  <span className="text-center font-medium text-texto-tenue">Noche</span>
                  {ESTACIONES.map((estacion) => [
                    <span key={`${estacion}-n`} className="truncate">
                      {NOMBRE_ESTACION[estacion]}
                    </span>,
                    <Casilla key={`${estacion}-d`} c={en('DIA', estacion)} />,
                    <Casilla key={`${estacion}-o`} c={en('NOCHE', estacion)} />,
                  ])}
                </div>
              )}
            </section>
          );
        })
      )}

      {sobrecargadas.length > 0 ? (
        <section className="space-y-2">
          <h2 className="subtitulo">Ya tienes de sobra</h2>
          <p className="text-sm text-texto-tenue">
            Muy por encima de la media: otro frasco para aquí apenas suma.
          </p>
          <ul className="space-y-1">
            {sobrecargadas.map((c) => (
              <li key={claveDe(c)}>
                <Link href={enlaceColeccion(c)} className="fila-toque justify-between">
                  <span className="min-w-0 flex-1 truncate">{partes(c).join(' · ')}</span>
                  <span className="etiqueta">{c.cuantos}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {porReforzar.length > 0 ? (
        <section className="space-y-2">
          <h2 className="subtitulo">Les vendría bien un refuerzo</h2>
          <p className="text-sm text-texto-tenue">
            Vacías o con muy poco donde elegir. Toca para apuntar en la wishlist.
          </p>
          <ul className="space-y-1">
            {porReforzar.map((c) => (
              <li key={claveDe(c)}>
                <Link href={enlaceWishlist(c)} className="fila-toque justify-between">
                  <span
                    className={`min-w-0 flex-1 truncate ${c.nivel === 'vacia' ? 'text-id-nula' : 'text-id-parcial'}`}
                  >
                    {partes(c).join(' · ')}
                  </span>
                  <span className="etiqueta">{c.cuantos}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {casillas.length > 0 && sobrecargadas.length === 0 && porReforzar.length === 0 ? (
        <p className="tarjeta text-sm text-texto">
          Reparto equilibrado: ninguna casilla se sale de lo normal.
        </p>
      ) : null}
    </div>
  );
}
