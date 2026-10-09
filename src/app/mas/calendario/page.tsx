/**
 * Calendario: el mes de un vistazo, con cada dia marcado segun si tiene algun
 * perfume registrado. Lo que se busca aqui son los huecos —los dias que se
 * olvido apuntar— para entrar y registrarlos.
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { usuarioActual } from '@/servicios/auth';
import { zonaDelUsuario } from '@/servicios/zona';
import { hoyIso, usosPorDia } from '@/servicios/usos';
import {
  DIAS_SEMANA,
  desplazarMes,
  limitesDelMes,
  mesDe,
  mesOVacio,
  nombreMes,
  semanasDelMes,
  type DiaCalendario,
} from '@/dominio/calendario';

export const dynamic = 'force-dynamic';

const ESTILO_DIA: Record<DiaCalendario['estado'], string> = {
  REGISTRADO: 'border-acento/60 bg-acento/15 text-texto',
  SIN_REGISTRO: 'border-dashed border-id-nula/70 text-texto',
  FUTURO: 'border-borde/40 text-texto-tenue/60',
};

export default async function PaginaCalendario({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const userId = await usuarioActual();
  if (!userId) redirect('/login');

  const hoy = hoyIso(await zonaDelUsuario());
  const mesActual = mesDe(hoy);
  const mes = mesOVacio((await searchParams).mes) ?? mesActual;
  const { desde, hasta } = limitesDelMes(mes);
  const semanas = semanasDelMes(mes, await usosPorDia(userId, desde, hasta), hoy);

  const dias = semanas.flat().filter((d): d is DiaCalendario => d !== null);
  const registrados = dias.filter((d) => d.estado === 'REGISTRADO').length;
  const sinRegistro = dias.filter((d) => d.estado === 'SIN_REGISTRO').length;

  const enlaceMes = (m: string) => `/mas/calendario?mes=${m}`;
  const [anio] = mes.split('-');

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="titulo">Calendario</h1>
        <p className="text-sm text-texto-tenue">
          Pulsa un día para ver qué te pusiste o registrar lo que se te olvidó.
        </p>
      </header>

      <nav aria-label="Cambiar de mes" className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Link href={enlaceMes(desplazarMes(mes, -1))} className="boton-fantasma px-3" aria-label="Mes anterior">
            ‹
          </Link>
          <h2 className="font-display text-2xl font-semibold">{nombreMes(mes)}</h2>
          <Link href={enlaceMes(desplazarMes(mes, 1))} className="boton-fantasma px-3" aria-label="Mes siguiente">
            ›
          </Link>
        </div>
        <div className="flex items-center justify-between gap-2 text-sm">
          <Link href={enlaceMes(desplazarMes(mes, -12))} className="boton-fantasma px-2">
            « {Number(anio) - 1}
          </Link>
          {mes !== mesActual ? (
            <Link href={enlaceMes(mesActual)} className="chip">
              Volver a hoy
            </Link>
          ) : null}
          <Link href={enlaceMes(desplazarMes(mes, 12))} className="boton-fantasma px-2">
            {Number(anio) + 1} »
          </Link>
        </div>
      </nav>

      <section className="tarjeta space-y-2 p-2">
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-texto-tenue">
          {DIAS_SEMANA.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {semanas.flat().map((dia, i) =>
            dia ? (
              <Link
                key={dia.fecha}
                href={`/mas/calendario/${dia.fecha}`}
                aria-label={`${dia.dia}: ${
                  dia.usos > 0
                    ? `${dia.usos} ${dia.usos === 1 ? 'perfume' : 'perfumes'}`
                    : dia.estado === 'FUTURO'
                      ? 'todavía no ha llegado'
                      : 'sin registrar'
                }`}
                className={`flex aspect-square flex-col items-center justify-center border text-sm ${
                  ESTILO_DIA[dia.estado]
                } ${dia.esHoy ? 'outline outline-2 outline-offset-1 outline-acento' : ''}`}
              >
                <span className={dia.esHoy ? 'font-bold text-acento' : 'font-medium'}>{dia.dia}</span>
                <span aria-hidden="true" className="text-[10px] leading-none">
                  {dia.estado === 'REGISTRADO' ? (
                    <span className="text-acento">{dia.usos > 1 ? `●${dia.usos}` : '●'}</span>
                  ) : dia.estado === 'SIN_REGISTRO' ? (
                    <span className="text-id-nula">○</span>
                  ) : (
                    ' '
                  )}
                </span>
              </Link>
            ) : (
              <span key={`hueco-${i}`} aria-hidden="true" />
            ),
          )}
        </div>
      </section>

      <section className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-texto-tenue">
        <span>
          <span className="text-acento" aria-hidden="true">● </span>
          {registrados} {registrados === 1 ? 'día registrado' : 'días registrados'}
        </span>
        <span>
          <span className="text-id-nula" aria-hidden="true">○ </span>
          {sinRegistro} {sinRegistro === 1 ? 'día sin registrar' : 'días sin registrar'}
        </span>
      </section>
    </div>
  );
}
