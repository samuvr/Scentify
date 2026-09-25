/** Pagina de reserva del service worker cuando no hay nada en cache. */
export const dynamic = 'force-static';

export default function PaginaSinConexion() {
  return (
    <div className="space-y-4 pt-16 text-center">
      <h1 className="titulo">Sin conexión</h1>
      <p className="text-texto-tenue">
        No se ha podido cargar esta pantalla. Lo que ya habías abierto sigue disponible, y los usos
        que registres se guardan en el móvil y se envían solos al volver la cobertura.
      </p>
      <a href="/" className="boton-primario inline-flex">
        Volver al inicio
      </a>
    </div>
  );
}
