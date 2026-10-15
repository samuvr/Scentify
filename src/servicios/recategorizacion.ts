/**
 * Recategorizacion con evidencia: lee los usos y los descartes, deja que el
 * dominio proponga, y aplica o rechaza cada propuesta de una en una.
 */
import 'server-only';
import { and, eq, gte, inArray } from 'drizzle-orm';
import { crearDb, schema } from '@/db';
import {
  desajustesDeMarcas,
  REGLAS,
  restarDias,
  type DescarteParaEvidencia,
  type EjeMarca,
  type PropuestaMarca,
  type PropuestaRechazada,
  type UsoParaEvidencia,
} from '@/dominio/recategorizacion';
import { ESTACIONES, MOMENTOS } from '@/dominio/huecos';
import type { Estacion, Momento } from '@/dominio/tipos';
import { candidatosParaRecomendar } from './consultas';
import { guardarAjuste, leerAjuste } from './ajustes';
import { ErrorValidacion } from './perfumes';

const CLAVE_RECHAZOS = 'recategorizacion_descartada';

async function rechazosVigentes(userId: string, hoy: string): Promise<PropuestaRechazada[]> {
  const valor = await leerAjuste(userId, CLAVE_RECHAZOS);
  if (!Array.isArray(valor)) return [];
  return valor.filter(
    (r): r is PropuestaRechazada =>
      typeof r === 'object' &&
      r !== null &&
      typeof r.perfumeId === 'string' &&
      typeof r.eje === 'string' &&
      typeof r.valor === 'string' &&
      typeof r.hasta === 'string' &&
      r.hasta >= hoy,
  );
}

/** Usos del ultimo año y descartes recientes, agrupados por perfume. */
async function evidencia(userId: string, hoy: string, perfumeIds?: string[]) {
  const db = crearDb();
  const desde = restarDias(hoy, REGLAS.diasParaQuitar);
  const desdeDescartes = restarDias(hoy, REGLAS.diasParaAñadir);
  const u = schema.uso;
  const d = schema.recomendacionDescarte;
  const [usos, descartes] = await Promise.all([
    db
      .select({
        perfumeId: u.perfumeId,
        fecha: u.fecha,
        momento: u.momento,
        contextoId: u.contextoId,
        estaciones: u.estacionesEfectivas,
        origenEstacion: u.origenEstacion,
        valoracionDia: u.valoracionDia,
      })
      .from(u)
      .where(
        and(
          eq(u.userId, userId),
          gte(u.fecha, desde),
          perfumeIds ? inArray(u.perfumeId, perfumeIds) : undefined,
        ),
      ),
    db
      .select({ perfumeId: d.perfumeId, fecha: d.fecha, contextoId: d.contextoId, momento: d.momento })
      .from(d)
      .where(
        and(
          eq(d.userId, userId),
          gte(d.fecha, desdeDescartes),
          perfumeIds ? inArray(d.perfumeId, perfumeIds) : undefined,
        ),
      ),
  ]);

  const usosPorPerfume = new Map<string, UsoParaEvidencia[]>();
  for (const { perfumeId, ...resto } of usos) {
    const lista = usosPorPerfume.get(perfumeId) ?? [];
    lista.push(resto);
    usosPorPerfume.set(perfumeId, lista);
  }
  const descartesPorPerfume = new Map<string, DescarteParaEvidencia[]>();
  for (const { perfumeId, ...resto } of descartes) {
    const lista = descartesPorPerfume.get(perfumeId) ?? [];
    lista.push(resto);
    descartesPorPerfume.set(perfumeId, lista);
  }
  return { usosPorPerfume, descartesPorPerfume };
}

export interface PropuestaDePerfume extends PropuestaMarca {
  perfumeId: string;
  nombre: string;
  marca: string;
}

/**
 * Las propuestas de toda la coleccion que se tiene (LO_TENGO, sin archivar),
 * de mas a menos peso. Las usan la ficha, Huecos y Estadisticas.
 */
export async function propuestasDeLaColeccion(
  userId: string,
  hoy: string,
  perfumeId?: string,
): Promise<PropuestaDePerfume[]> {
  const [coleccion, rechazadas, { usosPorPerfume, descartesPorPerfume }] = await Promise.all([
    candidatosParaRecomendar(userId),
    rechazosVigentes(userId, hoy),
    evidencia(userId, hoy, perfumeId ? [perfumeId] : undefined),
  ]);

  const propuestas: PropuestaDePerfume[] = [];
  for (const p of coleccion) {
    if (p.estado !== 'LO_TENGO' || p.archivado) continue;
    if (perfumeId && p.id !== perfumeId) continue;
    const usos = usosPorPerfume.get(p.id) ?? [];
    if (usos.length === 0) continue;
    for (const propuesta of desajustesDeMarcas({
      perfumeId: p.id,
      usos,
      marcas: { contextos: p.contextos, momentos: p.momentos, estaciones: p.estaciones },
      descartes: descartesPorPerfume.get(p.id) ?? [],
      hoy,
      rechazadas,
    })) {
      propuestas.push({ ...propuesta, perfumeId: p.id, nombre: p.nombre, marca: p.marca });
    }
  }
  return propuestas.sort((a, b) => b.peso - a.peso);
}

/**
 * Aplica UNA propuesta: añade o quita esa marca y nada mas, sin pasar por el
 * editor. El perfume y el contexto tienen que ser de la cuenta, y ningun eje
 * puede quedarse vacio. Los usos ya registrados no cambian (criterio 10).
 */
export async function ajustarMarca(
  userId: string,
  perfumeId: string,
  eje: EjeMarca,
  valor: string,
  accion: 'añadir' | 'quitar',
): Promise<void> {
  const db = crearDb();
  const [propio] = await db
    .select({ id: schema.perfume.id })
    .from(schema.perfume)
    .where(and(eq(schema.perfume.userId, userId), eq(schema.perfume.id, perfumeId)))
    .limit(1);
  if (!propio) throw new ErrorValidacion('Perfume no encontrado.');

  if (eje === 'contexto') {
    const [contexto] = await db
      .select({ id: schema.contexto.id })
      .from(schema.contexto)
      .where(and(eq(schema.contexto.userId, userId), eq(schema.contexto.id, valor)))
      .limit(1);
    if (!contexto) throw new ErrorValidacion('Contexto no encontrado.');
    const t = schema.perfumeContexto;
    if (accion === 'añadir') {
      await db.insert(t).values({ perfumeId, contextoId: valor }).onConflictDoNothing();
      return;
    }
    const actuales = await db.select().from(t).where(eq(t.perfumeId, perfumeId));
    if (actuales.length <= 1) throw new ErrorValidacion('Tiene que quedar al menos un contexto.');
    await db.delete(t).where(and(eq(t.perfumeId, perfumeId), eq(t.contextoId, valor)));
    return;
  }

  if (eje === 'momento') {
    if (!MOMENTOS.includes(valor as Momento)) throw new ErrorValidacion('Momento no válido.');
    const t = schema.perfumeMomento;
    if (accion === 'añadir') {
      await db.insert(t).values({ perfumeId, momento: valor as Momento }).onConflictDoNothing();
      return;
    }
    const actuales = await db.select().from(t).where(eq(t.perfumeId, perfumeId));
    if (actuales.length <= 1) throw new ErrorValidacion('Tiene que quedar al menos un momento.');
    await db.delete(t).where(and(eq(t.perfumeId, perfumeId), eq(t.momento, valor as Momento)));
    return;
  }

  if (!ESTACIONES.includes(valor as Estacion)) throw new ErrorValidacion('Estación no válida.');
  const t = schema.perfumeEstacion;
  if (accion === 'añadir') {
    await db.insert(t).values({ perfumeId, estacion: valor as Estacion }).onConflictDoNothing();
    return;
  }
  const actuales = await db.select().from(t).where(eq(t.perfumeId, perfumeId));
  if (actuales.length <= 1) throw new ErrorValidacion('Tiene que quedar al menos una estación.');
  await db.delete(t).where(and(eq(t.perfumeId, perfumeId), eq(t.estacion, valor as Estacion)));
}

/** «Fue casualidad»: esa propuesta no vuelve en 90 dias. */
export async function rechazarPropuesta(
  userId: string,
  perfumeId: string,
  eje: EjeMarca,
  valor: string,
  hoy: string,
): Promise<void> {
  const vigentes = await rechazosVigentes(userId, hoy);
  const hasta = new Date(Date.parse(`${hoy}T00:00:00Z`) + REGLAS.diasDeRechazo * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const resto = vigentes.filter(
    (r) => !(r.perfumeId === perfumeId && r.eje === eje && r.valor === valor),
  );
  await guardarAjuste(userId, CLAVE_RECHAZOS, [...resto, { perfumeId, eje, valor, hasta }]);
}
