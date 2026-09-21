/** Seccion 4.5 — Wishlist. CRUD sencillo con los tres niveles de prioridad. */
import 'server-only';
import { and, eq } from 'drizzle-orm';
import { crearDb, schema } from '@/db';

export interface DatosDeseo {
  nombre: string;
  marca: string;
  prioridad: 'EN_EL_RADAR' | 'LO_QUIERO' | 'LO_NECESITO';
  /** Precio maximo que estoy dispuesto a pagar, no una estimacion de mercado. */
  precioObjetivo?: number | null;
  notas?: string | null;
  fragranticaUrl?: string | null;
}

const aFila = (datos: DatosDeseo) => ({
  nombre: datos.nombre.trim(),
  marca: datos.marca.trim(),
  prioridad: datos.prioridad,
  precioObjetivo: datos.precioObjetivo == null ? null : datos.precioObjetivo.toFixed(2),
  notas: datos.notas?.trim() || null,
  fragranticaUrl: datos.fragranticaUrl?.trim() || null,
});

export async function crearDeseo(userId: string, datos: DatosDeseo): Promise<void> {
  const db = crearDb();
  await db.insert(schema.wishlist).values({ userId, ...aFila(datos) });
}

export async function actualizarDeseo(
  userId: string,
  id: string,
  datos: DatosDeseo,
): Promise<void> {
  const db = crearDb();
  await db
    .update(schema.wishlist)
    .set(aFila(datos))
    .where(and(eq(schema.wishlist.userId, userId), eq(schema.wishlist.id, id)));
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
