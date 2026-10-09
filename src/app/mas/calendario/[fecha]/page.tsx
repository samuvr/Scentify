/**
 * Un dia del calendario: lo que se registro y, si ya ha llegado, el mismo
 * formulario de la pantalla de inicio apuntando a esa fecha para completar lo
 * que falte.
 */
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { FormularioRegistro } from '@/componentes/FormularioRegistro';
import { InsigniaIdoneidad } from '@/componentes/Idoneidad';
import { usuarioActual } from '@/servicios/auth';
import { zonaDelUsuario } from '@/servicios/zona';
import { contextoHabitual, listarContextos, usadosRecientemente } from '@/servicios/consultas';
import { desplazarDias, esFinDeSemana, hoyIso, momentoDeAhora, usosDelDia } from '@/servicios/usos';
import { esFechaIso } from '@/dominio/navegacion';
import { fechaLarga, mesDe } from '@/dominio/calendario';

export const dynamic = 'force-dynamic';

export default async function PaginaDiaCalendario({
  params,
}: {
  params: Promise<{ fecha: string }>;
}) {
  const userId = await usuarioActual();
  if (!userId) redirect('/login');

  const { fecha } = await params;
  if (!esFechaIso(fecha)) notFound();

  const zona = await zonaDelUsuario();
  const hoy = hoyIso(zona);
  const esHoy = fecha === hoy;
  const pasado = fecha <= hoy;
  // Para hoy, el momento que toca por la hora; para otro dia, el de dia.
  const momento = esHoy ? momentoDeAhora(zona) : 'DIA';
  const finde = esFinDeSemana(fecha);

  const [registrados, contextos, recientes, habitualDia, habitualNoche] = await Promise.all([
    usosDelDia(userId, fecha),
    pasado ? listarContextos(userId) : Promise.resolve([]),
    pasado ? usadosRecientemente(userId) : Promise.resolve([]),
    pasado ? contextoHabitual(userId, 'DIA', finde) : Promise.resolve(null),
    pasado ? contextoHabitual(userId, 'NOCHE', finde) : Promise.resolve(null),
  ]);

  const anterior = desplazarDias(fecha, -1);
  const siguiente = desplazarDias(fecha, 1);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link href={`/mas/calendario?mes=${mesDe(fecha)}`} className="text-sm text-texto-tenue underline underline-offset-2">
          ‹ Calendario
        </Link>
        <div className="flex items-center justify-between gap-2">
          <Link href={`/mas/calendario/${anterior}`} className="boton-fantasma px-3" aria-label="Día anterior">
            ‹
          </Link>
          <h1 className="titulo text-center text-xl first-letter:uppercase">
            {esHoy ? 'Hoy' : fechaLarga(fecha)}
          </h1>
          <Link href={`/mas/calendario/${siguiente}`} className="boton-fantasma px-3" aria-label="Día siguiente">
            ›
          </Link>
        </div>
        {esHoy ? <p className="text-center text-sm text-texto-tenue">{fechaLarga(fecha)}</p> : null}
      </header>

      <section className="space-y-3">
        <h2 className="subtitulo">
          {registrados.length > 0 ? `Registrado · ${registrados.length}` : 'Registrado'}
        </h2>
        {registrados.length === 0 ? (
          <p className="tarjeta text-sm text-texto-tenue">
            {pasado
              ? 'Este día no registraste ningún perfume.'
              : 'Este día todavía no ha llegado y no tiene nada apuntado.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {registrados.map((uso) => (
              <li key={uso.id}>
                <Link href={`/coleccion/${uso.perfumeId}`} className="tarjeta flex items-start justify-between gap-3">
                  <div>
                    <p className="nombre-perfume text-lg">{uso.nombre}</p>
                    <p className="text-sm text-texto-tenue">
                      {uso.marca} · {uso.momento === 'DIA' ? 'Día' : 'Noche'} · {uso.contexto}
                      {uso.sprays !== null ? ` · ${uso.sprays} sprays` : ''}
                    </p>
                  </div>
                  <InsigniaIdoneidad pct={uso.idoneidadPct} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {pasado && contextos.length > 0 ? (
        <section className="space-y-3">
          <h2 className="subtitulo">
            {registrados.length > 0 ? 'Añadir otro' : 'Registrar este día'}
          </h2>
          <FormularioRegistro
            // Una instancia por fecha: al cambiar de dia no se arrastra lo a medias.
            key={fecha}
            contextos={contextos.map((c) => ({ id: c.id, nombre: c.nombre }))}
            recientes={recientes.map((p) => ({
              id: p.id,
              nombre: p.nombre,
              marca: p.marca,
              spraysHabituales: p.spraysHabituales,
            }))}
            ayer={null}
            hoy={hoy}
            momentoInicial={momento}
            contextoPorMomento={{ DIA: habitualDia, NOCHE: habitualNoche }}
            fechaFija={fecha}
          />
        </section>
      ) : null}
    </div>
  );
}
