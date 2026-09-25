/**
 * Alta de un uso.
 *
 * Es el endpoint que encola el service worker cuando no hay conexion, asi que
 * tiene que ser idempotente: el id lo genera el cliente y un reenvio del mismo
 * registro no duplica nada.
 */
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { usuarioActual } from '@/servicios/auth';
import { ErrorValidacion } from '@/servicios/perfumes';
import { registrarUso } from '@/servicios/usos';
import { yaRegistradoEse } from '@/servicios/consultas';

const esquema = z.object({
  id: z.string().uuid(),
  perfumeId: z.string().uuid(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  momento: z.enum(['DIA', 'NOCHE']),
  contextoId: z.string().uuid(),
  sprays: z.number().int().min(0).max(100).nullish(),
  duracionPercibida: z.enum(['MENOS_2H', 'DE_2_4H', 'DE_4_6H', 'DE_6_8H', 'MAS_8H']).nullish(),
  valoracionDia: z.number().int().min(1).max(5).nullish(),
  comentario: z.string().max(2000).nullish(),
  estacionesForzadas: z.array(z.enum(['PRIMAVERA', 'VERANO', 'OTONO', 'INVIERNO'])).optional(),
});

export async function POST(peticion: Request) {
  const userId = await usuarioActual();
  if (!userId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const analisis = esquema.safeParse(await peticion.json().catch(() => null));
  if (!analisis.success) {
    return NextResponse.json({ error: 'Datos no válidos' }, { status: 400 });
  }

  let resultado;
  try {
    resultado = await registrarUso(userId, analisis.data);
  } catch (error) {
    // Un perfume que no es de esta cuenta. Es un 4xx a proposito: el service
    // worker saca de la cola lo que no se arregla reintentando.
    if (error instanceof ErrorValidacion) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
  revalidatePath('/');
  revalidatePath('/estadisticas');

  return NextResponse.json(resultado, { status: resultado.yaExistia ? 200 : 201 });
}

/** Comprobacion de duplicado del mismo perfume en la misma fecha (seccion 6.1). */
export async function GET(peticion: Request) {
  const userId = await usuarioActual();
  if (!userId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const parametros = new URL(peticion.url).searchParams;
  const perfumeId = parametros.get('perfumeId') ?? '';
  const fecha = parametros.get('fecha') ?? '';
  if (!perfumeId || !fecha) return NextResponse.json({ duplicado: false });

  return NextResponse.json({ duplicado: await yaRegistradoEse(userId, perfumeId, fecha) });
}
