/**
 * Consulta de una ficha de Fragrantica, disparada por el usuario.
 *
 * Los votos que devuelve son de un solo uso: se pintan en la pantalla de
 * categorizacion y se descartan. Este endpoint no escribe nada en la base de
 * datos (5.3).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { usuarioActual } from '@/servicios/auth';
import { consultarFicha, leerTextoPegado } from '@/servicios/fragrantica';

const esquema = z.union([
  z.object({ url: z.string().min(1) }),
  z.object({ texto: z.string().min(1).max(500_000) }),
]);

const MENSAJE: Record<string, string> = {
  'url-no-valida': 'Esa URL no parece una ficha de Fragrantica.',
  bloqueado: 'Fragrantica ha bloqueado la petición. Pega el texto del bloque a mano.',
  'sin-respuesta': 'No ha respondido. Pega el texto del bloque a mano.',
  'sin-datos': 'No se ha podido leer el bloque. Rellena las casillas a mano.',
};

export async function POST(peticion: Request) {
  const userId = await usuarioActual();
  if (!userId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const analisis = esquema.safeParse(await peticion.json().catch(() => null));
  if (!analisis.success) return NextResponse.json({ error: 'Parámetros' }, { status: 400 });

  const resultado =
    'url' in analisis.data
      ? await consultarFicha(analisis.data.url)
      : leerTextoPegado(analisis.data.texto);

  if (!resultado.ok) {
    // 200 a proposito: no es un error del cliente ni del servidor, es un
    // camino previsto que la interfaz resuelve con su fallback.
    return NextResponse.json({ ok: false, motivo: resultado.motivo, mensaje: MENSAJE[resultado.motivo] });
  }

  return NextResponse.json({ ok: true, ficha: resultado.ficha });
}
