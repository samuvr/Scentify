/**
 * Asistente: recibe la conversacion y devuelve la respuesta en streaming, una
 * linea JSON por evento (`EventoAsistente`), para que el texto aparezca segun
 * se escribe.
 */
import Anthropic from '@anthropic-ai/sdk';
import { esquemaConversacion, ventanaDeConversacion, type EventoAsistente } from '@/dominio/asistente';
import { asistenteDisponible, responder } from '@/servicios/asistente';
import { usuarioActual } from '@/servicios/auth';
import { hoyIso } from '@/servicios/usos';
import { zonaDelUsuario } from '@/servicios/zona';

// Una respuesta con dos herramientas puede pasar del minuto.
export const maxDuration = 120;

function mensajeDeError(error: unknown): string {
  if (error instanceof Anthropic.RateLimitError) return 'Demasiadas preguntas seguidas. Prueba en un momento.';
  if (error instanceof Anthropic.AuthenticationError) return 'La clave de la API de Claude no es válida.';
  if (error instanceof Anthropic.APIError && (error.status ?? 0) >= 500) {
    return 'Claude no está disponible ahora mismo. Prueba en un rato.';
  }
  return 'No he podido responder. Prueba otra vez.';
}

export async function POST(peticion: Request) {
  const userId = await usuarioActual();
  if (!userId) return new Response('No autenticado', { status: 401 });
  if (!asistenteDisponible()) return new Response('Asistente sin configurar', { status: 503 });

  const datos = esquemaConversacion.safeParse(await peticion.json().catch(() => null));
  if (!datos.success) return new Response('Conversación no válida', { status: 400 });

  // El «hoy» del usuario, no el de UTC: de madrugada, «mañana» era hoy.
  const hoy = hoyIso(await zonaDelUsuario());
  const mensajes = ventanaDeConversacion(datos.data.mensajes);
  const codificador = new TextEncoder();

  const cuerpo = new ReadableStream<Uint8Array>({
    async start(controlador) {
      const emitir = (evento: EventoAsistente) =>
        controlador.enqueue(codificador.encode(`${JSON.stringify(evento)}\n`));
      try {
        await responder(userId, mensajes, hoy, emitir);
      } catch (error) {
        console.error('asistente', error);
        emitir({ tipo: 'error', mensaje: mensajeDeError(error) });
      }
      emitir({ tipo: 'fin' });
      controlador.close();
    },
  });

  return new Response(cuerpo, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
