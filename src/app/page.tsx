/**
 * Pantalla de inicio: el registro del dia y nada mas por encima.
 *
 * Es la pantalla del caso de uso principal —de pie, por la mañana, en menos de
 * diez segundos— asi que el buscador es lo primero que se ve y los accesos
 * rapidos estan a un toque.
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FormularioRegistro } from '@/componentes/FormularioRegistro';
import { TarjetaUso } from '@/componentes/TarjetaUso';
import { usuarioActual } from '@/servicios/auth';
import { zonaDelUsuario } from '@/servicios/zona';
import {
  candidatosParaRecomendar,
  coleccionParaRegistro,
  contextoHabitual,
  descartesDeHoy,
  listarContextos,
  usadosRecientemente,
  usoDeAyer,
} from '@/servicios/consultas';
import {
  desplazarDias,
  esFinDeSemana,
  ESPERA_CLIMA_PANTALLA_MS,
  estacionEfectivaDe,
  hoyIso,
  momentoDeAhora,
  usosDelDia,
} from '@/servicios/usos';
import { recomendar } from '@/dominio/recomendacion';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Hoy' };

export const dynamic = 'force-dynamic';

/** Cuantas sugerencias se traen: «↻» va pasando a la siguiente sin recargar. */
const SUGERENCIAS = 5;

export default async function PaginaHoy({
  searchParams,
}: {
  searchParams: Promise<{ registrado?: string; toque?: string; cierre?: string }>;
}) {
  const userId = await usuarioActual();
  if (!userId) redirect('/login');

  const { registrado, toque, cierre } = await searchParams;
  const zona = await zonaDelUsuario();
  const hoy = hoyIso(zona);
  const momento = momentoDeAhora(zona);
  const finde = esFinDeSemana(hoy);
  const [
    contextos,
    coleccion,
    recientes,
    ayer,
    registrados,
    estacion,
    habitualDia,
    habitualNoche,
    candidatos,
    descartados,
  ] = await Promise.all([
    listarContextos(userId),
    coleccionParaRegistro(userId),
    usadosRecientemente(userId),
    usoDeAyer(userId, desplazarDias(hoy, -1)),
    usosDelDia(userId, hoy),
    estacionEfectivaDe(userId, hoy, momento, undefined, {
      esperaMaximaMs: ESPERA_CLIMA_PANTALLA_MS,
    }),
    contextoHabitual(userId, 'DIA', finde),
    contextoHabitual(userId, 'NOCHE', finde),
    candidatosParaRecomendar(userId),
    descartesDeHoy(userId, hoy),
  ]);

  // La sugerencia del dia: el mismo motor que Sugerir, con el momento por la
  // hora y el contexto que el registro de un toque va a guardar. Sin lo que ya
  // se ha puesto hoy ni lo descartado con «Otro».
  const contextoAhora =
    contextos.find((c) => c.id === (momento === 'DIA' ? habitualDia : habitualNoche)) ??
    contextos[0];
  const yaHoy = new Set(registrados.map((u) => u.perfumeId));
  const sugerencias = contextoAhora
    ? recomendar({
        coleccion: candidatos,
        momento,
        contextoId: contextoAhora.id,
        estacionesCompatibles: estacion.estaciones,
        contextoAtemporal: contextoAhora.atemporal,
        hoy,
        descartados: [...descartados, ...yaHoy],
        nombreContexto: contextoAhora.nombre,
        limite: SUGERENCIAS,
      }).recomendaciones.map((r) => ({
        perfume: {
          id: r.perfume.id,
          nombre: r.perfume.nombre,
          marca: r.perfume.marca,
          spraysHabituales: r.perfume.promedios?.spraysHabituales ?? null,
        },
        motivo: r.motivo,
      }))
    : [];

  // Por la noche, o llegando desde el aviso, la tarjeta pregunta «¿Qué tal?».
  const preguntar = momento === 'NOCHE' || cierre === '1';
  const primeroSinCerrar = registrados.find(
    (u) => u.valoracionDia === null || u.duracionPercibida === null,
  );

  const seccionRegistrados =
    registrados.length > 0 ? (
      <section className="space-y-3">
        <h2 className="subtitulo">Registrado hoy · {registrados.length}</h2>
        <ul className="space-y-2">
          {registrados.map((uso) => (
            <TarjetaUso
              key={uso.id}
              uso={uso}
              preguntar={preguntar}
              enfocar={cierre === '1' && uso.id === primeroSinCerrar?.id}
            />
          ))}
        </ul>
      </section>
    ) : null;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="titulo">Hoy estoy usando…</h1>
        <p className="text-sm text-texto-tenue">
          {estacion.explicacion}{' '}
          <Link href="/mas/configuracion" className="underline underline-offset-2">
            Cambiar ubicación
          </Link>
        </p>
      </header>

      {registrado === 'manana' ? (
        <p className="aviso-hecho" role="status">
          Apuntado para mañana.
        </p>
      ) : registrado ? (
        <p className="aviso-hecho" role="status">
          Apuntado. Lo tienes en «Registrado hoy».
        </p>
      ) : null}

      {/* Con algo ya puesto, lo de hoy va primero: es lo que queda por cerrar. */}
      {seccionRegistrados}

      {contextos.length === 0 ? (
        <p className="tarjeta text-sm text-texto-tenue">
          No hay contextos configurados. Ejecuta las semillas con <code>npm run db:seed</code>.
        </p>
      ) : (
        <section className="space-y-3">
          {registrados.length > 0 ? <h2 className="subtitulo">¿Te pones otro?</h2> : null}
          <FormularioRegistro
            contextos={contextos.map((c) => ({ id: c.id, nombre: c.nombre }))}
            coleccion={coleccion}
            recientes={recientes.map((p) => ({
              id: p.id,
              nombre: p.nombre,
              marca: p.marca,
              spraysHabituales: p.spraysHabituales,
            }))}
            ayer={ayer}
            hoy={hoy}
            momentoInicial={momento}
            contextoPorMomento={{ DIA: habitualDia, NOCHE: habitualNoche }}
            registrados={[...yaHoy]}
            sugerencias={sugerencias}
            toque={toque}
          />
        </section>
      )}
    </div>
  );
}
