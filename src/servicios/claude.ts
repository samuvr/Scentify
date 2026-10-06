/**
 * Lo comun a todo lo que llama a la API de Claude: la clave, el modelo y el
 * fallback del servidor cuando el modelo rechaza una peticion.
 */
import 'server-only';

export const MODELO = process.env.SCENTIFY_ASISTENTE_MODELO?.trim() || 'claude-opus-5-5';

/** Modelos que aceptan `fallbacks: "default"` en la API de Claude. */
const ADMITEN_FALLBACK = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5']);

export function claudeDisponible(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

/** Se esparce en la peticion: vacio si el modelo no admite el fallback. */
export function opcionesFallback() {
  return ADMITEN_FALLBACK.has(MODELO)
    ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
    : {};
}
