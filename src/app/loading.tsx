/**
 * Lo que se ve mientras llega una pantalla. Todas son dinamicas, y con poca
 * cobertura pasaban segundos sin que el toque en la barra hiciera nada
 * visible: con esto el cambio es inmediato y el contenido llega detras.
 */
export default function Cargando() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      <div className="h-9 w-2/3 animate-pulse bg-superficie-alta motion-reduce:animate-none" />
      <div className="h-4 w-1/2 animate-pulse bg-superficie-alta motion-reduce:animate-none" />
      <div className="h-24 animate-pulse bg-superficie motion-reduce:animate-none" />
      <div className="h-24 animate-pulse bg-superficie motion-reduce:animate-none" />
    </div>
  );
}
