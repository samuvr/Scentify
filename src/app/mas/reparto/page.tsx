/**
 * Reparto por contexto, momento y estacion: cuantos perfumes tienes para cada
 * casilla, comparado con cuanto usas ese contexto.
 *
 * Cada contexto enseña la frecuencia que dices al lado de la real de los
 * ultimos 90 dias, para ver si te desvias y ajustarla. Cada casilla enlaza a
 * la coleccion filtrada, para ver cuales son; las escasas, ademas, a la
 * wishlist.
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { usuarioActual } from '@/servicios/auth';
import {
  candidatosParaRecomendar,
  frecuenciaRealDeContextos,
  listarContextos,
} from '@/servicios/consultas';
import { hoyIso } from '@/servicios/usos';
import { zonaDelUsuario } from '@/servicios/zona';
import { ESTACIONES } from '@/dominio/huecos';
import { formatearFrecuencia, momentosDe } from '@/dominio/contextos';
import {
  describirRotacion,
  repartoPorContexto,
  type CasillaReparto,
  type NivelReparto,
} from '@/dominio/reparto';
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
  'sin-uso': 'border-borde',
  'sin-frecuencia': 'border-borde',
};

const TEXTO_NIVEL: Record<NivelReparto, string> = {
  vacia: 'Vacía',
  escasa: 'Escasa',
  normal: 'Bien',
  sobrecargada: 'De sobra',
  'sin-uso': 'Sin uso',
  'sin-frecuencia': '—',
};

const claveDe = (c: CasillaReparto) => `${c.contextoId}-${c.momento}-${c.estacion}`;
const decimal = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 1 });

export default async function PaginaReparto() {
  const userId = await usuarioActual();
  if (!userId) redirect('/login');

  const hoy = hoyIso(await zonaDelUsuario());
  const [contextos, coleccion, real] = await Promise.all([
    listarContextos(userId),
    candidatosParaRecomendar(userId),
    frecuenciaRealDeContextos(userId, hoy),
  ]);
  const { casillas } = repartoPorContexto(coleccion, contextos);

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
  /** «esperados ~1,4 · cada ~12 semanas» */
  const detalle = (c: CasillaReparto) =>
    [
      c.esperado !== null ? `esperados ~${decimal(c.esperado)}` : null,
      c.diasEntreUsos !== null ? describirRotacion(c.diasEntreUsos) : null,
    ]
      .filter(Boolean)
      .join(' · ');

  const exceso = (c: CasillaReparto) => c.cuantos - (c.esperado ?? 0);
  const proporcion = (c: CasillaReparto) => c.cuantos / (c.esperado || 1);
  const sobrecargadas = casillas
    .filter((c) => c.nivel === 'sobrecargada')
    .sort((a, b) => exceso(b) - exceso(a));
  const porReforzar = casillas
    .filter((c) => c.nivel === 'vacia' || c.nivel === 'escasa')
    .sort((a, b) => proporcion(a) - proporcion(b));
  const sinFrecuencia = contextos.filter((c) => c.usosSemana === null);
  const juzgadas = casillas.filter((c) => c.nivel !== 'sin-uso' && c.nivel !== 'sin-frecuencia');

  const Casilla = ({ c }: { c: CasillaReparto }) => {
    const apagada = c.nivel === 'sin-uso' || c.nivel === 'sin-frecuencia';
    return (
      <Link
        href={enlaceColeccion(c)}
        className={`flex min-h-tactil flex-col justify-center border-l-4 bg-superficie-alta px-3 py-1 ${BORDE_NIVEL[c.nivel]} ${apagada ? 'opacity-60' : ''}`}
        aria-label={`${partes(c).join(', ')}: ${c.cuantos} perfumes, ${
          c.nivel === 'sin-frecuencia' ? 'sin frecuencia' : TEXTO_NIVEL[c.nivel].toLowerCase()
        }${detalle(c) ? `, ${detalle(c)}` : ''}`}
      >
        <span className="flex items-baseline justify-between gap-1">
          <span className="text-lg font-bold">{c.cuantos}</span>
          <span className="text-xs text-texto-tenue">{TEXTO_NIVEL[c.nivel]}</span>
        </span>
        {c.esperado !== null && c.nivel !== 'sin-uso' ? (
          <span className="text-xs text-texto-tenue">de ~{decimal(c.esperado)}</span>
        ) : null}
      </Link>
    );
  };

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="titulo">Reparto</h1>
        <p className="text-sm text-texto-tenue">
          Cuántos perfumes tienes para cada contexto, momento del día y estación, comparado con
          cuánto usas cada contexto: donde más lo usas, más frascos tocan. «5, de ~2,3» son 5
          perfumes donde tocarían unos 2,3. Uno marcado para varios cuenta en todos. Toca una
          casilla para ver cuáles son.
        </p>
        <p className="text-sm text-texto-tenue">
          Las frecuencias se cambian en{' '}
          <Link href="/mas/configuracion#contextos" className="underline underline-offset-2">
            Configuración
          </Link>
          . Al lado, la real de los últimos 90 días.
        </p>
      </header>

      {casillas.length === 0 ? (
        <p className="tarjeta text-sm text-texto-tenue">No tienes contextos creados.</p>
      ) : (
        contextos.map((contexto) => {
          const delContexto = casillas.filter((c) => c.contextoId === contexto.id);
          const momentos = momentosDe(contexto);
          const en = (momento: Momento, estacion: Estacion) =>
            delContexto.find((c) => c.momento === momento && c.estacion === estacion)!;
          const deVerdad = real.get(contexto.id);
          const conNoche = !contexto.atemporal && momentos.length === 2;
          return (
            <section key={contexto.id} className="tarjeta space-y-2">
              <div className="space-y-0.5">
                <h2 className="subtitulo">{contexto.nombre}</h2>
                <p className="text-sm text-texto-tenue">
                  {contexto.usosSemana === null ? (
                    'Sin frecuencia: no se juzga su reparto.'
                  ) : (
                    <>
                      {formatearFrecuencia(contexto.usosSemana)}/semana
                      {conNoche ? ` · ${contexto.pctNoche} % de noche` : ''}
                    </>
                  )}
                  {' · '}
                  <span className="text-texto">
                    real {formatearFrecuencia(deVerdad?.usosSemana ?? 0)}/semana
                    {conNoche && deVerdad?.pctNoche != null ? ` · ${deVerdad.pctNoche} %` : ''}
                  </span>
                </p>
              </div>
              {contexto.atemporal ? (
                <>
                  <p className="text-sm text-texto-tenue">Cualquier momento y estación.</p>
                  <Casilla c={delContexto[0]!} />
                </>
              ) : (
                <div
                  className={`grid items-center gap-2 text-sm ${
                    momentos.length === 2
                      ? 'grid-cols-[minmax(0,1fr)_6.5rem_6.5rem]'
                      : 'grid-cols-[minmax(0,1fr)_6.5rem]'
                  }`}
                >
                  <span />
                  {momentos.map((m) => (
                    <span key={m} className="text-center font-medium text-texto-tenue">
                      {NOMBRE_MOMENTO[m]}
                    </span>
                  ))}
                  {ESTACIONES.map((estacion) => [
                    <span key={`${estacion}-n`} className="truncate">
                      {NOMBRE_ESTACION[estacion]}
                    </span>,
                    ...momentos.map((m) => (
                      <Casilla key={`${estacion}-${m}`} c={en(m, estacion)} />
                    )),
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
            Muchos más de los que tocan por lo que lo usas: cada frasco sale poco y otro más apenas
            suma.
          </p>
          <ul className="space-y-1">
            {sobrecargadas.map((c) => (
              <li key={claveDe(c)}>
                <Link href={enlaceColeccion(c)} className="fila-toque justify-between">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{partes(c).join(' · ')}</span>
                    <span className="block truncate text-xs text-texto-tenue">{detalle(c)}</span>
                  </span>
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
            Vacías o con poco donde elegir para lo que las usas. Toca para apuntar en la wishlist.
          </p>
          <ul className="space-y-1">
            {porReforzar.map((c) => (
              <li key={claveDe(c)}>
                <Link href={enlaceWishlist(c)} className="fila-toque justify-between">
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate ${c.nivel === 'vacia' ? 'text-id-nula' : 'text-id-parcial'}`}
                    >
                      {partes(c).join(' · ')}
                    </span>
                    <span className="block truncate text-xs text-texto-tenue">{detalle(c)}</span>
                  </span>
                  <span className="etiqueta">{c.cuantos}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {juzgadas.length > 0 && sobrecargadas.length === 0 && porReforzar.length === 0 ? (
        <p className="tarjeta text-sm text-texto">
          Reparto equilibrado: ninguna casilla se sale de lo que tocaría por cómo las usas.
        </p>
      ) : null}

      {sinFrecuencia.length > 0 ? (
        <p className="text-sm text-texto-tenue">
          Sin frecuencia, y por eso sin juzgar: {sinFrecuencia.map((c) => c.nombre).join(', ')}.
          Dime cuántas veces a la semana los usas en{' '}
          <Link href="/mas/configuracion#contextos" className="underline underline-offset-2">
            Configuración
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
