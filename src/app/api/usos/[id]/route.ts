/**
 * Un uso concreto, para el service worker: «Deshacer» y la duracion desde la
 * notificacion de la noche, sin abrir la app. Las pantallas usan las acciones
 * de servidor; el service worker no puede.
 */
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { usuarioActual } from '@/servicios/auth';
import { borrarUso, completarUso } from '@/servicios/usos';
import { esUuid } from '@/dominio/navegacion';

function revalidar() {
  revalidatePath('/');
  revalidatePath('/coleccion', 'layout');
  revalidatePath('/mas/calendario', 'layout');
  revalidatePath('/estadisticas');
}

export async function DELETE(_p: Request, contexto: { params: Promise<{ id: string }> }) {
  const userId = await usuarioActual();
  if (!userId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const { id } = await contexto.params;
  if (!esUuid(id)) return NextResponse.json({ error: 'Uso no válido' }, { status: 400 });

  // Solo borra si es de esta cuenta: borrarUso filtra por usuario.
  await borrarUso(userId, id);
  revalidar();
  return new NextResponse(null, { status: 204 });
}

const esquemaCampos = z
  .object({
    duracionPercibida: z.enum(['MENOS_2H', 'DE_2_4H', 'DE_4_6H', 'DE_6_8H', 'MAS_8H']).nullable().optional(),
    valoracionDia: z.number().int().min(1).max(5).nullable().optional(),
  })
  .strict();

export async function PATCH(peticion: Request, contexto: { params: Promise<{ id: string }> }) {
  const userId = await usuarioActual();
  if (!userId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const { id } = await contexto.params;
  const analisis = esquemaCampos.safeParse(await peticion.json().catch(() => null));
  if (!esUuid(id) || !analisis.success) {
    return NextResponse.json({ error: 'Datos no válidos' }, { status: 400 });
  }

  await completarUso(userId, id, analisis.data);
  revalidar();
  return new NextResponse(null, { status: 204 });
}
