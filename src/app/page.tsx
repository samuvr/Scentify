/**
 * Pantalla de inicio: el registro del dia y nada mas por encima.
 *
 * Es la pantalla del caso de uso principal —de pie, por la mañana, en menos de
 * diez segundos— asi que el buscador es lo primero que se ve y los accesos
 * rapidos estan a un toque.
 */
import { redirect } from 'next/navigation';
import { FormularioRegistro } from '@/componentes/FormularioRegistro';
import { SincronizadorOffline } from '@/componentes/SincronizadorOffline';
import { InsigniaIdoneidad } from '@/componentes/Idoneidad';
import { usuarioActual } from '@/servicios/auth';
import { listarContextos, usadosRecientemente, usoDeAyer } from '@/servicios/consultas';
import { desplazarDias, estacionEfectivaDe, hoyIso, usosDelDia } from '@/servicios/usos';

export const dynamic = 'force-dynamic';

export default async function PaginaHoy() {
  const userId = await usuarioActual();
  if (!userId) redirect('/login');

  const hoy = hoyIso();
  const [contextos, recientes, ayer, registrados, estacion] = await Promise.all([
    listarContextos(userId),
    usadosRecientemente(userId),
    usoDeAyer(userId, desplazarDias(hoy, -1)),
    usosDelDia(userId, hoy),
    estacionEfectivaDe(userId, hoy, 'DIA'),
  ]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Hoy estoy usando…</h1>
        <p className="text-sm text-texto-tenue">{estacion.explicacion}</p>
      </header>

      <SincronizadorOffline />

      {contextos.length === 0 ? (
        <p className="tarjeta text-sm text-texto-tenue">
          No hay contextos configurados. Ejecuta las semillas con <code>npm run db:seed</code>.
        </p>
      ) : (
        <FormularioRegistro
          contextos={contextos.map((c) => ({ id: c.id, nombre: c.nombre }))}
          recientes={recientes.map((p) => ({ id: p.id, nombre: p.nombre, marca: p.marca }))}
          ayer={ayer}
          hoy={hoy}
        />
      )}

      {registrados.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            Registrado hoy ({registrados.length})
          </h2>
          <ul className="space-y-2">
            {registrados.map((uso) => (
              <li key={uso.id} className="tarjeta flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{uso.nombre}</p>
                  <p className="text-sm text-texto-tenue">
                    {uso.marca} · {uso.momento === 'DIA' ? 'Día' : 'Noche'} · {uso.contexto}
                    {uso.sprays !== null ? ` · ${uso.sprays} sprays` : ''}
                  </p>
                </div>
                <InsigniaIdoneidad pct={uso.idoneidadPct} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
