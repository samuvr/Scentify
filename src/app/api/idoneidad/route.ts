/**
 * Vista previa de idoneidad y estacion efectiva mientras se rellena el
 * formulario. Sin conexion falla y el formulario lo dice, pero no bloquea:
 * el uso se puede guardar igual y se encola.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { usuarioActual } from '@/servicios/auth';
import { ErrorValidacion } from '@/servicios/perfumes';
import { previsualizarIdoneidad } from '@/servicios/usos';

const esquema = z.object({
  perfumeId: z.string().uuid(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  momento: z.enum(['DIA', 'NOCHE']),
  contextoId: z.string().uuid(),
});

export async function GET(peticion: Request) {
  const userId = await usuarioActual();
  if (!userId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const parametros = Object.fromEntries(new URL(peticion.url).searchParams);
  const analisis = esquema.safeParse(parametros);
  if (!analisis.success) return NextResponse.json({ error: 'Parámetros' }, { status: 400 });

  try {
    return NextResponse.json(await previsualizarIdoneidad(userId, analisis.data));
  } catch (error) {
    if (error instanceof ErrorValidacion) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
