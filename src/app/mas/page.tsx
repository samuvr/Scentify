import Link from 'next/link';
import { redirect } from 'next/navigation';
import { usuarioActual } from '@/servicios/auth';
import { accionCerrarSesion } from '../acciones';

export const dynamic = 'force-dynamic';

const SECCIONES = [
  { href: '/mas/wishlist', titulo: 'Wishlist', descripcion: 'Lo que quiero y a qué precio' },
  { href: '/mas/configuracion', titulo: 'Configuración', descripcion: 'Ubicación y umbrales de temperatura' },
  { href: '/mas/datos', titulo: 'Datos', descripcion: 'Importar, exportar y copia de seguridad' },
];

export default async function PaginaMas() {
  if (!(await usuarioActual())) redirect('/login');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Más</h1>
      <ul className="space-y-2">
        {SECCIONES.map((s) => (
          <li key={s.href}>
            <Link href={s.href} className="tarjeta block">
              <p className="font-semibold">{s.titulo}</p>
              <p className="text-sm text-texto-tenue">{s.descripcion}</p>
            </Link>
          </li>
        ))}
      </ul>
      <form action={accionCerrarSesion}>
        <button type="submit" className="boton-secundario w-full">
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}
