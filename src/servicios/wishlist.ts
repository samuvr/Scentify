/** Seccion 4.5 — Wishlist. CRUD sencillo con los tres niveles de prioridad. */
import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { crearDb, schema } from '@/db';
import { detectarSolapamiento, type Solapamiento } from '@/dominio/solapamiento';
import { normalizar } from '@/dominio/texto';

export interface DatosDeseo {
  nombre: string;
  marca: string;
  prioridad: 'EN_EL_RADAR' | 'LO_QUIERO' | 'LO_NECESITO';
  /** Precio maximo que estoy dispuesto a pagar, no una estimacion de mercado. */
  precioObjetivo?: number | null;
  notas?: string | null;
  fragranticaUrl?: string | null;
  /** Notas de fondo, para el aviso de solapamiento de la seccion 10.2. */
  notasFondo?: string[];
}

const aFila = (datos: DatosDeseo) => ({
  nombre: datos.nombre.trim(),
  marca: datos.marca.trim(),
  prioridad: datos.prioridad,
  precioObjetivo: datos.precioObjetivo == null ? null : datos.precioObjetivo.toFixed(2),
  notas: datos.notas?.trim() || null,
  fragranticaUrl: datos.fragranticaUrl?.trim() || null,
});

export async function crearDeseo(userId: string, datos: DatosDeseo): Promise<string> {
  const db = crearDb();
  const [creado] = await db
    .insert(schema.wishlist)
    .values({ userId, ...aFila(datos) })
    .returning({ id: schema.wishlist.id });
  if (!creado) throw new Error('No se pudo crear el deseo.');

  await guardarNotasFondo(creado.id, datos.notasFondo ?? []);
  return creado.id;
}

export async function actualizarDeseo(
  userId: string,
  id: string,
  datos: DatosDeseo,
): Promise<void> {
  const db = crearDb();
  const actualizados = await db
    .update(schema.wishlist)
    .set(aFila(datos))
    .where(and(eq(schema.wishlist.userId, userId), eq(schema.wishlist.id, id)))
    .returning({ id: schema.wishlist.id });

  // Las notas de fondo no llevan `user_id`: solo se tocan si el deseo es suyo.
  if (actualizados.length === 0) return;
  await guardarNotasFondo(id, datos.notasFondo ?? []);
}

export async function borrarDeseo(userId: string, id: string): Promise<void> {
  const db = crearDb();
  await db
    .delete(schema.wishlist)
    .where(and(eq(schema.wishlist.userId, userId), eq(schema.wishlist.id, id)));
}

/** "Convertir en coleccion": marca el deseo como convertido (4.5). */
export async function marcarConvertido(
  userId: string,
  deseoId: string,
  perfumeId: string,
): Promise<void> {
  const db = crearDb();
  await db
    .update(schema.wishlist)
    .set({ convertidoAPerfumeId: perfumeId })
    .where(and(eq(schema.wishlist.userId, userId), eq(schema.wishlist.id, deseoId)));
}

/* ------------------------------------------------------- notas de fondo */

/** Crea las notas que falten y devuelve sus ids, como en el alta de perfumes. */
async function resolverNotas(nombres: string[]): Promise<string[]> {
  const db = crearDb();
  const limpias = nombres
    .map((nombre) => ({ nombre: nombre.trim(), nombreNormalizado: normalizar(nombre) }))
    .filter(
      (n, i, lista) =>
        n.nombreNormalizado &&
        lista.findIndex((o) => o.nombreNormalizado === n.nombreNormalizado) === i,
    );
  if (limpias.length === 0) return [];

  await db
    .insert(schema.nota)
    .values(limpias)
    .onConflictDoNothing({ target: schema.nota.nombreNormalizado });

  const filas = await db
    .select({ id: schema.nota.id, normalizado: schema.nota.nombreNormalizado })
    .from(schema.nota)
    .where(inArray(schema.nota.nombreNormalizado, limpias.map((n) => n.nombreNormalizado)));

  // Se conserva el orden en que las escribio el usuario.
  const porNombre = new Map(filas.map((f) => [f.normalizado, f.id]));
  return limpias
    .map((n) => porNombre.get(n.nombreNormalizado))
    .filter((id): id is string => Boolean(id));
}

async function guardarNotasFondo(deseoId: string, nombres: string[]): Promise<void> {
  const db = crearDb();
  await db.delete(schema.wishlistNota).where(eq(schema.wishlistNota.wishlistId, deseoId));

  const ids = await resolverNotas(nombres);
  if (ids.length === 0) return;
  await db
    .insert(schema.wishlistNota)
    .values(ids.map((notaId, orden) => ({ wishlistId: deseoId, notaId, orden })));
}

export async function notasFondoDeDeseo(deseoId: string): Promise<string[]> {
  const db = crearDb();
  const filas = await db
    .select({ nombre: schema.nota.nombre })
    .from(schema.wishlistNota)
    .innerJoin(schema.nota, eq(schema.nota.id, schema.wishlistNota.notaId))
    .where(eq(schema.wishlistNota.wishlistId, deseoId))
    .orderBy(schema.wishlistNota.orden);
  return filas.map((f) => f.nombre);
}

/**
 * Seccion 10.2 — Perfumes de la coleccion que comparten tres o mas notas de
 * fondo con estas. Avisa, no bloquea.
 */
export async function solapamientoConLaColeccion(
  userId: string,
  notasFondo: string[],
): Promise<Solapamiento[]> {
  if (notasFondo.length === 0) return [];
  const db = crearDb();

  const filas = await db
    .select({
      id: schema.perfume.id,
      nombre: schema.ficha.nombre,
      marca: schema.ficha.marca,
      nota: schema.nota.nombre,
    })
    .from(schema.perfume)
    .innerJoin(schema.ficha, eq(schema.ficha.id, schema.perfume.fichaId))
    .innerJoin(schema.fichaNota, eq(schema.fichaNota.fichaId, schema.perfume.fichaId))
    .innerJoin(schema.nota, eq(schema.nota.id, schema.fichaNota.notaId))
    .where(
      and(
        eq(schema.perfume.userId, userId),
        eq(schema.perfume.archivado, false),
        eq(schema.fichaNota.nivel, 'FONDO'),
      ),
    );

  const porPerfume = new Map<
    string,
    { id: string; nombre: string; marca: string; notasFondo: string[] }
  >();
  for (const fila of filas) {
    const actual = porPerfume.get(fila.id) ?? {
      id: fila.id,
      nombre: fila.nombre,
      marca: fila.marca,
      notasFondo: [],
    };
    actual.notasFondo.push(fila.nota);
    porPerfume.set(fila.id, actual);
  }

  return detectarSolapamiento(notasFondo, [...porPerfume.values()]);
}
