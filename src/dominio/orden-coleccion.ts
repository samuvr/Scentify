/** Los ordenes de la lista de la coleccion y su sentido. */
export type OrdenColeccion = "nombre" | "marca" | "ultimo-uso" | "mas-usado";
export type SentidoOrden = "asc" | "desc";

/**
 * El sentido natural de cada orden: el nombre y la marca de la A a la Z; el
 * uso, lo mas reciente o lo mas usado primero.
 */
export function sentidoPorDefecto(
  orden: OrdenColeccion = "nombre",
): SentidoOrden {
  return orden === "ultimo-uso" || orden === "mas-usado" ? "desc" : "asc";
}
