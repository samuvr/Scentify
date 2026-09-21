/**
 * Fase 2 contra PostgreSQL: lo que la logica pura no puede demostrar.
 * Se saltan solos si no hay `DATABASE_URL`.
 */
import { beforeAll, describe, expect, it } from 'vitest';

const cuando = process.env.DATABASE_URL ? describe : describe.skip;
const USUARIO = '00000000-0000-0000-0000-000000000001';

cuando('solapamiento de la wishlist (10.2)', () => {
  let wishlist: typeof import('@/servicios/wishlist');
  let perfumes: typeof import('@/servicios/perfumes');
  let consultas: typeof import('@/servicios/consultas');
  const sufijo = Date.now();

  beforeAll(async () => {
    wishlist = await import('@/servicios/wishlist');
    perfumes = await import('@/servicios/perfumes');
    consultas = await import('@/servicios/consultas');

    const contextos = await consultas.listarContextos(USUARIO);
    await perfumes.crearPerfume(USUARIO, {
      nombre: `Dulce ${sufijo}`,
      marca: 'Prueba',
      estado: 'LO_TENGO',
      notas: [
        { nombre: 'Vainilla', nivel: 'FONDO' },
        { nombre: 'Haba tonka', nivel: 'FONDO' },
        { nombre: 'Benjuí', nivel: 'FONDO' },
        // Una de salida, para comprobar que NO cuenta en el solapamiento.
        { nombre: 'Bergamota', nivel: 'SALIDA' },
      ],
      familiaIds: [],
      contextoIds: [contextos[0]!.id],
      estaciones: ['OTONO'],
      momentos: ['NOCHE'],
    });
  });

  it('avisa cuando el deseo comparte tres notas de fondo', async () => {
    const solapa = await wishlist.solapamientoConLaColeccion(USUARIO, [
      'Vainilla',
      'Haba tonka',
      'Benjuí',
    ]);
    expect(solapa.some((s) => s.nombre === `Dulce ${sufijo}`)).toBe(true);
  });

  it('solo cuentan las notas de FONDO, no la pirámide entera', async () => {
    const solapa = await wishlist.solapamientoConLaColeccion(USUARIO, [
      'Vainilla',
      'Haba tonka',
      'Bergamota',
    ]);
    // Bergamota es de salida en ese perfume, así que solo comparten dos.
    expect(solapa.some((s) => s.nombre === `Dulce ${sufijo}`)).toBe(false);
  });

  it('guarda y recupera las notas de fondo de un deseo', async () => {
    const id = await wishlist.crearDeseo(USUARIO, {
      nombre: `Deseo ${sufijo}`,
      marca: 'Prueba',
      prioridad: 'LO_QUIERO',
      notasFondo: ['Vainilla', 'Haba tonka', 'Benjuí'],
    });
    expect(await wishlist.notasFondoDeDeseo(id)).toEqual(['Vainilla', 'Haba tonka', 'Benjuí']);
    await wishlist.borrarDeseo(USUARIO, id);
  });
});

cuando('recordatorio diario (10.4)', () => {
  let recordatorio: typeof import('@/servicios/recordatorio');
  let ajustes: typeof import('@/servicios/ajustes');

  beforeAll(async () => {
    recordatorio = await import('@/servicios/recordatorio');
    ajustes = await import('@/servicios/ajustes');

    // Claves VAPID de verdad, generadas al vuelo: sin ellas la función se
    // planta antes de llegar a la lógica que se quiere probar.
    const webpush = (await import('web-push')).default;
    const claves = webpush.generateVAPIDKeys();
    process.env.VAPID_PUBLIC_KEY = claves.publicKey;
    process.env.VAPID_PRIVATE_KEY = claves.privateKey;
  });

  it('la hora local se lee en la zona del usuario, no en UTC', () => {
    const mediodiaUtc = new Date('2026-09-21T12:00:00Z');
    // En septiembre Madrid va dos horas por delante de UTC.
    expect(recordatorio.horaLocal('Europe/Madrid', mediodiaUtc)).toBe(14);
    expect(recordatorio.horaLocal('UTC', mediodiaUtc)).toBe(12);
  });

  it('la fecha local también: a las 23:30 UTC en Madrid ya es el día siguiente', () => {
    const casiMedianoche = new Date('2026-09-21T23:30:00Z');
    expect(recordatorio.fechaLocal('Europe/Madrid', casiMedianoche)).toBe('2026-09-22');
    expect(recordatorio.fechaLocal('UTC', casiMedianoche)).toBe('2026-09-21');
  });

  it('con el recordatorio desactivado no revisa a nadie', async () => {
    await ajustes.guardarAjuste(USUARIO, 'recordatorio', { activo: false, hora: 0 });
    const resultado = await recordatorio.enviarRecordatoriosPendientes();
    expect(resultado.revisados).toBe(0);
  });

  it('antes de la hora configurada no avisa', async () => {
    await ajustes.guardarAjuste(USUARIO, 'recordatorio', { activo: true, hora: 23 });
    // Las 06:00 en Madrid: aún faltan muchas horas para las 23.
    const resultado = await recordatorio.enviarRecordatoriosPendientes(
      new Date('2026-09-21T04:00:00Z'),
    );
    expect(resultado.revisados).toBe(1);
    expect(resultado.enviados).toBe(0);
  });

  it('no repite el aviso si la tarea programada se ejecuta dos veces', async () => {
    const { crearDb, schema } = await import('@/db');
    const { and, eq } = await import('drizzle-orm');
    const db = crearDb();

    await ajustes.guardarAjuste(USUARIO, 'recordatorio', { activo: true, hora: 1 });
    const ahora = new Date('2026-09-21T10:00:00Z'); // 12:00 en Madrid, pasada la hora
    const hoy = recordatorio.fechaLocal('Europe/Madrid', ahora);

    await db
      .delete(schema.recordatorioEnviado)
      .where(
        and(
          eq(schema.recordatorioEnviado.userId, USUARIO),
          eq(schema.recordatorioEnviado.fecha, hoy),
        ),
      );
    await db.delete(schema.uso).where(eq(schema.uso.fecha, hoy));

    const anotadosDeHoy = () =>
      db
        .select()
        .from(schema.recordatorioEnviado)
        .where(
          and(
            eq(schema.recordatorioEnviado.userId, USUARIO),
            eq(schema.recordatorioEnviado.fecha, hoy),
          ),
        );

    await recordatorio.enviarRecordatoriosPendientes(ahora);
    expect(await anotadosDeHoy()).toHaveLength(1);

    // La anotación es la puerta: con ella puesta, la segunda pasada no entra.
    // Se comprueba quitándola y viendo que entonces sí vuelve a anotar.
    await recordatorio.enviarRecordatoriosPendientes(ahora);
    expect(await anotadosDeHoy()).toHaveLength(1);

    await db
      .delete(schema.recordatorioEnviado)
      .where(
        and(
          eq(schema.recordatorioEnviado.userId, USUARIO),
          eq(schema.recordatorioEnviado.fecha, hoy),
        ),
      );
    await recordatorio.enviarRecordatoriosPendientes(ahora);
    expect(await anotadosDeHoy()).toHaveLength(1);

    // Y con un registro del día, no hay nada que recordar.
    await db
      .delete(schema.recordatorioEnviado)
      .where(
        and(
          eq(schema.recordatorioEnviado.userId, USUARIO),
          eq(schema.recordatorioEnviado.fecha, hoy),
        ),
      );
    const usos = await import('@/servicios/usos');
    const consultas = await import('@/servicios/consultas');
    const perfumes = await import('@/servicios/perfumes');
    const contextos = await consultas.listarContextos(USUARIO);
    const perfumeId = await perfumes.crearPerfume(USUARIO, {
      nombre: `Registrado ${Date.now()}`,
      marca: 'Prueba',
      estado: 'LO_TENGO',
      notas: [],
      familiaIds: [],
      contextoIds: [contextos[0]!.id],
      estaciones: ['OTONO'],
      momentos: ['DIA'],
    });
    await usos.registrarUso(USUARIO, {
      perfumeId,
      fecha: hoy,
      momento: 'DIA',
      contextoId: contextos[0]!.id,
      estacionesForzadas: ['OTONO'],
    });

    await recordatorio.enviarRecordatoriosPendientes(ahora);
    expect(await anotadosDeHoy()).toHaveLength(0);

    await ajustes.guardarAjuste(USUARIO, 'recordatorio', { activo: false, hora: 21 });
  });
});
