import Link from 'next/link';

/** La 404, en español y con salida, en vez de la de Next en ingles. */
export default function NoEncontrada() {
  return (
    <div className="space-y-4 pt-12 text-center">
      <h1 className="titulo">No está aquí</h1>
      <p className="text-texto-tenue">
        Esta pantalla no existe o ese perfume no es de tu colección.
      </p>
      <div className="flex flex-col gap-2">
        <Link href="/" className="boton-primario">
          Volver a Hoy
        </Link>
        <Link href="/coleccion" className="boton-secundario">
          Ir a la colección
        </Link>
      </div>
    </div>
  );
}
