/**
 * Catalogo comun de fichas, para el alta de perfumes.
 *
 *   ?q=texto  fichas que encajan, y si ya tengo un frasco de cada una
 *   ?id=uuid  una ficha entera, para rellenar el formulario con ella
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { usuarioActual } from '@/servicios/auth';
import { buscarEnCatalogo, fichaParaAlta } from '@/servicios/consultas';

export async function GET(peticion: Request) {
  const userId = await usuarioActual();
  if (!userId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const parametros = new URL(peticion.url).searchParams;
  const id = parametros.get('id');
  if (id) {
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: 'Id no válido' }, { status: 400 });
    }
    const ficha = await fichaParaAlta(id);
    if (!ficha) return NextResponse.json({ error: 'No existe' }, { status: 404 });
    return NextResponse.json({ ficha });
  }

  const texto = parametros.get('q') ?? '';
  return NextResponse.json({ resultados: await buscarEnCatalogo(userId, texto) });
}
