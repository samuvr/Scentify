/**
 * Seccion 10.3 — Modo viaje.
 *
 * La estacion se calcula con el tiempo del DESTINO, no con el de casa, que es
 * justo el punto de la funcion, y para cada dia del viaje y cada momento: la
 * noche refresca, y en un viaje largo el tiempo cambia.
 */
import { redirect } from 'next/navigation';
import { usuarioActual } from '@/servicios/auth';
import { candidatosParaRecomendar, listarContextos } from '@/servicios/consultas';
import { leerConfiguracion } from '@/servicios/ajustes';
import { obtenerClima } from '@/servicios/clima';
import { calcularEstacionEfectiva, type ResultadoEstacionEfectiva } from '@/dominio/estacion';
import { diasDeViaje, estacionesDistintas, resolverViaje } from '@/dominio/viaje';
import { hoyIso } from '@/servicios/usos';
import { zonaDelUsuario } from '@/servicios/zona';
import type { Estacion, Momento } from '@/dominio/tipos';
import { FormularioViaje } from './FormularioViaje';
import { BloquePromedios } from '@/componentes/BloquePromedios';
import { fechaOVacia } from '@/dominio/navegacion';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Modo viaje' };

export const dynamic = 'force-dynamic';

const NOMBRE_MOMENTO: Record<Momento, string> = { DIA: 'Día', NOCHE: 'Noche' };

const NOMBRE_ESTACION: Record<Estacion, string> = {
  PRIMAVERA: 'primavera',
  VERANO: 'verano',
  OTONO: 'otoño',
  INVIERNO: 'invierno',
};

/** Un viaje mas largo no cambia la maleta y solo multiplica las consultas. */
const DIAS_MAXIMOS = 60;
/** Open-Meteo solo da prevision para los proximos 16 dias; despues, calendario. */
const DIAS_CON_PREVISION = 16;

const MS_DIA = 86_400_000;
const sumarDias = (iso: string, dias: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + dias * MS_DIA).toISOString().slice(0, 10);

const nombrarEstaciones = (estaciones: Estacion[]) =>
  estaciones.map((e) => NOMBRE_ESTACION[e]).join(' / ');

const entero = (valor: string | undefined) =>
  Number(valor) >= 1 ? Math.floor(Number(valor)) : undefined;

const listaDeIds = (valor: string | undefined) => (valor ?? '').split(',').filter(Boolean);

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

  const nombreContexto = (id: string) => contextos.find((c) => c.id === id)?.nombre ?? '—';

  const contextosDia = listaDeIds(p.dia);
  const contextosNoche = listaDeIds(p.noche);
  const hayContextos = contextosDia.length > 0 || contextosNoche.length > 0;
  const tope = entero(p.tope);
  const minimo = entero(p.minimo);

  const hoy = hoyIso(await zonaDelUsuario());
  const desde = fechaOVacia(p.desde) ?? hoy;
  // Una vuelta anterior a la ida no tiene sentido: se toma como viaje de un dia.
  const hastaPedido = fechaOVacia(p.hasta);
  const hasta = hastaPedido && hastaPedido >= desde ? hastaPedido : desde;
  const dias = diasDeViaje(desde, hasta);
  const diasCalculados = Math.min(dias, DIAS_MAXIMOS);

  // Ubicacion del destino, si se ha indicado; si no, la de casa.
  const destino =
    p.lat && p.lon && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon))
      ? { lat: Number(p.lat), lon: Number(p.lon), etiqueta: p.lugar || 'Destino' }
      : configuracion.ubicacion;

  // Estacion de cada dia del viaje, de dia y de noche. El tiempo se pide solo
  // para los dias con prevision; los demas caen al calendario.
  const fechas = Array.from({ length: diasCalculados }, (_, i) => sumarDias(desde, i));
  const limitePrevision = sumarDias(hoy, DIAS_CON_PREVISION - 1);
  const climas = hayContextos
    ? await Promise.all(
        fechas.map((f) => (f <= limitePrevision ? obtenerClima(destino, f) : Promise.resolve(null))),
      )
    : [];
  const estacionesDe = (momento: Momento): ResultadoEstacionEfectiva[] =>
    fechas.map((f, i) =>
      calcularEstacionEfectiva({
        fecha: f,
        momento,
        clima: climas[i] ?? null,
        umbrales: configuracion.umbrales,
        etiquetaUbicacion: destino.etiqueta,
      }),
    );
  const porDia = hayContextos ? { DIA: estacionesDe('DIA'), NOCHE: estacionesDe('NOCHE') } : null;
  const tramos = porDia
    ? {
        DIA: estacionesDistintas(porDia.DIA.map((e) => e.estaciones)),
        NOCHE: estacionesDistintas(porDia.NOCHE.map((e) => e.estaciones)),
      }
    : null;

  const resultado =
    porDia && tramos
      ? resolverViaje({
          coleccion,
          contextosPorMomento: { DIA: contextosDia, NOCHE: contextosNoche },
          estacionesCompatibles: porDia.DIA[0]?.estaciones ?? [],
          contextosAtemporales: contextos.filter((c) => c.atemporal).map((c) => c.id),
          estacionesPorMomento: tramos,
          minimoFrascos: minimo,
          maximoFrascos: tope,
        })
      : null;

  // Resumen del tiempo: con un solo dia, la explicacion de siempre; con varios,
  // que estaciones salen de dia y de noche y si hay prevision o calendario.
  const resumenTiempo = (() => {
    if (!porDia || !tramos) return null;
    if (fechas.length === 1) return porDia.DIA[0]?.explicacion ?? null;
    const conPrevision = climas.filter(Boolean).length;
    const origen =
      conPrevision === 0
        ? 'Sin previsión para esas fechas: estación por calendario.'
        : conPrevision < fechas.length
          ? `Previsión para ${conPrevision} de ${fechas.length} días; el resto, por calendario.`
          : 'Con la previsión de todos los días.';
    const linea = (m: Momento) =>
      `${NOMBRE_MOMENTO[m]}: ${tramos[m].map(nombrarEstaciones).join(', luego ')}`;
    return `En ${destino.etiqueta}. ${linea('DIA')}. ${linea('NOCHE')}. ${origen}`;
  })();

  // Con mas de un tramo de tiempo en un momento, cada requisito dice el suyo.
  // Un contexto atemporal no tiene momento: se nombra solo.
  const describirRequisito = (r: { contextoId: string; momento: Momento | null; estaciones?: Estacion[] }) =>
    r.momento === null
      ? nombreContexto(r.contextoId)
      : `${nombreContexto(r.contextoId)} ${NOMBRE_MOMENTO[r.momento]}` +
        (r.estaciones && (tramos?.[r.momento].length ?? 0) > 1 ? ` (${nombrarEstaciones(r.estaciones)})` : '');


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
        contextosDia={contextosDia}
        contextosNoche={contextosNoche}
        desde={desde}
        hasta={hasta}
        dias={dias}
        minimo={minimo}
        tope={tope}
        destino={destino}
      />

      {resultado ? (
        <>
          {resumenTiempo ? <p className="text-sm text-texto-tenue">{resumenTiempo}</p> : null}

          {resultado.frascos.length > 0 ? (
            <section className="space-y-3">
              <h2 className="subtitulo">
                Llévate {resultado.frascos.length}{' '}
                {resultado.frascos.length === 1 ? 'frasco' : 'frascos'}
                {resultado.esOptimo ? '' : ' (aproximado)'}
              </h2>
              {resultado.faltanParaMinimo > 0 ? (
                <p className="text-sm text-texto-tenue">
                  Querías llevar al menos {minimo}, pero no hay más perfumes de tu colección que
                  encajen con este viaje.
                </p>
              ) : null}
              <ul className="space-y-2">
                {resultado.frascos.map(({ perfume, cubre, deRefuerzo }) => (
                  <li key={perfume.id} className="tarjeta space-y-2">
                    <div>
                      <p className="nombre-perfume text-lg">{perfume.nombre}</p>
                      <p className="text-sm text-texto-tenue">{perfume.marca}</p>
                    </div>
                    <p className="text-sm">
                      {deRefuerzo ? 'De refuerzo · también sirve para: ' : 'Cubre: '}
                      {cubre.map(describirRequisito).join(' · ')}
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
                    key={`${r.contextoId}-${r.momento}-${r.estaciones?.join(',') ?? ''}`}
                    className="etiqueta text-sm text-id-nula"
                  >
                    {describirRequisito(r)}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : (
        <p className="tarjeta text-sm text-texto-tenue">
          Elige los contextos que esperas de día y de noche y te digo qué llevarte.
        </p>
      )}
    </div>
  );
}
