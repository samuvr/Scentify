/** Seccion 8 — Estadisticas. */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { usuarioActual } from '@/servicios/auth';
import { listarContextos } from '@/servicios/consultas';
import { calcularEstadisticas } from '@/servicios/estadisticas';
import { hoyIso } from '@/servicios/usos';
import { rangoDePeriodo, rejillaHeatmap, type Periodo } from '@/dominio/estadisticas';
import { DURACION_LEGIBLE, formatearFecha } from '@/componentes/BloquePromedios';
import { SelectorPeriodo } from './SelectorPeriodo';
import { Barras, Comparativa, Heatmap } from './Graficos';
import type { Estacion, Momento } from '@/dominio/tipos';

export const dynamic = 'force-dynamic';

const PERIODOS: Periodo[] = ['30d', '90d', 'anio-en-curso', '365d', 'personalizado'];

const NOMBRE_ESTACION: Record<Estacion, string> = {
  PRIMAVERA: 'Primavera',
  VERANO: 'Verano',
  OTONO: 'Otoño',
  INVIERNO: 'Invierno',
};

export default async function PaginaEstadisticas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const userId = await usuarioActual();
  if (!userId) redirect('/login');

  const p = await searchParams;
  const periodo: Periodo = PERIODOS.includes(p.periodo as Periodo)
    ? (p.periodo as Periodo)
    : '30d';
  const hoy = hoyIso();
  const rango = rangoDePeriodo(periodo, hoy, { desde: p.desde, hasta: p.hasta });

  const momento = p.momento === 'DIA' || p.momento === 'NOCHE' ? (p.momento as Momento) : undefined;

  const [contextos, datos] = await Promise.all([
    listarContextos(userId),
    calcularEstadisticas(userId, rango, { momento, contextoId: p.contexto }),
  ]);

  const { indicadores, comparativa } = datos;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Estadísticas</h1>

      <SelectorPeriodo
        periodo={periodo}
        rango={rango}
        contextos={contextos.map((c) => ({ id: c.id, nombre: c.nombre }))}
      />

      <section className="grid grid-cols-2 gap-2">
        <Comparativa titulo="Usos" comparacion={comparativa.usos} />
        <Comparativa titulo="Perfumes distintos" comparacion={comparativa.perfumesDistintos} />
        <Comparativa titulo="Rotación" comparacion={comparativa.rotacion} formato="ratio" />
        <Comparativa titulo="Tasa de acierto" comparacion={comparativa.tasaAcierto} formato="pct" />
      </section>
      <p className="text-xs text-texto-tenue">
        Rotación: {indicadores.perfumesDistintos} perfumes distintos sobre {datos.totalColeccion} en
        colección. Comparado con los {rango.desde} a {rango.hasta} del periodo anterior equivalente.
      </p>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Más usados</h2>
        {datos.ranking.length === 0 ? (
          <p className="text-sm text-texto-tenue">Sin registros en el periodo.</p>
        ) : (
          <ul className="space-y-1">
            {datos.ranking.slice(0, 15).map((fila, i) => (
              <li key={fila.id}>
                <Link href={`/coleccion/${fila.id}`} className="fila-toque justify-between">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="mr-2 text-texto-tenue">{i + 1}.</span>
                    {fila.nombre}
                    <span className="text-sm text-texto-tenue"> · {fila.marca}</span>
                  </span>
                  <span className="etiqueta text-xs">{fila.usos}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Sin usar en el periodo ({datos.sinUsar.length})</h2>
        <ul className="space-y-1">
          {datos.sinUsar.slice(0, 20).map((fila) => (
            <li key={fila.id}>
              <Link href={`/coleccion/${fila.id}`} className="fila-toque justify-between">
                <span className="min-w-0 flex-1 truncate">{fila.nombre}</span>
                <span className="text-xs text-texto-tenue">
                  {fila.ultimoUso ? formatearFecha(fila.ultimoUso) : 'nunca'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Barras titulo="Por familia olfativa" datos={datos.porFamilia} />
      <Barras titulo="Notas más frecuentes" datos={datos.porNota} />
      <Barras titulo="Por contexto" datos={datos.porContexto} />
      <Barras
        titulo="Por momento"
        datos={datos.porMomento.map((f) => ({
          nombre: f.momento === 'DIA' ? 'Día' : 'Noche',
          usos: f.usos,
        }))}
      />
      <Barras
        titulo="Por estación efectiva"
        datos={datos.porEstacion.map((f) => ({
          nombre: NOMBRE_ESTACION[f.estacion],
          usos: f.usos,
        }))}
      />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Promedios de aplicación</h2>
        <dl className="grid grid-cols-3 gap-2 text-sm">
          <div className="bg-superficie-alta px-3 py-2">
            <dt className="text-xs uppercase text-texto-tenue">Sprays</dt>
            <dd className="font-semibold">{datos.promedios.spraysMedios ?? '—'}</dd>
          </div>
          <div className="bg-superficie-alta px-3 py-2">
            <dt className="text-xs uppercase text-texto-tenue">Duración</dt>
            <dd className="font-semibold">
              {datos.promedios.duracionMasFrecuente
                ? DURACION_LEGIBLE[datos.promedios.duracionMasFrecuente]
                : '—'}
            </dd>
          </div>
          <div className="bg-superficie-alta px-3 py-2">
            <dt className="text-xs uppercase text-texto-tenue">Valoración</dt>
            <dd className="font-semibold">{datos.promedios.valoracionMedia ?? '—'}</dd>
          </div>
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Días con registro</h2>
        <Heatmap semanas={rejillaHeatmap(rango, datos.heatmap)} hasta={rango.hasta} />
      </section>
    </div>
  );
}
