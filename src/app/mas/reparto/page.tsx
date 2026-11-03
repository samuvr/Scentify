/**
 * Reparto por contexto, momento y estacion: en que casillas vas mas cojo que en
 * el resto de tu coleccion, teniendo en cuenta cuanto usas cada contexto. No
 * dice si tienes muchos perfumes, sino donde tienes menos que en lo demas.
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
  holgada: 'border-acento',
  'sin-uso': 'border-borde',
  'sin-frecuencia': 'border-borde',
};

const TEXTO_NIVEL: Record<NivelReparto, string> = {
  vacia: 'Vacía',
  escasa: 'Escasa',
  normal: 'Bien',
  holgada: 'Holgada',
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
  /** «al 40 % del resto · cada ~12 semanas» */
  const detalle = (c: CasillaReparto) =>
    [
      c.cobertura !== null ? `al ${Math.round(100 * c.cobertura)} % del resto` : null,
      c.diasEntreUsos !== null ? describirRotacion(c.diasEntreUsos) : null,
    ]
      .filter(Boolean)
      .join(' · ');

  const cobertura = (c: CasillaReparto) => c.cobertura ?? 1;
  const holgadas = casillas
    .filter((c) => c.nivel === 'holgada')
    .sort((a, b) => cobertura(b) - cobertura(a));
  const porReforzar = casillas
    .filter((c) => c.nivel === 'vacia' || c.nivel === 'escasa')
    .sort((a, b) => cobertura(a) - cobertura(b) || (b.usosSemana ?? 0) - (a.usosSemana ?? 0));
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
          Dónde vas más cojo respecto al resto de tu colección. No mide si tienes muchos o pocos
          perfumes: compara cada contexto, momento y estación con los demás, teniendo en cuenta
          cuánto los usas (donde más lo usas, más frascos pide). «3, de ~6» son 3 perfumes donde, al
          ritmo del resto de tu colección, tendrías unos 6. Uno marcado para varios cuenta en todos.
          Toca una casilla para ver cuáles son.
        </p>
        <p className="text-sm text-texto-tenue">
          Las frecuencias se cambian en{' '}
          <Link href="/mas/configuracion#contextos" className="underline underline-offset-2">
            Configuración
          </Link>
          . Al lado, la real de los últimos 90 días.
        </p>
      </header>

      {porReforzar.length > 0 ? (
        <section className="space-y-2">
          <h2 className="subtitulo">Donde vas más cojo</h2>
          <p className="text-sm text-texto-tenue">
            Vacías, o bastante por detrás del resto de tu colección para lo que las usas. Primero
            las que más se quedan atrás. Toca para apuntar en la wishlist.
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

      {juzgadas.length > 0 && holgadas.length === 0 && porReforzar.length === 0 ? (
        <p className="tarjeta text-sm text-texto">
          Reparto equilibrado: ninguna casilla va claramente por detrás ni por delante del resto.
        </p>
      ) : null}

      {holgadas.length > 0 ? (
        <section className="space-y-2">
          <h2 className="subtitulo">Donde vas más servido</h2>
          <p className="text-sm text-texto-tenue">
            Bastante por delante del resto para lo que las usas: aquí otro frasco suma menos que en
            las de arriba.
          </p>
          <ul className="space-y-1">
            {holgadas.map((c) => (
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
