'use server';

/**
 * Acciones de servidor. Todo lo que muta pasa por aqui, siempre con el usuario
 * de la sesion resuelto en el servidor: el cliente nunca manda un `user_id`.
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { destinoSeguro } from '@/dominio/navegacion';
import { cerrarSesion, exigirUsuario, iniciarSesion } from '@/servicios/auth';
import {
  actualizarPerfume,
  archivarPerfume,
  cambiarEstado,
  crearPerfume,
  ErrorValidacion,
  type DatosPerfume,
} from '@/servicios/perfumes';
import {
  crearDeseo,
  actualizarDeseo,
  borrarDeseo,
  solapamientoConLaColeccion,
} from '@/servicios/wishlist';
import { guardarSuscripcion, borrarSuscripcion } from '@/servicios/recordatorio';
import {
  importarColeccion,
  previsualizarImportacion,
  restaurarCopia,
  type Copia,
  type PrevisualizacionImportacion,
  type ResultadoImportacionFinal,
} from '@/servicios/datos';
import { guardarAjuste, guardarUmbrales } from '@/servicios/ajustes';
import {
  borrarUso,
  completarUso,
  descartarRecomendacion,
  hoyIso,
  previsualizarIdoneidad,
  registrarUso,
  type DatosUso,
} from '@/servicios/usos';

const ESTACIONES = ['PRIMAVERA', 'VERANO', 'OTONO', 'INVIERNO'] as const;
const MOMENTOS = ['DIA', 'NOCHE'] as const;
const DURACIONES = ['MENOS_2H', 'DE_2_4H', 'DE_4_6H', 'DE_6_8H', 'MAS_8H'] as const;

const esquemaUso = z.object({
  id: z.string().uuid().optional(),
  perfumeId: z.string().uuid(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  momento: z.enum(MOMENTOS),
  contextoId: z.string().uuid(),
  sprays: z.coerce.number().int().min(0).max(100).nullable().optional(),
  duracionPercibida: z.enum(DURACIONES).nullable().optional(),
  valoracionDia: z.coerce.number().int().min(1).max(5).nullable().optional(),
  comentario: z.string().max(2000).nullable().optional(),
  estacionesForzadas: z.array(z.enum(ESTACIONES)).optional(),
});

/** Convierte un FormData en objeto, tratando los vacios como ausentes. */
function desdeFormulario(datos: FormData): Record<string, unknown> {
  const objeto: Record<string, unknown> = {};
  for (const [clave, valor] of datos.entries()) {
    if (typeof valor !== 'string' || valor === '') continue;
    objeto[clave] = valor;
  }
  const estaciones = datos.getAll('estacionesForzadas').filter((v) => typeof v === 'string');
  if (estaciones.length > 0) objeto.estacionesForzadas = estaciones;
  return objeto;
}

/* ------------------------------------------------------------------ sesion */

export async function accionIniciarSesion(_previo: string | null, datos: FormData) {
  const email = String(datos.get('email') ?? '');
  const clave = String(datos.get('password') ?? '');
  if (!(await iniciarSesion(email, clave))) return 'Correo o contraseña incorrectos.';
  redirect(destinoSeguro(datos.get('siguiente')));
}

export async function accionCerrarSesion() {
  await cerrarSesion();
  redirect('/login');
}

/* -------------------------------------------------------------------- usos */

export async function accionRegistrarUso(_previo: unknown, datos: FormData) {
  const userId = await exigirUsuario();
  const analisis = esquemaUso.safeParse(desdeFormulario(datos));
  if (!analisis.success) {
    return { ok: false as const, error: 'Faltan datos del registro.' };
  }

  const resultado = await registrarUso(userId, analisis.data as DatosUso);
  revalidatePath('/');
  revalidatePath('/coleccion');
  revalidatePath('/estadisticas');

  return {
    ok: true as const,
    id: resultado.id,
    yaExistia: resultado.yaExistia,
    idoneidad: resultado.idoneidad,
    estacion: resultado.estacion,
  };
}

/** "Me lo pongo" de la recomendacion: un toque, sin volver a pedir nada. */
export async function accionRegistrarDesdeRecomendacion(datos: FormData) {
  const userId = await exigirUsuario();
  const analisis = esquemaUso.safeParse(desdeFormulario(datos));
  if (!analisis.success) return;
  await registrarUso(userId, analisis.data as DatosUso);
  revalidatePath('/');
  revalidatePath('/recomendacion');
  redirect('/?registrado=1');
}

export async function accionCompletarUso(datos: FormData) {
  const userId = await exigirUsuario();
  const usoId = String(datos.get('usoId') ?? '');
  const esquema = z.object({
    sprays: z.coerce.number().int().min(0).max(100).nullable().optional(),
    duracionPercibida: z.enum(DURACIONES).nullable().optional(),
    valoracionDia: z.coerce.number().int().min(1).max(5).nullable().optional(),
    comentario: z.string().max(2000).nullable().optional(),
  });
  const analisis = esquema.safeParse(desdeFormulario(datos));
  if (!usoId || !analisis.success) return;

  await completarUso(userId, usoId, analisis.data);
  revalidatePath('/');
  revalidatePath(`/coleccion`);
}

export async function accionBorrarUso(datos: FormData) {
  const userId = await exigirUsuario();
  const usoId = String(datos.get('usoId') ?? '');
  if (usoId) await borrarUso(userId, usoId);
  revalidatePath('/');
}

export async function accionDescartarRecomendacion(datos: FormData) {
  const userId = await exigirUsuario();
  const perfumeId = String(datos.get('perfumeId') ?? '');
  if (perfumeId) await descartarRecomendacion(userId, perfumeId, hoyIso());
  revalidatePath('/recomendacion');
}

/** Vista previa de idoneidad mientras se rellena el formulario. */
export async function accionPrevisualizar(datos: {
  perfumeId: string;
  fecha: string;
  momento: 'DIA' | 'NOCHE';
  contextoId: string;
  estacionesForzadas?: (typeof ESTACIONES)[number][];
}) {
  const userId = await exigirUsuario();
  return previsualizarIdoneidad(userId, datos);
}

/* ----------------------------------------------------------------- ajustes */

export async function accionGuardarConfiguracion(datos: FormData) {
  const userId = await exigirUsuario();

  const ubicacion = z
    .object({
      lat: z.coerce.number().min(-90).max(90),
      lon: z.coerce.number().min(-180).max(180),
      etiqueta: z.string().min(1).max(120),
    })
    .safeParse({
      lat: datos.get('lat'),
      lon: datos.get('lon'),
      etiqueta: datos.get('etiqueta'),
    });
  if (ubicacion.success) await guardarAjuste(userId, 'ubicacion', ubicacion.data);

  const umbrales = z
    .object({
      umbralVerano: z.coerce.number(),
      umbralVeranoEntretiempo: z.coerce.number(),
      umbralEntretiempo: z.coerce.number(),
      umbralEntretiempoInvierno: z.coerce.number(),
      bochornoHumedadPct: z.coerce.number().min(0).max(100),
      bochornoTemperaturaMin: z.coerce.number(),
      bochornoIncremento: z.coerce.number(),
    })
    .safeParse(Object.fromEntries(datos.entries()));
  if (umbrales.success) await guardarUmbrales(userId, umbrales.data);

  revalidatePath('/mas/configuracion');
  revalidatePath('/recomendacion');
}

/* --------------------------------------------------------------- perfumes */

const esquemaPerfume = z.object({
  nombre: z.string().min(1).max(200),
  marca: z.string().min(1).max(200),
  concentracion: z
    .enum(['EDC', 'EDT', 'EDP', 'EXTRAIT', 'PARFUM', 'ACEITE', 'OTRO'])
    .nullable()
    .optional(),
  anioLanzamiento: z.coerce.number().int().min(1700).max(2200).nullable().optional(),
  volumenMl: z.coerce.number().int().positive().nullable().optional(),
  fechaCompra: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  estado: z.enum(['LO_TENGO', 'LO_TUVE']),
  valoracion: z.coerce.number().int().min(1).max(5).nullable().optional(),
  notasPersonales: z.string().max(4000).nullable().optional(),
  fragranticaUrl: z.string().url().max(500).nullable().optional(),
  notas: z.array(
    z.object({
      nombre: z.string().min(1).max(80),
      nivel: z.enum(['SALIDA', 'CORAZON', 'FONDO']),
      orden: z.number().int().optional(),
    }),
  ),
  familiaIds: z.array(z.string().uuid()),
  contextoIds: z.array(z.string().uuid()).min(1, 'Marca al menos un contexto.'),
  estaciones: z.array(z.enum(ESTACIONES)).min(1, 'Marca al menos una estación.'),
  momentos: z.array(z.enum(MOMENTOS)).min(1, 'Marca al menos un momento del día.'),
});

export type RespuestaPerfume = { ok: true; id: string } | { ok: false; error: string };

export async function accionGuardarPerfume(
  perfumeId: string | null,
  entrada: unknown,
): Promise<RespuestaPerfume> {
  const userId = await exigirUsuario();
  const analisis = esquemaPerfume.safeParse(entrada);
  if (!analisis.success) {
    return { ok: false, error: analisis.error.issues[0]?.message ?? 'Datos no válidos.' };
  }

  try {
    const datos = analisis.data as DatosPerfume;
    const id = perfumeId
      ? (await actualizarPerfume(userId, perfumeId, datos), perfumeId)
      : await crearPerfume(userId, datos);

    revalidatePath('/coleccion');
    revalidatePath(`/coleccion/${id}`);
    return { ok: true, id };
  } catch (error) {
    if (error instanceof ErrorValidacion) return { ok: false, error: error.message };
    throw error;
  }
}

export async function accionArchivar(datos: FormData) {
  const userId = await exigirUsuario();
  const perfumeId = String(datos.get('perfumeId') ?? '');
  const archivar = datos.get('archivar') === '1';
  if (perfumeId) await archivarPerfume(userId, perfumeId, archivar);
  revalidatePath('/coleccion');
  revalidatePath(`/coleccion/${perfumeId}`);
}

export async function accionCambiarEstado(datos: FormData) {
  const userId = await exigirUsuario();
  const perfumeId = String(datos.get('perfumeId') ?? '');
  const estado = datos.get('estado') === 'LO_TUVE' ? 'LO_TUVE' : 'LO_TENGO';
  if (perfumeId) await cambiarEstado(userId, perfumeId, estado);
  revalidatePath('/coleccion');
  revalidatePath(`/coleccion/${perfumeId}`);
}

/* --------------------------------------------------------------- wishlist */

const esquemaDeseo = z.object({
  nombre: z.string().min(1).max(200),
  marca: z.string().min(1).max(200),
  prioridad: z.enum(['EN_EL_RADAR', 'LO_QUIERO', 'LO_NECESITO']),
  precioObjetivo: z.coerce.number().min(0).nullable().optional(),
  notas: z.string().max(2000).nullable().optional(),
  fragranticaUrl: z.string().url().max(500).nullable().optional(),
  notasFondo: z.array(z.string().min(1).max(80)).max(30).optional(),
});

export interface RespuestaDeseo {
  ok: boolean;
  error?: string;
  /** Aviso de la seccion 10.2. No bloquea: el deseo ya esta guardado. */
  aviso?: string;
}

export async function accionGuardarDeseo(
  id: string | null,
  entrada: unknown,
): Promise<RespuestaDeseo> {
  const userId = await exigirUsuario();
  const analisis = esquemaDeseo.safeParse(entrada);
  if (!analisis.success) {
    return { ok: false, error: analisis.error.issues[0]?.message ?? 'Datos no válidos.' };
  }

  if (id) await actualizarDeseo(userId, id, analisis.data);
  else await crearDeseo(userId, analisis.data);
  revalidatePath('/mas/wishlist');

  const solapamientos = await solapamientoConLaColeccion(userId, analisis.data.notasFondo ?? []);
  if (solapamientos.length === 0) return { ok: true };

  const { explicarSolapamiento } = await import('@/dominio/solapamiento');
  const detalle = solapamientos
    .map((s) => `${s.nombre} (${s.comunes.join(', ')})`)
    .join(' · ');
  return { ok: true, aviso: `${explicarSolapamiento(solapamientos)} ${detalle}` };
}

/** Comprueba el solapamiento antes de guardar, mientras se escribe el deseo. */
export async function accionComprobarSolapamiento(notasFondo: string[]) {
  const userId = await exigirUsuario();
  return solapamientoConLaColeccion(userId, notasFondo);
}

export async function accionBorrarDeseo(datos: FormData) {
  const userId = await exigirUsuario();
  const id = String(datos.get('id') ?? '');
  if (id) await borrarDeseo(userId, id);
  revalidatePath('/mas/wishlist');
}

/* ------------------------------------------------------------------ datos */

export async function accionPrevisualizarImportacion(
  texto: string,
): Promise<PrevisualizacionImportacion> {
  const userId = await exigirUsuario();
  return previsualizarImportacion(userId, texto);
}

export async function accionImportar(
  texto: string,
  omitirDuplicados: boolean,
): Promise<ResultadoImportacionFinal> {
  const userId = await exigirUsuario();
  const previa = await previsualizarImportacion(userId, texto);
  const resultado = await importarColeccion(userId, previa.filas, { omitirDuplicados });
  revalidatePath('/coleccion');
  revalidatePath('/estadisticas');
  return resultado;
}

export async function accionRestaurarCopia(json: string): Promise<{ ok: boolean; error?: string }> {
  const userId = await exigirUsuario();
  try {
    const copia = JSON.parse(json) as Copia;
    await restaurarCopia(userId, copia);
    revalidatePath('/');
    revalidatePath('/coleccion');
    revalidatePath('/estadisticas');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Copia no válida.' };
  }
}

/* ------------------------------------------------------- recordatorio */

export async function accionGuardarRecordatorio(datos: FormData) {
  const userId = await exigirUsuario();
  const analisis = z
    .object({ activo: z.coerce.boolean(), hora: z.coerce.number().int().min(0).max(23) })
    .safeParse({
      activo: datos.get('activo') === 'on' || datos.get('activo') === 'true',
      hora: datos.get('hora') ?? 21,
    });
  if (!analisis.success) return;

  await guardarAjuste(userId, 'recordatorio', analisis.data);
  revalidatePath('/mas/configuracion');
}

export async function accionSuscribirAvisos(suscripcion: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}) {
  const userId = await exigirUsuario();
  await guardarSuscripcion(userId, suscripcion);
}

export async function accionCancelarAvisos(endpoint: string) {
  await exigirUsuario();
  await borrarSuscripcion(endpoint);
}
