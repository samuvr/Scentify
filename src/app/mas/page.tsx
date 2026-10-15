import Link from 'next/link';
import { redirect } from 'next/navigation';
import { usuarioActual } from '@/servicios/auth';
import { leerUltimaCopia } from '@/servicios/ajustes';
import { diasDesdeCopia, textoUltimaCopia, tocaCopia } from '@/dominio/copias';
import { accionCerrarSesion } from '../acciones';

export const dynamic = 'force-dynamic';

const SECCIONES = [
  { href: '/estadisticas', titulo: 'Estadísticas', descripcion: 'Qué te pones, cuándo y cuánto aciertas' },
  { href: '/mas/calendario', titulo: 'Calendario', descripcion: 'Qué te pusiste cada día y qué días no apuntaste' },
  { href: '/mas/wishlist', titulo: 'Wishlist', descripcion: 'Lo que quiero y a qué precio' },
  { href: '/mas/huecos', titulo: 'Huecos', descripcion: 'Qué combinaciones no cubre tu colección' },
  { href: '/mas/viaje', titulo: 'Modo viaje', descripcion: 'El set mínimo de frascos para lo que viene' },
  { href: '/mas/importador', titulo: 'Botón de Fragrantica', descripcion: 'Trae una ficha de un toque, sin copiar ni pegar' },
  { href: '/mas/configuracion', titulo: 'Configuración', descripcion: 'Ubicación y umbrales de temperatura' },
  { href: '/mas/datos', titulo: 'Datos', descripcion: 'Importar, exportar y copia de seguridad' },
];

export default async function PaginaMas() {
  const userId = await usuarioActual();
  if (!userId) redirect('/login');
  const dias = diasDesdeCopia(await leerUltimaCopia(userId));

  return (
    <div className="space-y-6">
      <h1 className="titulo">Más</h1>
      {/* Todo lo de la cuenta vive en una base: sin copia, un error la perderia. */}
      {tocaCopia(dias) ? (
        <Link href="/mas/datos" className="aviso-atencion block">
          {textoUltimaCopia(dias)} <span className="underline">Hacer una copia</span>
        </Link>
      ) : null}
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
