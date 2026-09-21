/**
 * Bloque de promedios de un perfume (seccion 4.3), que el formulario de
 * registro enseña nada mas seleccionarlo.
 */
import { NextResponse } from 'next/server';
import { usuarioActual } from '@/servicios/auth';
import { promediosDePerfume } from '@/servicios/consultas';

export async function GET(_peticion: Request, contexto: { params: Promise<{ id: string }> }) {
  const userId = await usuarioActual();
  if (!userId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { id } = await contexto.params;
  return NextResponse.json(await promediosDePerfume(userId, id));
}
