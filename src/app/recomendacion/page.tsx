/**
 * Seccion 7.2 — "Recomiendame un perfume".
 *
 * Pregunta solo momento y contexto; la estacion la deduce la 7.1 del tiempo
 * real, la enseña con su explicacion y deja sobrescribirla.
 *
 * Con `dia=manana` se planifica el dia siguiente: la estacion sale de la
 * prevision de mañana y lo que se elige se apunta con la fecha de mañana. El
 * resto de la peticion (momento, contexto, estacion a mano) no cambia.
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  candidatosParaRecomendar,
  contextoHabitual,
  descartesDeHoy,
  listarContextos,
} from '@/servicios/consultas';
import {
  desplazarDias,
  esFinDeSemana,
  ESPERA_CLIMA_PANTALLA_MS,
  estacionEfectivaDe,
  hoyIso,
  momentoDeAhora,
} from '@/servicios/usos';
import { usuarioActual } from '@/servicios/auth';
import { zonaDelUsuario } from '@/servicios/zona';
import { porQueNoHayRecomendacion, recomendar, type SinRecomendacion } from '@/dominio/recomendacion';
import type { Estacion, Momento } from '@/dominio/tipos';
import { FilaRecomendacion, TarjetaPrincipal } from './Tarjetas';
import { SelectorPeticion } from './SelectorPeticion';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Sugerir' };

export const dynamic = 'force-dynamic';

const ESTACIONES: Estacion[] = ['PRIMAVERA', 'VERANO', 'OTONO', 'INVIERNO'];

const ESTACION_LEGIBLE: Record<Estacion, string> = {
  PRIMAVERA: 'primavera',
  VERANO: 'verano',
  OTONO: 'otoño',
  INVIERNO: 'invierno',
};

function leerEstaciones(valor: string | undefined): Estacion[] | null {
  if (!valor) return null;
  const elegidas = valor.split(',').filter((e): e is Estacion => ESTACIONES.includes(e as Estacion));
  return elegidas.length > 0 ? elegidas : null;
}

export default async function PaginaRecomendacion({
  searchParams,
}: {
  searchParams: Promise<{
    momento?: string;
    contexto?: string;
    estaciones?: string;
    dia?: string;
  }>;
}) {
  const userId = await usuarioActual();
  if (!userId) redirect('/login');

  const parametros = await searchParams;
  const zona = await zonaDelUsuario();
  const paraManana = parametros.dia === 'manana';
  const fecha = paraManana ? desplazarDias(hoyIso(zona), 1) : hoyIso(zona);
  // Sin eleccion en la URL, lo que toca ahora: el momento por la hora y el
  // contexto habitual de ese momento en este tipo de dia. Para mañana la hora
  // de ahora no dice nada (se planifica de noche para el dia siguiente), asi
  // que se empieza por el dia.
  const momento: Momento =
    parametros.momento === 'NOCHE' || parametros.momento === 'DIA'
      ? parametros.momento
      : paraManana
        ? 'DIA'
        : momentoDeAhora(zona);

  const [contextos, candidatos, descartados, estacionCalculada, habitual] = await Promise.all([
    listarContextos(userId),
    candidatosParaRecomendar(userId),
    descartesDeHoy(userId, fecha),
    estacionEfectivaDe(userId, fecha, momento, paraManana ? 'mañana' : 'hoy', {
      esperaMaximaMs: ESPERA_CLIMA_PANTALLA_MS,
    }),
    parametros.contexto ? null : contextoHabitual(userId, momento, esFinDeSemana(fecha)),
  ]);

  const contextoElegido =
    contextos.find((c) => c.id === (parametros.contexto ?? habitual)) ?? contextos[0] ?? null;

  // La estacion propuesta siempre es sobrescribible (7.1).
  const forzadas = leerEstaciones(parametros.estaciones);
  const estacionesCompatibles = forzadas ?? estacionCalculada.estaciones;

  const resultado = contextoElegido
    ? recomendar({
        coleccion: candidatos,
        momento,
        contextoId: contextoElegido.id,
        estacionesCompatibles,
        hoy: fecha,
        paraManana,
        descartados,
        nombreContexto: contextoElegido.nombre,
      })
    : { recomendaciones: [] };

  const peticion = {
    momento,
    contextoId: contextoElegido?.id ?? '',
    fecha,
    paraManana,
    estaciones: forzadas ?? undefined,
  };
  const [primera, ...resto] = resultado.recomendaciones;

  const sinRecomendacion =
    !primera && contextoElegido
      ? porQueNoHayRecomendacion({
          coleccion: candidatos,
          momento,
          contextoId: contextoElegido.id,
          estacionesCompatibles,
          descartados,
        })
      : null;
  const sinEstacionAMano = new URLSearchParams(
    Object.entries(parametros).filter(
      (par): par is [string, string] => par[0] !== 'estaciones' && typeof par[1] === 'string',
    ),
  ).toString();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="titulo">{paraManana ? 'Recomiéndame para mañana' : 'Recomiéndame'}</h1>
        <p className="text-sm text-texto-tenue">
          {forzadas ? 'Estación elegida a mano.' : estacionCalculada.explicacion}
          {estacionCalculada.origen === 'CALENDARIO' && !forzadas ? ' Sin conexión con Open-Meteo.' : ''}
        </p>
      </header>

      <SelectorPeticion
        contextos={contextos.map((c) => ({ id: c.id, nombre: c.nombre }))}
        paraManana={paraManana}
        momento={momento}
        contextoId={contextoElegido?.id ?? ''}
        estacionesCompatibles={estacionesCompatibles}
        estacionesPropuestas={estacionCalculada.estaciones}
        sobrescrita={forzadas !== null}
      />

      {primera ? (
        <>
          <TarjetaPrincipal recomendacion={primera} {...peticion} />
          {resto.length > 0 ? (
            <section className="space-y-1">
              <h2 className="subtitulo">Si no, también encajan</h2>
              <ul className="divide-y divide-borde/70">
                {resto.map((r) => (
                  <FilaRecomendacion key={r.perfume.id} recomendacion={r} {...peticion} />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : (
        <EstadoVacio
          causa={sinRecomendacion}
          nombreContexto={contextoElegido?.nombre ?? null}
          momento={momento}
          estaciones={estacionesCompatibles}
          hrefSinEstacionAMano={forzadas ? `/recomendacion?${sinEstacionAMano}` : null}
        />
      )}
    </div>
  );
}

/** Cada causa con su texto y su salida: un mismo consejo no sirve para todas. */
function EstadoVacio({
  causa,
  nombreContexto,
  momento,
  estaciones,
  hrefSinEstacionAMano,
}: {
  causa: SinRecomendacion | null;
  nombreContexto: string | null;
  momento: Momento;
  estaciones: Estacion[];
  hrefSinEstacionAMano: string | null;
}) {
  if (!causa || !nombreContexto) {
    return (
      <p className="tarjeta text-sm text-texto-tenue">
        No hay contextos activos para elegir. Sin contexto no se puede recomendar nada.
      </p>
    );
  }

  if (causa.causa === 'SIN_PERFUMES') {
    return (
      <div className="tarjeta space-y-3 text-sm">
        <p>
          No te queda ningún perfume disponible: los archivados y los que marcaste como «lo tuve» no
          se recomiendan.
        </p>
        <Link href="/coleccion" className="boton-secundario px-4 text-sm">
          Ir a la colección
        </Link>
      </div>
    );
  }

  if (causa.causa === 'TODOS_DESCARTADOS') {
    return (
      <p className="tarjeta text-sm text-texto-tenue">
        Has pasado con «Otro» los {causa.descartados} perfumes que tienes. Los descartes valen solo
        para este día: mañana vuelven a salir todos.
      </p>
    );
  }

  const momentoTexto = momento === 'DIA' ? 'día' : 'noche';
  const estacionTexto = estaciones.map((e) => ESTACION_LEGIBLE[e]).join(' o ');
  const { marcados } = causa;
  return (
    <div className="tarjeta space-y-3 text-sm">
      <p>
        Ninguno de tus {causa.disponibles} perfumes coincide en al menos dos de tres:{' '}
        {nombreContexto}, {momentoTexto} y {estacionTexto}.
      </p>
      <p className="text-texto-tenue">
        Tienes {marcados.contexto} marcados para {nombreContexto}, {marcados.momento} para{' '}
        {momentoTexto} y {marcados.estacion} para {estacionTexto}.
        {marcados.contexto === 0
          ? ` Si alguno te sirve para ${nombreContexto}, márcalo en su ficha.`
          : ''}
      </p>
      <div className="flex flex-wrap gap-2">
        {hrefSinEstacionAMano ? (
          <Link href={hrefSinEstacionAMano} className="boton-secundario px-4 text-sm">
            Usar la estación calculada
          </Link>
        ) : null}
        <Link href="/mas/huecos" className="boton-secundario px-4 text-sm">
          Ver huecos
        </Link>
      </div>
    </div>
  );
}
