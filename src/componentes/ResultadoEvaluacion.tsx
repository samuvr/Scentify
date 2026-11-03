/**
 * El resultado de «¿Merece la pena?»: el veredicto arriba, con su porque, y
 * debajo las casillas que cubriria, primero donde suma y luego donde ya vas
 * servido (con los perfumes con los que competiria). Si se parece a algo que
 * ya tienes, se dice antes que nada de las casillas.
 */
import Link from 'next/link';
import type {
  CasillaEvaluada,
  EvaluacionCompra,
  Veredicto,
} from '@/dominio/evaluacion-compra';
import { recuentoPorNivel } from '@/dominio/evaluacion-compra';
import type { NivelReparto } from '@/dominio/reparto';
import type { Estacion, Momento } from '@/dominio/tipos';

const VEREDICTO: Record<Veredicto, { titulo: string; clase: string }> = {
  merece: { titulo: 'Merece la pena', clase: 'border-id-total bg-id-total/10' },
  aporta: { titulo: 'Aporta algo', clase: 'border-id-parcial bg-id-parcial/10' },
  prescindible: { titulo: 'Compra prescindible', clase: 'border-id-nula bg-id-nula/10' },
  'sin-datos': { titulo: 'No se puede valorar', clase: 'border-borde bg-superficie-alta' },
};

const NIVEL: Record<NivelReparto, string> = {
  vacia: 'vacía',
  escasa: 'escasa',
  normal: 'bien',
  holgada: 'holgada',
  'sin-uso': 'sin uso',
  'sin-frecuencia': '—',
};

const BORDE_NIVEL: Record<NivelReparto, string> = {
  vacia: 'border-id-nula',
  escasa: 'border-id-parcial',
  normal: 'border-id-total',
  holgada: 'border-acento',
  'sin-uso': 'border-borde',
  'sin-frecuencia': 'border-borde',
};

const ESTACION: Record<Estacion, string> = {
  PRIMAVERA: 'Primavera',
  VERANO: 'Verano',
  OTONO: 'Otoño',
  INVIERNO: 'Invierno',
};
const MOMENTO: Record<Momento, string> = { DIA: 'Día', NOCHE: 'Noche' };

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** «A, B y C» */
function enumerar(lista: string[]): string {
  if (lista.length <= 1) return lista.join('');
  return `${lista.slice(0, -1).join(', ')} y ${lista.at(-1)}`;
}

/** El porque del veredicto en una frase. */
export function resumenEvaluacion(ev: EvaluacionCompra): string {
  if (ev.veredicto === 'sin-datos') {
    return 'Los contextos que has marcado no tienen frecuencia de uso, o no existen en los momentos marcados. Ponles frecuencia en Configuración para poder valorarlo.';
  }
  const r = recuentoPorNivel(ev.casillas);
  const suma = [
    r.vacia > 0 ? `llena ${plural(r.vacia, 'casilla vacía', 'casillas vacías')}` : null,
    r.escasa > 0 ? `refuerza ${plural(r.escasa, 'escasa', 'escasas')}` : null,
  ].filter(Boolean) as string[];
  const sobra = [
    r.normal > 0 ? `${plural(r.normal, 'va', 'van')} bien` : null,
    r.holgada > 0 ? `${plural(r.holgada, 'va', 'van')} holgada${r.holgada === 1 ? '' : 's'}` : null,
  ].filter(Boolean) as string[];
  const partes: string[] = [];
  if (suma.length > 0) {
    const texto = enumerar(suma);
    partes.push(`${texto.charAt(0).toUpperCase()}${texto.slice(1)}.`);
  } else {
    partes.push('No llena ninguna casilla floja.');
  }
  if (sobra.length > 0) {
    partes.push(`De las demás que cubre, ${enumerar(sobra)}.`);
  }
  if (ev.parecidos.length > 0 && ev.veredicto !== ev.veredictoPorCasillas) {
    partes.push(
      `Por las casillas sería «${VEREDICTO[ev.veredictoPorCasillas].titulo}», pero se parece a algo que ya tienes.`,
    );
  }
  return partes.join(' ');
}

interface Grupo {
  clave: string;
  contextoId: string;
  momento: Momento | null;
  casillas: CasillaEvaluada[];
}

/** Las estaciones de un mismo contexto y momento, juntas en una fila. */
function agrupar(casillas: CasillaEvaluada[]): Grupo[] {
  const grupos = new Map<string, Grupo>();
  for (const c of casillas) {
    const clave = `${c.contextoId}|${c.momento ?? '-'}`;
    const g = grupos.get(clave) ?? { clave, contextoId: c.contextoId, momento: c.momento, casillas: [] };
    g.casillas.push(c);
    grupos.set(clave, g);
  }
  return [...grupos.values()];
}

function Competidores({ casillas }: { casillas: CasillaEvaluada[] }) {
  const vistos = new Map<string, { id: string; nombre: string }>();
  for (const c of casillas) for (const p of c.competidores) vistos.set(p.id, p);
  const lista = [...vistos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  if (lista.length === 0) return null;
  const MAXIMO = 5;
  return (
    <p className="text-xs text-texto-tenue">
      Compite con{' '}
      {lista.slice(0, MAXIMO).map((p, i) => (
        <span key={p.id}>
          {i > 0 ? (i === Math.min(lista.length, MAXIMO) - 1 && lista.length <= MAXIMO ? ' y ' : ', ') : ''}
          <Link href={`/coleccion/${p.id}`} className="text-texto underline-offset-2 hover:underline">
            {p.nombre}
          </Link>
        </span>
      ))}
      {lista.length > MAXIMO ? ` y ${lista.length - MAXIMO} más` : ''}.
    </p>
  );
}

function FilaGrupo({
  grupo,
  nombres,
  conCompetidores,
}: {
  grupo: Grupo;
  nombres: Record<string, string>;
  conCompetidores: boolean;
}) {
  const titulo = [nombres[grupo.contextoId] ?? '—', grupo.momento ? MOMENTO[grupo.momento] : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <li className="space-y-1.5 border-b border-borde pb-3 last:border-b-0 last:pb-0">
      <p className="font-medium">{titulo}</p>
      <ul className="flex flex-wrap gap-2">
        {grupo.casillas.map((c) => (
          <li
            key={`${c.estacion ?? 'todas'}`}
            className={`border-l-4 bg-superficie-alta px-2 py-1 text-xs ${BORDE_NIVEL[c.antes.nivel]}`}
          >
            <span className="font-semibold">{c.estacion ? ESTACION[c.estacion] : 'Siempre'}</span>{' '}
            <span className="text-texto-tenue">
              {NIVEL[c.antes.nivel]} ({c.antes.cuantos}) → {NIVEL[c.despues.nivel]} ({c.despues.cuantos})
            </span>
          </li>
        ))}
      </ul>
      {conCompetidores ? <Competidores casillas={grupo.casillas} /> : null}
    </li>
  );
}

export function ResultadoEvaluacion({
  evaluacion,
  nombres,
  children,
}: {
  evaluacion: EvaluacionCompra;
  nombres: Record<string, string>;
  /** Las acciones: lo he comprado, a la wishlist, cambiar lo marcado. */
  children?: React.ReactNode;
}) {
  const { titulo, clase } = VEREDICTO[evaluacion.veredicto];
  const suma = evaluacion.casillas.filter((c) => c.antes.nivel === 'vacia' || c.antes.nivel === 'escasa');
  const servido = evaluacion.casillas.filter(
    (c) => c.antes.nivel === 'normal' || c.antes.nivel === 'holgada',
  );

  return (
    <div className="space-y-5">
      <section className={`space-y-2 border-l-4 p-4 ${clase}`} aria-live="polite">
        <p className="font-display text-2xl">{titulo}</p>
        <p className="text-sm">{resumenEvaluacion(evaluacion)}</p>
      </section>

      {evaluacion.parecidos.length > 0 ? (
        <section className="aviso-atencion space-y-2">
          <p className="font-semibold">Se parece a lo que ya tienes</p>
          <ul className="space-y-1 text-sm">
            {evaluacion.parecidos.map((p) => (
              <li key={p.perfumeId}>
                <Link href={`/coleccion/${p.perfumeId}`} className="font-medium underline">
                  {p.nombre}
                </Link>
                <span className="text-texto-tenue">
                  {' '}
                  ·{' '}
                  {[
                    p.comunes.length > 0 ? `comparten fondo: ${p.comunes.join(', ')}` : null,
                    p.segunFragrantica ? 'Fragrantica dice que lo recuerda' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {suma.length > 0 ? (
        <section className="space-y-2">
          <h2 className="subtitulo">Donde suma</h2>
          <ul className="tarjeta space-y-3">
            {agrupar(suma).map((g) => (
              <FilaGrupo key={g.clave} grupo={g} nombres={nombres} conCompetidores={false} />
            ))}
          </ul>
        </section>
      ) : null}

      {servido.length > 0 ? (
        <section className="space-y-2">
          <h2 className="subtitulo">Donde ya vas servido</h2>
          <ul className="tarjeta space-y-3">
            {agrupar(servido).map((g) => (
              <FilaGrupo key={g.clave} grupo={g} nombres={nombres} conCompetidores />
            ))}
          </ul>
        </section>
      ) : null}

      {evaluacion.contextosSinJuzgar.length > 0 ? (
        <p className="text-sm text-texto-tenue">
          Sin valorar:{' '}
          {evaluacion.contextosSinJuzgar.map((id) => nombres[id] ?? '—').join(', ')}. No tienen
          frecuencia de uso, o no existen en los momentos marcados.{' '}
          <Link href="/mas/configuracion" className="underline">
            Configuración
          </Link>
        </p>
      ) : null}

      {children}
    </div>
  );
}
