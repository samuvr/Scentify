/**
 * Copia automatica antes de migrar.
 *
 * Las migraciones se aplican solas en cada despliegue de produccion, y la
 * unica copia era la que se descarga a mano. Si hay migraciones pendientes y
 * estan NEON_API_KEY y NEON_PROJECT_ID, se crea antes una rama de Neon: una
 * copia instantanea de la base entera, sin coste de almacenamiento mientras no
 * diverja, a la que se puede volver desde la consola de Neon.
 *
 * Sin esas variables solo se avisa en el log del despliegue: no se rompe el
 * despliegue de nadie que no las haya puesto.
 */

const API = 'https://console.neon.tech/api/v2';
/** Se guardan las ultimas; Neon limita las ramas por proyecto. */
export const RAMAS_A_CONSERVAR = 3;
export const PREFIJO_RAMA = 'antes-de-';

interface EntradaDiario {
  tag: string;
  when: number;
}

/**
 * Las migraciones del diario que la base aun no tiene. Drizzle guarda en
 * `created_at` el `when` de cada una, asi que basta comparar con el mayor.
 */
export function migracionesPendientes(
  diario: EntradaDiario[],
  ultimaAplicada: number | null,
): string[] {
  return diario.filter((e) => ultimaAplicada === null || e.when > ultimaAplicada).map((e) => e.tag);
}

/** Nombre de la rama: dice que migracion venia y cuando se hizo. */
export function nombreDeRama(pendientes: string[], ahora = new Date()): string {
  const fecha = ahora.toISOString().slice(0, 16).replace(/[-:T]/g, '');
  return `${PREFIJO_RAMA}${pendientes.at(-1) ?? 'migrar'}-${fecha}`.slice(0, 120);
}

/** Las ramas de seguridad que sobran, de las mas viejas a las mas nuevas. */
export function ramasQueSobran(
  ramas: { id: string; name: string; created_at: string }[],
  conservar = RAMAS_A_CONSERVAR,
): string[] {
  const nuestras = ramas
    .filter((r) => r.name.startsWith(PREFIJO_RAMA))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  return nuestras.slice(0, Math.max(0, nuestras.length - conservar)).map((r) => r.id);
}

/**
 * Crea la rama si se puede. Si las variables estan puestas y la rama no se
 * puede crear, lanza: mejor un despliegue fallido (la version publicada sigue
 * funcionando) que migrar sin la copia que se ha pedido.
 */
export async function crearRamaDeSeguridad(pendientes: string[]): Promise<void> {
  const clave = process.env.NEON_API_KEY;
  const proyecto = process.env.NEON_PROJECT_ID;
  if (!clave || !proyecto) {
    console.warn(
      `Hay ${pendientes.length} migraciones pendientes y no se hace copia antes: ` +
        'define NEON_API_KEY y NEON_PROJECT_ID para crear una rama de Neon antes de migrar.',
    );
    return;
  }

  const cabeceras = {
    authorization: `Bearer ${clave}`,
    accept: 'application/json',
    'content-type': 'application/json',
  };
  const nombre = nombreDeRama(pendientes);
  const padre = process.env.NEON_BRANCH_ID;
  const respuesta = await fetch(`${API}/projects/${proyecto}/branches`, {
    method: 'POST',
    headers: cabeceras,
    body: JSON.stringify({ branch: { name: nombre, ...(padre ? { parent_id: padre } : {}) } }),
  });
  if (!respuesta.ok) {
    throw new Error(
      `No se ha podido crear la rama de seguridad (${respuesta.status}): no se migra. ` +
        (await respuesta.text()).slice(0, 300),
    );
  }
  console.log(`Copia antes de migrar: rama «${nombre}» creada en Neon.`);

  // Limpieza de las viejas: si falla, se avisa y se sigue.
  try {
    const lista = await fetch(`${API}/projects/${proyecto}/branches`, { headers: cabeceras });
    if (!lista.ok) throw new Error(`estado ${lista.status}`);
    const { branches = [] } = (await lista.json()) as {
      branches?: { id: string; name: string; created_at: string }[];
    };
    for (const id of ramasQueSobran(branches)) {
      await fetch(`${API}/projects/${proyecto}/branches/${id}`, { method: 'DELETE', headers: cabeceras });
    }
  } catch (error) {
    console.warn('No se han podido borrar las ramas de seguridad viejas:', error);
  }
}
