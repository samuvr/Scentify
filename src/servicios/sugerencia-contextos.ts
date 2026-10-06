/**
 * Sugerencia de contextos — una llamada a Claude con busqueda web.
 *
 * La propuesta llega como entrada de una herramienta estricta y no como JSON
 * en el texto: la salida estructurada no admite las citas que trae la busqueda
 * web, y la herramienta con `strict` garantiza el esquema igual. No hace falta
 * devolverle el resultado: en cuanto la llama, ya esta la respuesta.
 */
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import {
  esquemaPropuesta,
  HERRAMIENTA_PROPUESTA,
  INSTRUCCIONES_SUGERENCIA,
  interpretarPropuesta,
  mensajeSugerencia,
  type ContextoSugerible,
  type PeticionSugerencia,
  type SugerenciaContextos,
} from '@/dominio/sugerencia-contextos';
import { MODELO, opcionesFallback } from './claude';

/** La busqueda web corre en el servidor y puede pausar el turno; se reanuda hasta aqui. */
const MAXIMO_REANUDACIONES = 3;

export async function sugerirContextos(
  perfume: PeticionSugerencia,
  contextos: ContextoSugerible[],
): Promise<SugerenciaContextos | null> {
  if (contextos.length === 0) return { contextos: [], resumen: '' };

  const client = new Anthropic();
  const mensajes: Anthropic.Beta.BetaMessageParam[] = [
    { role: 'user', content: mensajeSugerencia(perfume, contextos) },
  ];

  for (let vuelta = 0; vuelta <= MAXIMO_REANUDACIONES; vuelta++) {
    const respuesta = await client.beta.messages.create({
      model: MODELO,
      max_tokens: 16000,
      output_config: { effort: 'low' },
      ...opcionesFallback(),
      system: INSTRUCCIONES_SUGERENCIA,
      tools: [
        { type: 'web_search_20260209', name: 'web_search', max_uses: 4 },
        {
          name: HERRAMIENTA_PROPUESTA,
          description: 'Entrega la propuesta de contextos para el perfume. Llámala una vez, al final.',
          input_schema: esquemaPropuesta(contextos),
          strict: true,
        },
      ],
      messages: mensajes,
    });

    const propuesta = respuesta.content.find(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use' && b.name === HERRAMIENTA_PROPUESTA,
    );
    if (propuesta) return interpretarPropuesta(propuesta.input, contextos);
    if (respuesta.stop_reason !== 'pause_turn') return null;
    mensajes.push({ role: 'assistant', content: respuesta.content });
  }
  return null;
}
