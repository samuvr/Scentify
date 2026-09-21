/** Alta y baja de la suscripcion de avisos del navegador (seccion 10.4). */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { usuarioActual } from '@/servicios/auth';
import { borrarSuscripcion, guardarSuscripcion } from '@/servicios/recordatorio';

const esquema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(200) }),
});

export async function POST(peticion: Request) {
  const userId = await usuarioActual();
  if (!userId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const analisis = esquema.safeParse(await peticion.json().catch(() => null));
  if (!analisis.success) return NextResponse.json({ error: 'Suscripción' }, { status: 400 });

  await guardarSuscripcion(userId, analisis.data);
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(peticion: Request) {
  const userId = await usuarioActual();
  if (!userId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { endpoint } = (await peticion.json().catch(() => ({}))) as { endpoint?: string };
  if (endpoint) await borrarSuscripcion(endpoint);
  return NextResponse.json({ ok: true });
}
