/**
 * Propuesta de contextos para un perfume, a partir de sus notas y de lo que
 * dice la gente en internet. No escribe nada: el formulario la pinta y la
 * persona decide.
 */
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { esquemaPeticionSugerencia } from '@/dominio/sugerencia-contextos';
import { usuarioActual } from '@/servicios/auth';
import { claudeDisponible } from '@/servicios/claude';
import { listarContextos } from '@/servicios/consultas';
import { sugerirContextos } from '@/servicios/sugerencia-contextos';

// Con dos o tres busquedas web la respuesta tarda bastante mas que una normal.
export const maxDuration = 120;

function mensajeDeError(error: unknown): string {
  if (error instanceof Anthropic.RateLimitError) return 'Demasiadas consultas seguidas. Prueba en un momento.';
  if (error instanceof Anthropic.AuthenticationError) return 'La clave de la API de Claude no es válida.';
  return 'No se han podido sugerir contextos. Márcalos a mano.';
}

export async function POST(peticion: Request) {
  const userId = await usuarioActual();
  if (!userId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (!claudeDisponible()) return NextResponse.json({ ok: false, mensaje: 'Falta la clave de la API de Claude.' });

  const analisis = esquemaPeticionSugerencia.safeParse(await peticion.json().catch(() => null));
  if (!analisis.success) return NextResponse.json({ error: 'Parámetros' }, { status: 400 });

  try {
    const contextos = await listarContextos(userId);
    const sugerencia = await sugerirContextos(
      analisis.data,
      contextos.map((c) => ({ id: c.id, slug: c.slug, nombre: c.nombre })),
    );
    // 200 a proposito, como con Fragrantica: sin sugerencia se sigue a mano.
    if (!sugerencia) return NextResponse.json({ ok: false, mensaje: mensajeDeError(null) });
    return NextResponse.json({ ok: true, sugerencia });
  } catch (error) {
    console.error('contextos-sugeridos', error);
    return NextResponse.json({ ok: false, mensaje: mensajeDeError(error) });
  }
}
