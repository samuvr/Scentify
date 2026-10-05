'use client';

/**
 * La conversacion vive solo aqui, en el estado de la pagina: se reenvia entera
 * en cada pregunta y se pierde al salir. No hay nada que guardar en la base de
 * datos para que esto funcione.
 */
import { useRef, useState, type ReactNode } from 'react';
import type { EventoAsistente, MensajeConversacion } from '@/dominio/asistente';

const SUGERENCIAS = [
  '¿Qué notas o familias faltan en mi colección?',
  'Tengo una boda este sábado por la noche. Mira el tiempo y sugiéreme tres opciones.',
  '¿Qué perfumes tengo olvidados que debería volver a usar?',
  '¿Qué me pongo mañana para la oficina?',
];

/** Negritas con **, y listas con "- " o "1. ". Lo poco que usa el asistente. */
function enLinea(texto: string): ReactNode[] {
  return texto.split(/(\*\*[^*]+\*\*)/g).map((trozo, i) =>
    trozo.startsWith('**') && trozo.endsWith('**') && trozo.length > 4 ? (
      <strong key={i} className="text-texto">
        {trozo.slice(2, -2)}
      </strong>
    ) : (
      trozo
    ),
  );
}

function Formato({ texto }: { texto: string }) {
  const bloques = texto.split(/\n{2,}/);
  return (
    <div className="space-y-3">
      {bloques.map((bloque, i) => {
        const lineas = bloque.split('\n').filter((l) => l.trim());
        const esLista = lineas.length > 0 && lineas.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l));
        if (esLista) {
          const Lista = /^\s*\d+\./.test(lineas[0] ?? '') ? 'ol' : 'ul';
          return (
            <Lista key={i} className={`space-y-1 pl-5 ${Lista === 'ol' ? 'list-decimal' : 'list-disc'}`}>
              {lineas.map((l, j) => (
                <li key={j}>{enLinea(l.replace(/^\s*([-*•]|\d+\.)\s+/, ''))}</li>
              ))}
            </Lista>
          );
        }
        return (
          <p key={i} className="whitespace-pre-line">
            {enLinea(bloque.replace(/^#+\s*/gm, ''))}
          </p>
        );
      })}
    </div>
  );
}

export function Chat() {
  const [mensajes, setMensajes] = useState<MensajeConversacion[]>([]);
  const [borrador, setBorrador] = useState('');
  const [estado, setEstado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const final = useRef<HTMLDivElement>(null);
  const trabajando = estado !== null;

  async function preguntar(pregunta: string) {
    const texto = pregunta.trim();
    if (!texto || trabajando) return;

    const conversacion: MensajeConversacion[] = [...mensajes, { rol: 'user', texto }];
    setMensajes([...conversacion, { rol: 'assistant', texto: '' }]);
    setBorrador('');
    setError(null);
    setEstado('Pensando…');

    let respuesta = '';
    const escribir = (trozo: string) => {
      respuesta += trozo;
      setMensajes([...conversacion, { rol: 'assistant', texto: respuesta }]);
    };

    try {
      const r = await fetch('/api/asistente', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mensajes: conversacion }),
      });
      if (!r.ok || !r.body) throw new Error(await r.text());

      const lector = r.body.pipeThrough(new TextDecoderStream()).getReader();
      let pendiente = '';
      for (;;) {
        const { value, done } = await lector.read();
        if (done) break;
        pendiente += value;
        const lineas = pendiente.split('\n');
        pendiente = lineas.pop() ?? '';
        for (const linea of lineas) {
          if (!linea.trim()) continue;
          const evento = JSON.parse(linea) as EventoAsistente;
          if (evento.tipo === 'texto') {
            setEstado('Escribiendo…');
            escribir(evento.texto);
          } else if (evento.tipo === 'herramienta') {
            setEstado(evento.descripcion);
            // Lo que venga despues de una herramienta es otro parrafo.
            if (respuesta && !respuesta.endsWith('\n')) escribir('\n\n');
          } else if (evento.tipo === 'error') {
            setError(evento.mensaje);
          }
        }
        final.current?.scrollIntoView({ block: 'end' });
      }
    } catch {
      setError('No he podido conectar con el asistente.');
    }

    // Si no llego texto, la pregunta se queda sin respuesta en la conversacion
    // y se puede repetir: el servidor exige que acabe en una pregunta.
    if (!respuesta.trim()) {
      setMensajes(mensajes);
      setBorrador(texto);
    }
    setEstado(null);
  }

  return (
    <div className="space-y-4">
      {mensajes.length === 0 && (
        <section className="space-y-2">
          <p className="text-sm text-texto-tenue">
            Pregúntale a Claude por tu colección. Conoce tus perfumes, sus notas, cuándo te los
            pones y puede mirar el tiempo.
          </p>
          {SUGERENCIAS.map((s) => (
            <button
              key={s}
              type="button"
              className="tarjeta block w-full text-left text-sm"
              onClick={() => preguntar(s)}
            >
              {s}
            </button>
          ))}
        </section>
      )}

      <ol className="space-y-3" aria-live="polite">
        {mensajes.map((m, i) =>
          m.rol === 'user' ? (
            <li key={i} className="ml-8 bg-superficie-alta p-3 text-sm">
              {m.texto}
            </li>
          ) : (
            <li key={i} className="tarjeta text-sm leading-relaxed text-texto">
              {m.texto ? <Formato texto={m.texto} /> : <span className="text-texto-tenue">{estado}</span>}
            </li>
          ),
        )}
      </ol>

      {trabajando && mensajes.at(-1)?.texto && <p className="text-xs text-texto-tenue">{estado}</p>}
      {error && <p className="text-sm text-id-nula">{error}</p>}
      <div ref={final} />

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          preguntar(borrador);
        }}
      >
        <label htmlFor="pregunta" className="sr-only">
          Pregunta
        </label>
        <textarea
          id="pregunta"
          rows={2}
          value={borrador}
          maxLength={4000}
          placeholder="¿Qué me pongo para…?"
          onChange={(e) => setBorrador(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              preguntar(borrador);
            }
          }}
        />
        <div className="flex gap-2">
          <button type="submit" className="boton-primario flex-1" disabled={trabajando || !borrador.trim()}>
            Preguntar
          </button>
          {mensajes.length > 0 && (
            <button
              type="button"
              className="boton-secundario"
              disabled={trabajando}
              onClick={() => {
                setMensajes([]);
                setError(null);
              }}
            >
              Nueva
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
