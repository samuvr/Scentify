/**
 * Seccion 10.4 — Tarea programada del recordatorio diario.
 *
 * La dispara el cron de Vercel (ver vercel.json). Se protege con CRON_SECRET
 * porque es una ruta publica: sin cabecera valida, 401.
 *
 * Es idempotente: si el cron se ejecuta dos veces el mismo dia, el segundo
 * intento no envia nada.
 */
import { NextResponse } from 'next/server';
import { enviarRecordatoriosPendientes, limpiarRecordatoriosViejos } from '@/servicios/recordatorio';

export const dynamic = 'force-dynamic';

function autorizado(peticion: Request): boolean {
  const esperado = process.env.CRON_SECRET;
  if (!esperado) return false;
  // Vercel manda `Authorization: Bearer <CRON_SECRET>` en sus crons.
  return peticion.headers.get('authorization') === `Bearer ${esperado}`;
}

export async function GET(peticion: Request) {
  if (!autorizado(peticion)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const resultado = await enviarRecordatoriosPendientes();
  await limpiarRecordatoriosViejos();
  return NextResponse.json(resultado);
}
