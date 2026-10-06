/**
 * Actualizar la coleccion desde Excel, contra PostgreSQL: la hoja que se
 * descarga vuelve a entrar, y lo que se cambia en ella llega a la base de
 * datos. Se salta solo si no hay `DATABASE_URL`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';

const cuando = process.env.DATABASE_URL ? describe : describe.skip;
const RONDA = crypto.randomUUID().slice(0, 8);

cuando('actualizar la colección desde Excel', () => {
  let db: import('@/db').Db;
  let esquema: typeof import('@/db/schema');
  let orm: typeof import('drizzle-orm');
  let perfumes: typeof import('@/servicios/perfumes');
  let hoja: typeof import('@/servicios/hoja-actualizacion');
  let usuario: string;
  let khamrah: string;
  let sauvage: string;
  let fichaEdpExistente: string;

  beforeAll(async () => {
    db = (await import('@/db')).crearDb();
    esquema = await import('@/db/schema');
    orm = await import('drizzle-orm');
    perfumes = await import('@/servicios/perfumes');
    hoja = await import('@/servicios/hoja-actualizacion');
    const consultas = await import('@/servicios/consultas');

    const [u] = await db
      .insert(esquema.usuario)
      .values({ email: `hoja-${RONDA}@ejemplo.com`, passwordHash: '!' })
      .returning({ id: esquema.usuario.id });
    usuario = u!.id;
    await db.execute(orm.sql`select sembrar_usuario(${usuario}::uuid)`);
    const [contexto] = await consultas.listarContextos(usuario);

    const alta = (nombre: string, concentracion: 'EDT' | 'EDP') => ({
      nombre,
      marca: 'Prueba',
      concentracion,
      estado: 'LO_TENGO' as const,
      volumenMl: 100,
      valoracion: 3,
      notas: [{ nombre: 'Vainilla', nivel: 'FONDO' as const }],
      familiaIds: [],
      contextoIds: [contexto!.id],
      estaciones: ['OTONO' as const],
      momentos: ['NOCHE' as const],
    });
    khamrah = await perfumes.crearPerfume(usuario, alta(`Khamrah ${RONDA}`, 'EDP'));
    sauvage = await perfumes.crearPerfume(usuario, alta(`Sauvage ${RONDA}`, 'EDT'));
    // Ya existe en el catalogo la ficha del EDP: al corregir, el frasco pasa a ella.
    fichaEdpExistente = await perfumes.resolverFicha(usuario, {
      ...alta(`Sauvage ${RONDA}`, 'EDP'),
    });
  });

  afterAll(async () => {
    if (!usuario) return;
    await db.delete(esquema.perfume).where(orm.eq(esquema.perfume.userId, usuario));
    await db.delete(esquema.ficha).where(orm.like(esquema.ficha.nombre, `%${RONDA}%`));
    await db.delete(esquema.usuario).where(orm.eq(esquema.usuario.id, usuario));
  });

  it('la hoja descargada, sin tocar, no cambia nada', async () => {
    const fichero = await hoja.exportarHojaActualizacion(usuario);
    const previa = await hoja.previsualizarHoja(usuario, new Uint8Array(fichero).buffer);
    expect(previa.errores).toEqual([]);
    expect(previa.cambios).toEqual([]);
    expect(previa.sinCambios).toBe(2);
  });

  it('aplica la concentración, el volumen y la valoración editados en Excel', async () => {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(new Uint8Array(await hoja.exportarHojaActualizacion(usuario)).buffer);
    const h = libro.worksheets[0]!;
    h.eachRow((fila, n) => {
      if (n === 1) return;
      if (fila.getCell(1).value === khamrah) {
        fila.getCell(5).value = 50;
        fila.getCell(6).value = 5;
      }
      if (fila.getCell(1).value === sauvage) {
        fila.getCell(4).value = 'EDP';
        fila.getCell(6).value = null;
      }
    });
    const editado = new Uint8Array(await libro.xlsx.writeBuffer()).buffer;

    const resultado = await hoja.aplicarHoja(usuario, editado);
    expect(resultado).toEqual({ actualizados: 2, errores: [] });

    const frascos = await db
      .select({
        id: esquema.perfume.id,
        fichaId: esquema.perfume.fichaId,
        volumenMl: esquema.perfume.volumenMl,
        valoracion: esquema.perfume.valoracion,
        concentracion: esquema.ficha.concentracion,
      })
      .from(esquema.perfume)
      .innerJoin(esquema.ficha, orm.eq(esquema.ficha.id, esquema.perfume.fichaId))
      .where(orm.eq(esquema.perfume.userId, usuario));
    const de = (id: string) => frascos.find((f) => f.id === id)!;

    expect(de(khamrah)).toMatchObject({ volumenMl: 50, valoracion: 5, concentracion: 'EDP' });
    expect(de(sauvage)).toMatchObject({
      volumenMl: 100,
      valoracion: null,
      concentracion: 'EDP',
      fichaId: fichaEdpExistente,
    });

    // Aplicar la misma hoja otra vez ya no tiene nada que hacer.
    expect(await hoja.aplicarHoja(usuario, editado)).toEqual({ actualizados: 0, errores: [] });
  });
});
