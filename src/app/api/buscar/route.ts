/** Buscador del registro diario (seccion 6.1): desde el tercer caracter. */
import { NextResponse } from 'next/server';
import { usuarioActual } from '@/servicios/auth';
import { buscarEnColeccion } from '@/servicios/consultas';

export async function GET(peticion: Request) {
  const userId = await usuarioActual();
  if (!userId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const texto = new URL(peticion.url).searchParams.get('q') ?? '';
  return NextResponse.json({ resultados: await buscarEnColeccion(userId, texto) });
}
