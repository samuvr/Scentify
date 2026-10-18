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
import { consultarFicha, leerTextoPegado, mensajeDeFallo } from '@/servicios/fragrantica';

// Leer la ficha a traves de ZenRows abre un navegador y tarda; ver el servicio.
export const maxDuration = 60;

const esquema = z.union([
  z.object({ url: z.string().min(1) }),
  z.object({ texto: z.string().min(1).max(500_000) }),
]);

export async function POST(peticion: Request) {
  const userId = await usuarioActual();
  if (!userId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const analisis = esquema.safeParse(await peticion.json().catch(() => null));
  if (!analisis.success) return NextResponse.json({ error: 'Parámetros' }, { status: 400 });

  const datos = analisis.data;
  const porUrl = 'url' in datos;
  const resultado = 'url' in datos ? await consultarFicha(datos.url) : leerTextoPegado(datos.texto);

  if (!resultado.ok) {
    // 200 a proposito: no es un error del cliente ni del servidor, es un
    // camino previsto que la interfaz resuelve con su fallback.
    const mensaje = porUrl
      ? mensajeDeFallo(resultado)
      : 'No se ha podido leer el texto pegado. Rellena las casillas a mano.';
    return NextResponse.json({ ok: false, motivo: resultado.motivo, mensaje });
  }

  return NextResponse.json({ ok: true, ficha: resultado.ficha });
}
