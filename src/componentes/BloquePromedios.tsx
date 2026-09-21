/**
 * Seccion 4.3 — El bloque de promedios aparece en tres sitios: la ficha, la
 * tarjeta de recomendacion y el formulario de registro al elegir el perfume,
 * para saber de antemano cuantos sprays echarse y que esperar.
 */
import type { DuracionPercibida, PromediosPerfume } from '@/dominio/tipos';

export const DURACION_LEGIBLE: Record<DuracionPercibida, string> = {
  MENOS_2H: 'menos de 2h',
  DE_2_4H: '2-4h',
  DE_4_6H: '4-6h',
  DE_6_8H: '6-8h',
  MAS_8H: 'más de 8h',
};

export function BloquePromedios({
  promedios,
  vecesUsado,
  ultimoUso,
}: {
  promedios: PromediosPerfume;
  vecesUsado?: number;
  ultimoUso?: string | null;
}) {
  const datos: { etiqueta: string; valor: string }[] = [];

  if (vecesUsado !== undefined) {
    datos.push({ etiqueta: 'Veces usado', valor: String(vecesUsado) });
  }
  if (ultimoUso !== undefined) {
    datos.push({ etiqueta: 'Último uso', valor: ultimoUso ? formatearFecha(ultimoUso) : 'nunca' });
  }
  if (promedios.spraysHabituales !== null) {
    datos.push({ etiqueta: 'Sprays', valor: `${promedios.spraysHabituales}` });
  }
  if (promedios.duracionEsperada !== null) {
    datos.push({ etiqueta: 'Suele durar', valor: DURACION_LEGIBLE[promedios.duracionEsperada] });
  }
  if (promedios.valoracionMedia !== null) {
    datos.push({ etiqueta: 'Valoración', valor: `${promedios.valoracionMedia} / 5` });
  }

  if (datos.length === 0) {
    return <p className="text-sm text-texto-tenue">Todavía no lo has usado nunca.</p>;
  }

  return (
    <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
      {datos.map(({ etiqueta, valor }) => (
        <div key={etiqueta} className="rounded-xl bg-superficie-alta px-3 py-2">
          <dt className="text-xs uppercase tracking-wide text-texto-tenue">{etiqueta}</dt>
          <dd className="font-semibold">{valor}</dd>
        </div>
      ))}
    </dl>
  );
}

export function formatearFecha(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}
