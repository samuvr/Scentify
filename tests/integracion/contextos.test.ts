/**
 * Frecuencia real de un contexto y guardado de lo que el contexto dice de si
 * mismo. Los usos van a un contexto propio (archivado, para no aparecer en las
 * pantallas ni en otros tests) y a fechas que no pisa nadie.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import { usuarioDePruebas } from './usuario';

const cuando = process.env.DATABASE_URL ? describe : describe.skip;
let USUARIO: string;

cuando('contextos: frecuencia real y configuración', () => {
  const sufijo = Date.now();
  let contextoId: string;

  beforeAll(async () => {
    USUARIO = await usuarioDePruebas();
    const { crearDb, schema } = await import('@/db');
    const perfumes = await import('@/servicios/perfumes');
    const usos = await import('@/servicios/usos');

    const [contexto] = await crearDb()
      .insert(schema.contexto)
      .values({ userId: USUARIO, slug: `frecuencia-${sufijo}`, nombre: 'Frecuencia', orden: 999, archivado: true })
      .returning({ id: schema.contexto.id });
    contextoId = contexto!.id;

    const nuevo = (nombre: string) =>
      perfumes.crearPerfume(USUARIO, {
        nombre: `${nombre} ${sufijo}`,
        marca: 'Prueba',
        estado: 'LO_TENGO',
        notas: [],
        familiaIds: [],
        contextoIds: [contextoId],
        estaciones: ['INVIERNO'],
        momentos: ['DIA', 'NOCHE'],
      });
    const uno = await nuevo('Uno');
    const otro = await nuevo('Otro');

    const base = { contextoId, estacionesForzadas: ['INVIERNO' as const] };
    // Mucho antes: asegura que el historial es mas largo que la ventana.
    await usos.registrarUso(USUARIO, { ...base, perfumeId: uno, fecha: '2002-01-01', momento: 'DIA' });
    // Dos perfumes el mismo dia y momento son una sola ocasion.
    await usos.registrarUso(USUARIO, { ...base, perfumeId: uno, fecha: '2003-03-01', momento: 'DIA' });
    await usos.registrarUso(USUARIO, { ...base, perfumeId: otro, fecha: '2003-03-01', momento: 'DIA' });
    await usos.registrarUso(USUARIO, { ...base, perfumeId: uno, fecha: '2003-03-02', momento: 'NOCHE' });
  });

  it('cuenta ocasiones por semana en los últimos 90 días y la parte de noche', async () => {
    const { frecuenciaRealDeContextos } = await import('@/servicios/consultas');
    const real = await frecuenciaRealDeContextos(USUARIO, '2003-03-31');
    // 2 ocasiones en 90 dias (12,86 semanas): 0,16 → 0,2 por semana; una de noche.
    expect(real.get(contextoId)).toEqual({ usosSemana: 0.2, pctNoche: 50 });
  });

  it('guarda momentos, frecuencia y % de noche, y solo en contextos propios', async () => {
    const { guardarContextos } = await import('@/servicios/ajustes');
    const { crearDb, schema } = await import('@/db');
    const { eq } = await import('drizzle-orm');

    await guardarContextos(
      USUARIO,
      new Map([
        [contextoId, { atemporal: false, momentos: ['DIA' as const], usosSemana: 0.5, pctNoche: 80 }],
        [
          '00000000-0000-0000-0000-00000000dead',
          { atemporal: true, momentos: ['NOCHE' as const], usosSemana: 1, pctNoche: 0 },
        ],
      ]),
    );
    const [fila] = await crearDb()
      .select()
      .from(schema.contexto)
      .where(eq(schema.contexto.id, contextoId));
    expect(fila).toMatchObject({ atemporal: false, momentos: ['DIA'], usosSemana: 0.5, pctNoche: 80 });
  });
});
