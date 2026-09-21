/**
 * Seccion 7.2 — "Recomiendame un perfume".
 *
 * Pregunta solo momento y contexto; la estacion la deduce la 7.1 del tiempo
 * real, la enseña con su explicacion y deja sobrescribirla.
 */
import { redirect } from 'next/navigation';
import { listarContextos, candidatosParaRecomendar, descartesDeHoy } from '@/servicios/consultas';
import { estacionEfectivaDe, hoyIso } from '@/servicios/usos';
import { usuarioActual } from '@/servicios/auth';
import { recomendar } from '@/dominio/recomendacion';
import type { Estacion, Momento } from '@/dominio/tipos';
import { TarjetaRecomendacion, BloqueSinEstrenar } from './Tarjetas';
import { SelectorPeticion } from './SelectorPeticion';

export const dynamic = 'force-dynamic';

const ESTACIONES: Estacion[] = ['PRIMAVERA', 'VERANO', 'OTONO', 'INVIERNO'];

function leerEstaciones(valor: string | undefined): Estacion[] | null {
  if (!valor) return null;
  const elegidas = valor.split(',').filter((e): e is Estacion => ESTACIONES.includes(e as Estacion));
  return elegidas.length > 0 ? elegidas : null;
}

export default async function PaginaRecomendacion({
  searchParams,
}: {
  searchParams: Promise<{ momento?: string; contexto?: string; estaciones?: string }>;
}) {
  const userId = await usuarioActual();
  if (!userId) redirect('/login');

  const parametros = await searchParams;
  const hoy = hoyIso();
  const momento: Momento = parametros.momento === 'NOCHE' ? 'NOCHE' : 'DIA';

  const [contextos, candidatos, descartados, estacionCalculada] = await Promise.all([
    listarContextos(userId),
    candidatosParaRecomendar(userId),
    descartesDeHoy(userId, hoy),
    estacionEfectivaDe(userId, hoy, momento),
  ]);

  const contextoElegido =
    contextos.find((c) => c.id === parametros.contexto) ?? contextos[0] ?? null;

  // La estacion propuesta siempre es sobrescribible (7.1).
  const forzadas = leerEstaciones(parametros.estaciones);
  const estacionesCompatibles = forzadas ?? estacionCalculada.estaciones;

  const resultado = contextoElegido
    ? recomendar({
        coleccion: candidatos,
        momento,
        contextoId: contextoElegido.id,
        estacionesCompatibles,
        hoy,
        descartados,
        nombreContexto: contextoElegido.nombre,
      })
    : { recomendaciones: [], nuncaUsados: [] };

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Recomiéndame</h1>
        <p className="text-sm text-texto-tenue">
          {forzadas ? 'Estación elegida a mano.' : estacionCalculada.explicacion}
          {estacionCalculada.origen === 'CALENDARIO' && !forzadas ? ' Sin conexión con Open-Meteo.' : ''}
        </p>
      </header>

      <SelectorPeticion
        contextos={contextos.map((c) => ({ id: c.id, nombre: c.nombre }))}
        momento={momento}
        contextoId={contextoElegido?.id ?? ''}
        estacionesCompatibles={estacionesCompatibles}
        estacionesPropuestas={estacionCalculada.estaciones}
        sobrescrita={forzadas !== null}
      />

      {resultado.recomendaciones.length > 0 ? (
        <ul className="space-y-3">
          {resultado.recomendaciones.map((r) => (
            <TarjetaRecomendacion
              key={r.perfume.id}
              recomendacion={r}
              momento={momento}
              contextoId={contextoElegido?.id ?? ''}
              fecha={hoy}
            />
          ))}
        </ul>
      ) : (
        <p className="tarjeta text-sm text-texto-tenue">
          No hay ningún perfume que encaje del todo ni a medias con esta combinación. Prueba con
          otro contexto, u ojea el bloque de abajo.
        </p>
      )}

      <BloqueSinEstrenar
        perfumes={resultado.nuncaUsados}
        momento={momento}
        contextoId={contextoElegido?.id ?? ''}
        fecha={hoy}
      />
    </div>
  );
}
