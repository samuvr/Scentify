/**
 * Lo que manda el boton «Enviar a Scentify» (y el Atajo de iOS) desde la
 * ficha abierta en el navegador: la direccion y el texto de la pagina.
 *
 * Lo llama la pagina `/importar`, que es de este mismo sitio, asi que la
 * cookie de sesion viaja. Si el marcador hiciera un POST directo desde
 * fragrantica.com, la cookie `SameSite=Lax` no iria y lo compartido se
 * perderia en el login.
 *
 * No escribe nada en la base de datos: devuelve a donde ir, con la ficha ya
 * leida en la URL, y los votos mueren en el formulario (5.3).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { usuarioActual } from '@/servicios/auth';
import { destinoDeCompartido } from '@/servicios/compartido';

const esquema = z.object({
  url: z.string().max(2000).optional(),
  texto: z.string().max(500_000).optional(),
});

export async function POST(peticion: Request) {
  if (!(await usuarioActual())) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const analisis = esquema.safeParse(await peticion.json().catch(() => null));
  if (!analisis.success) return NextResponse.json({ error: 'Parámetros' }, { status: 400 });

  const { url, texto } = analisis.data;
  return NextResponse.json({ destino: destinoDeCompartido({ url, text: texto }) });
}
