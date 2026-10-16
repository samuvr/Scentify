'use server';

/**
 * Acciones de servidor. Todo lo que muta pasa por aqui, siempre con el usuario
 * de la sesion resuelto en el servidor: el cliente nunca manda un `user_id`.
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { destinoSeguro, esUuid } from '@/dominio/navegacion';
import { esquemaParecido, MAXIMO_PARECIDOS } from '@/dominio/parecidos';
import { cerrarSesion, exigirUsuario, iniciarSesion, registrarUsuario } from '@/servicios/auth';
import {
  actualizarPerfume,
  archivarPerfume,
  cambiarEstado,
  crearPerfume,
  ErrorDuplicado,
  ErrorValidacion,
  type DatosPerfume,
} from '@/servicios/perfumes';
import {
  crearDeseo,
  actualizarDeseo,
  borrarDeseo,
  marcarConvertido,
  solapamientoConLaColeccion,
} from '@/servicios/wishlist';
import { guardarSuscripcion, borrarSuscripcion, leerRecordatorio } from '@/servicios/recordatorio';
import {
  importarColeccion,
  previsualizarImportacion,
  restaurarCopia,
  type Copia,
  type PrevisualizacionImportacion,
  type ResultadoImportacionFinal,
} from '@/servicios/datos';
import {
  aplicarHoja,
  previsualizarHoja,
  type ResultadoActualizacion,
} from '@/servicios/hoja-actualizacion';
import type { AnalisisHoja } from '@/dominio/hoja-actualizacion';
import { guardarAjuste, guardarUmbrales } from '@/servicios/ajustes';
import { ajustarMarca, rechazarPropuesta } from '@/servicios/recategorizacion';
import { validarUmbrales } from '@/dominio/estacion';
import { HORA_MAXIMA_RECORDATORIO } from '@/servicios/recordatorio';
import { zonaDelUsuario } from '@/servicios/zona';
import { buscarLugares } from '@/servicios/clima';
import {
  borrarUso,
  completarUso,
  descartarRecomendacion,
  reemplazarUso,
  desplazarDias,
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

const esquemaRegistro = z.object({
  email: z.string().trim().email('Ese correo no es válido.').max(200),
  password: z
    .string()
    .min(8, 'La contraseña necesita al menos 8 caracteres.')
    .max(200, 'La contraseña es demasiado larga.'),
  codigo: z.string().trim().min(1, 'Falta el código de invitación.').max(200),
});

const MENSAJES_REGISTRO = {
  CERRADO: 'El registro está cerrado.',
  CODIGO: 'El código de invitación no es correcto.',
  EXISTE: 'Ya hay una cuenta con ese correo. Entra con tu contraseña.',
} as const;

/**
 * Devuelve el correo y el codigo junto al error porque React vacia el
 * formulario al terminar la accion, y reescribir los tres campos en el movil
 * por una errata en uno solo es justo lo que hace abandonar. La contrasenia
 * no vuelve al navegador.
 */
export type EstadoRegistro = { error: string; email: string; codigo: string };

export async function accionRegistrarse(
  _previo: EstadoRegistro | null,
  datos: FormData,
): Promise<EstadoRegistro> {
  const entrada = {
    email: String(datos.get('email') ?? ''),
    password: String(datos.get('password') ?? ''),
    codigo: String(datos.get('codigo') ?? ''),
  };
  const conError = (error: string) => ({ error, email: entrada.email, codigo: entrada.codigo });

  const analisis = esquemaRegistro.safeParse(entrada);
  if (!analisis.success) return conError(analisis.error.issues[0]?.message ?? 'Datos no válidos.');

  const { email, password, codigo } = analisis.data;
  const resultado = await registrarUsuario(email, password, codigo);
  if (!resultado.ok) return conError(MENSAJES_REGISTRO[resultado.motivo]);
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

  let resultado;
  try {
    resultado = await registrarUso(userId, analisis.data as DatosUso);
  } catch (error) {
    if (error instanceof ErrorValidacion) return { ok: false as const, error: error.message };
    throw error;
  }
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

export async function accionCompletarUso(datos: FormData) {
  const userId = await exigirUsuario();
  const usoId = String(datos.get('usoId') ?? '');
  const esquema = z.object({
    sprays: z.coerce.number().int().min(0).max(100).nullable(),
    duracionPercibida: z.enum(DURACIONES).nullable(),
    valoracionDia: z.coerce.number().int().min(1).max(5).nullable(),
    comentario: z.string().max(2000).nullable(),
  });
  // Aqui un campo vacio no es «no lo toques», es «ya no lo se»: el formulario
  // manda siempre los cuatro, y dejar uno en blanco lo vuelve a dejar en «—».
  // `desdeFormulario` descartaba los vacios, y con todo en blanco salia un
  // UPDATE sin columnas que Drizzle rechaza.
  const leer = (clave: string) => {
    const valor = datos.get(clave);
    return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null;
  };
  const analisis = esquema.safeParse({
    sprays: leer('sprays'),
    duracionPercibida: leer('duracionPercibida'),
    valoracionDia: leer('valoracionDia'),
    comentario: leer('comentario'),
  });
  if (!usoId) return { ok: false as const, error: 'Falta el registro.' };
  if (!analisis.success) {
    return { ok: false as const, error: 'Revisa los datos: los sprays van de 0 a 100.' };
  }

  await completarUso(userId, usoId, analisis.data);
  revalidarUsos();
  return { ok: true as const };
}

export async function accionBorrarUso(datos: FormData) {
  const userId = await exigirUsuario();
  const usoId = String(datos.get('usoId') ?? '');
  if (usoId) await borrarUso(userId, usoId);
  revalidarUsos();
}

/** Todo lo que enseña usos: Hoy, la ficha, el calendario y las estadisticas. */
function revalidarUsos() {
  revalidatePath('/');
  revalidatePath('/coleccion', 'layout');
  revalidatePath('/mas/calendario', 'layout');
  revalidatePath('/estadisticas');
}

/**
 * «Ajustar» tras un registro de un toque: el viejo solo se borra al guardar
 * el nuevo, y los dos cambios van juntos. Salir del formulario sin guardar
 * deja el registro de antes como estaba.
 */
export async function accionReemplazarUso(
  viejoId: string,
  entrada: unknown,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const userId = await exigirUsuario();
  const analisis = esquemaUso.safeParse(entrada);
  if (!esUuid(viejoId) || !analisis.success) {
    return { ok: false, error: 'Faltan datos del registro.' };
  }
  try {
    const resultado = await reemplazarUso(userId, viejoId, analisis.data as DatosUso);
    revalidarUsos();
    return { ok: true, id: resultado.id };
  } catch (error) {
    if (error instanceof ErrorValidacion) return { ok: false, error: error.message };
    throw error;
  }
}

const esquemaValoracionRapida = z
  .object({
    valoracionDia: z.number().int().min(1).max(5).nullable().optional(),
    duracionPercibida: z.enum(DURACIONES).nullable().optional(),
  })
  .strict();

/**
 * Cierre del dia de un toque: guarda solo el campo que se ha tocado, sin
 * boton Guardar. Null lo quita (volver a tocar la misma estrella).
 */
export async function accionValorarUso(
  usoId: string,
  campos: unknown,
): Promise<{ ok: boolean }> {
  const userId = await exigirUsuario();
  const analisis = esquemaValoracionRapida.safeParse(campos);
  if (!esUuid(usoId) || !analisis.success) return { ok: false };
  await completarUso(userId, usoId, analisis.data);
  revalidarUsos();
  return { ok: true };
}

export async function accionDescartarRecomendacion(datos: FormData) {
  const userId = await exigirUsuario();
  const perfumeId = String(datos.get('perfumeId') ?? '');
  // Solo hoy o mañana: es lo unico que la pantalla deja pedir.
  const hoy = hoyIso(await zonaDelUsuario());
  const fecha = datos.get('fecha') === desplazarDias(hoy, 1) ? desplazarDias(hoy, 1) : hoy;
  const momento = datos.get('momento');
  const contextoId = String(datos.get('contextoId') ?? '');
  if (perfumeId) {
    await descartarRecomendacion(userId, perfumeId, fecha, {
      contextoId: esUuid(contextoId) ? contextoId : null,
      momento: momento === 'DIA' || momento === 'NOCHE' ? momento : null,
    });
  }
  revalidatePath('/recomendacion');
  revalidatePath('/');
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
  if (datos.get('modoUbicacion') === 'auto') {
    await guardarAjuste(userId, 'ubicacion', { modo: 'auto' });
  } else if (ubicacion.success) {
    await guardarAjuste(userId, 'ubicacion', { modo: 'fija', ...ubicacion.data });
  }

  const umbrales = validarUmbrales(Object.fromEntries(datos.entries()));
  if (umbrales.ok) await guardarUmbrales(userId, umbrales.umbrales);

  revalidatePath('/');
  revalidatePath('/mas/configuracion');
  revalidatePath('/recomendacion');
  // Lo que no se guarda se dice: antes un umbral mal puesto se ignoraba sin
  // aviso y la pantalla volvia con los valores viejos.
  redirect(
    umbrales.ok
      ? '/mas/configuracion?guardado=1'
      : `/mas/configuracion?error=${umbrales.error}`,
  );
}

/* --------------------------------------------------------------- perfumes */

const esquemaPerfume = z.object({
  /** Ficha del catalogo elegida al dar de alta, si se ha elegido una. */
  fichaId: z.string().uuid().nullable().optional(),
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
  /**
   * «Esta fragancia me recuerda a», si se ha leido la ficha en este alta o
   * edicion. La fecha de lectura la pone el servidor. Si no tiene la forma
   * esperada se descarta y se guarda lo demas: Fragrantica no bloquea nunca
   * un alta (5.2).
   */
  parecidos: z
    .unknown()
    .optional()
    .transform((crudo) => {
      const analisis = z.array(esquemaParecido).max(MAXIMO_PARECIDOS).safeParse(crudo);
      return analisis.success && analisis.data.length > 0
        ? { leidosEn: new Date().toISOString(), perfumes: analisis.data }
        : undefined;
    }),
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
  confirmarDuplicado: z.boolean().optional(),
  /** El deseo de la wishlist del que viene el alta: se marca como conseguido. */
  deseoId: z.string().uuid().nullable().optional(),
});

export type RespuestaPerfume =
  | { ok: true; id: string; deseoConvertido?: boolean }
  | { ok: false; error: string; duplicado?: string };

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
    const { deseoId, ...datos } = analisis.data;
    const id = perfumeId
      ? (await actualizarPerfume(userId, perfumeId, datos as DatosPerfume), perfumeId)
      : await crearPerfume(userId, datos as DatosPerfume);

    // «Convertir en colección» cierra el deseo: antes se quedaba en la lista.
    if (!perfumeId && deseoId) {
      await marcarConvertido(userId, deseoId, id);
      revalidatePath('/mas/wishlist');
    }
    revalidatePath('/coleccion');
    revalidatePath(`/coleccion/${id}`);
    return { ok: true, id, deseoConvertido: Boolean(!perfumeId && deseoId) };
  } catch (error) {
    if (error instanceof ErrorDuplicado) {
      return { ok: false, error: error.message, duplicado: error.perfumeId };
    }
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

/* ------------------------------------------------------ recategorizacion */

const esquemaPropuesta = z.object({
  perfumeId: z.string().uuid(),
  eje: z.enum(['contexto', 'momento', 'estacion']),
  valor: z.string().min(1).max(64),
  accion: z.enum(['añadir', 'quitar']).optional(),
});

function revalidarMarcas(perfumeId: string) {
  revalidatePath(`/coleccion/${perfumeId}`);
  revalidatePath('/coleccion');
  revalidatePath('/mas/huecos');
  revalidatePath('/estadisticas');
  revalidatePath('/recomendacion');
  revalidatePath('/');
}

/** Aplica una propuesta de recategorizacion: solo esa marca, sin el editor. */
export async function accionAjustarMarca(datos: FormData) {
  const userId = await exigirUsuario();
  const analisis = esquemaPropuesta.safeParse(Object.fromEntries(datos.entries()));
  if (!analisis.success || !analisis.data.accion) return;
  const { perfumeId, eje, valor, accion } = analisis.data;
  try {
    await ajustarMarca(userId, perfumeId, eje, valor, accion!);
  } catch (error) {
    // El eje se quedaria vacio, o ya no existe: no hay nada que hacer.
    if (!(error instanceof ErrorValidacion)) throw error;
  }
  revalidarMarcas(perfumeId);
}

/** «Fue casualidad»: oculta esa propuesta 90 dias. */
export async function accionRechazarPropuesta(datos: FormData) {
  const userId = await exigirUsuario();
  const analisis = esquemaPropuesta.safeParse(Object.fromEntries(datos.entries()));
  if (!analisis.success) return;
  const { perfumeId, eje, valor } = analisis.data;
  await rechazarPropuesta(userId, perfumeId, eje, valor, hoyIso(await zonaDelUsuario()));
  revalidarMarcas(perfumeId);
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

/** El Excel llega como fichero en un FormData, bajo la clave `hoja`. */
async function ficheroDeHoja(datos: FormData): Promise<ArrayBuffer> {
  const fichero = datos.get('hoja');
  if (!(fichero instanceof File) || fichero.size === 0) throw new Error('Elige un fichero.');
  return fichero.arrayBuffer();
}

export async function accionPrevisualizarHoja(
  datos: FormData,
): Promise<{ ok: true; analisis: AnalisisHoja } | { ok: false; error: string }> {
  const userId = await exigirUsuario();
  try {
    return { ok: true, analisis: await previsualizarHoja(userId, await ficheroDeHoja(datos)) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Fichero no válido.' };
  }
}

export async function accionAplicarHoja(
  datos: FormData,
): Promise<{ ok: true; resultado: ResultadoActualizacion } | { ok: false; error: string }> {
  const userId = await exigirUsuario();
  try {
    const resultado = await aplicarHoja(userId, await ficheroDeHoja(datos));
    revalidatePath('/coleccion', 'layout');
    revalidatePath('/estadisticas');
    revalidatePath('/recomendacion');
    return { ok: true, resultado };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Fichero no válido.' };
  }
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

/**
 * Cambia el recordatorio de la noche. Llega solo lo que se toca (el
 * interruptor, «Pregúntame qué tal» o la hora) y se junta con lo guardado:
 * antes eran tres controles con un «Guardar» cada uno.
 */
export async function accionAjustarRecordatorio(cambios: unknown): Promise<{ ok: boolean }> {
  const userId = await exigirUsuario();
  const analisis = z
    .object({
      activo: z.boolean().optional(),
      hora: z.number().int().min(0).max(HORA_MAXIMA_RECORDATORIO).optional(),
      cierre: z.boolean().optional(),
    })
    .strict()
    .safeParse(cambios);
  if (!analisis.success) return { ok: false };

  const actual = await leerRecordatorio(userId);
  // El cron no tiene peticion de la que sacar la zona: se guarda con el
  // ajuste, y «su hora» y «hoy» se miden en la del usuario.
  await guardarAjuste(userId, 'recordatorio', {
    ...actual,
    ...analisis.data,
    zona: await zonaDelUsuario(),
  });
  revalidatePath('/mas/configuracion');
  return { ok: true };
}

export async function accionSuscribirAvisos(suscripcion: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}) {
  const userId = await exigirUsuario();
  await guardarSuscripcion(userId, suscripcion);
}

export async function accionCancelarAvisos(endpoint: string) {
  const userId = await exigirUsuario();
  await borrarSuscripcion(userId, endpoint);
}

/**
 * Destinos del modo viaje por su nombre. Sin esto habia que salir de la app a
 * buscar la latitud y la longitud. Lista vacia si no lo encuentra; null si no
 * se ha podido buscar.
 */
export async function accionBuscarDestino(nombre: string) {
  await exigirUsuario();
  const texto = String(nombre ?? '').trim().slice(0, 100);
  if (texto.length < 2) return [];
  return buscarLugares(texto);
}
