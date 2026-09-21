'use server';

/**
 * Acciones de servidor. Todo lo que muta pasa por aqui, siempre con el usuario
 * de la sesion resuelto en el servidor: el cliente nunca manda un `user_id`.
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { cerrarSesion, exigirUsuario, iniciarSesion } from '@/servicios/auth';
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
  redirect('/');
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
