/**
 * Fichas compartidas entre cuentas, contra PostgreSQL. Se salta solo si no hay
 * `DATABASE_URL`.
 *
 * Lo que describe el perfume se da de alta una vez y el resto lo encuentra
 * hecho; lo personal (estaciones, momentos, contextos, inventario) sigue siendo
 * de cada frasco.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const cuando = process.env.DATABASE_URL ? describe : describe.skip;
// Las fichas sobreviven a las cuentas: nombres unicos por corrida.
const RONDA = crypto.randomUUID().slice(0, 8);

cuando('fichas compartidas', () => {
  let db: import('@/db').Db;
  let esquema: typeof import('@/db/schema');
  let orm: typeof import('drizzle-orm');
  let perfumes: typeof import('@/servicios/perfumes');
  let consultas: typeof import('@/servicios/consultas');
  let datos: typeof import('@/servicios/datos');
  const cuentas: string[] = [];

  async function cuenta(nombre: string) {
    const [u] = await db
      .insert(esquema.usuario)
      .values({ email: `${nombre}-${RONDA}@ejemplo.com`, passwordHash: '!' })
      .returning({ id: esquema.usuario.id });
    await db.execute(orm.sql`select sembrar_usuario(${u!.id}::uuid)`);
    cuentas.push(u!.id);
    const [contexto] = await consultas.listarContextos(u!.id);
    return { id: u!.id, contexto: contexto!.id };
  }

  const alta = (
    contextoId: string,
    extra: Partial<import('@/servicios/perfumes').DatosPerfume> = {},
  ): import('@/servicios/perfumes').DatosPerfume => ({
    nombre: `Sauvage ${RONDA}`,
    marca: 'Dior',
    concentracion: 'EDT',
    estado: 'LO_TENGO',
    notas: [
      { nombre: 'Bergamota', nivel: 'SALIDA' },
      { nombre: 'Ambroxan', nivel: 'FONDO' },
    ],
    familiaIds: [],
    contextoIds: [contextoId],
    estaciones: ['VERANO'],
    momentos: ['DIA'],
    ...extra,
  });

  const fichaDe = async (perfumeId: string) =>
    (await db.select().from(esquema.perfume).where(orm.eq(esquema.perfume.id, perfumeId)))[0]!
      .fichaId;

  let ana: { id: string; contexto: string };
  let bea: { id: string; contexto: string };
  let deAna: string;
  let deBea: string;

  beforeAll(async () => {
    db = (await import('@/db')).crearDb();
    esquema = await import('@/db/schema');
    orm = await import('drizzle-orm');
    perfumes = await import('@/servicios/perfumes');
    consultas = await import('@/servicios/consultas');
    datos = await import('@/servicios/datos');
    ana = await cuenta('ana');
    bea = await cuenta('bea');
    deAna = await perfumes.crearPerfume(ana.id, alta(ana.contexto));
  });

  afterAll(async () => {
    if (cuentas.length === 0) return;
    await db.delete(esquema.uso).where(orm.inArray(esquema.uso.userId, cuentas));
    await db.delete(esquema.perfume).where(orm.inArray(esquema.perfume.userId, cuentas));
    await db.delete(esquema.ficha).where(orm.like(esquema.ficha.nombre, `%${RONDA}%`));
    await db.delete(esquema.usuario).where(orm.inArray(esquema.usuario.id, cuentas));
  });

  it('lo que da de alta una cuenta aparece en el catálogo de las demás', async () => {
    const [encontrada] = await consultas.buscarEnCatalogo(bea.id, `sauvage ${RONDA}`);
    expect(encontrada).toMatchObject({ nombre: `Sauvage ${RONDA}`, marca: 'Dior', personas: 1 });
    // Bea no lo tiene; Ana si, y el catalogo se lo dice.
    expect(encontrada?.miPerfumeId).toBeNull();
    const [paraAna] = await consultas.buscarEnCatalogo(ana.id, `sauvage ${RONDA}`);
    expect(paraAna?.miPerfumeId).toBe(deAna);
  });

  it('la ficha trae notas y propone las estaciones y momentos de quien la dio de alta', async () => {
    const ficha = await consultas.fichaParaAlta(await fichaDe(deAna));
    expect(ficha?.notas.map((n) => n.nombre)).toEqual(['Bergamota', 'Ambroxán']);
    expect(ficha?.estaciones).toEqual(['VERANO']);
    expect(ficha?.momentos).toEqual(['DIA']);
  });

  it('dar de alta desde la ficha no la duplica, y lo personal es de cada uno', async () => {
    const fichaId = await fichaDe(deAna);
    deBea = await perfumes.crearPerfume(
      bea.id,
      alta(bea.contexto, { fichaId, estaciones: ['INVIERNO'], momentos: ['NOCHE'], valoracion: 2 }),
    );

    expect(await fichaDe(deBea)).toBe(fichaId);
    const deBeaFicha = await consultas.fichaDePerfume(bea.id, deBea);
    const deAnaFicha = await consultas.fichaDePerfume(ana.id, deAna);
    expect(deBeaFicha?.notas.map((n) => n.nombre)).toEqual(['Bergamota', 'Ambroxán']);
    expect(deBeaFicha?.estaciones).toEqual(['INVIERNO']);
    expect(deAnaFicha?.estaciones).toEqual(['VERANO']);
    expect(deAnaFicha?.perfume.valoracion).toBeNull();
    expect(deBeaFicha?.compartidaCon).toBe(1);
    expect(deAnaFicha?.compartidaCon).toBe(1);
  });

  it('un alta a mano de algo que ya existe se engancha a la ficha sin pisarla', async () => {
    const carlos = await cuenta('carlos');
    // Sin elegirla de la lista y sin notas: no debe dejar a los demás sin pirámide.
    const suyo = await perfumes.crearPerfume(
      carlos.id,
      alta(carlos.contexto, { nombre: `  SAUVAGE ${RONDA} `, notas: [], anioLanzamiento: 2015 }),
    );
    expect(await fichaDe(suyo)).toBe(await fichaDe(deAna));

    const deAnaFicha = await consultas.fichaDePerfume(ana.id, deAna);
    expect(deAnaFicha?.notas).toHaveLength(2);
    // Lo que faltaba si se rellena.
    expect(deAnaFicha?.perfume.anioLanzamiento).toBe(2015);
  });

  it('la misma marca y nombre en otra concentración es otra ficha', async () => {
    const edp = await perfumes.crearPerfume(ana.id, alta(ana.contexto, { concentracion: 'EDP' }));
    expect(await fichaDe(edp)).not.toBe(await fichaDe(deAna));
  });

  it('corregir la ficha la corrige para todos', async () => {
    await perfumes.actualizarPerfume(
      bea.id,
      deBea,
      alta(bea.contexto, {
        estaciones: ['INVIERNO'],
        momentos: ['NOCHE'],
        notas: [
          { nombre: 'Bergamota', nivel: 'SALIDA' },
          { nombre: 'Pimienta', nivel: 'CORAZON' },
          { nombre: 'Ambroxan', nivel: 'FONDO' },
        ],
      }),
    );
    const deAnaFicha = await consultas.fichaDePerfume(ana.id, deAna);
    expect(deAnaFicha?.notas.map((n) => n.nombre)).toEqual(['Bergamota', 'Pimienta', 'Ambroxán']);
    // Sus estaciones siguen siendo las suyas.
    expect(deAnaFicha?.estaciones).toEqual(['VERANO']);
  });

  it('cambiar la concentración a una que ya existe mueve el frasco a esa ficha', async () => {
    const dani = await cuenta('dani');
    const suyo = await perfumes.crearPerfume(
      dani.id,
      alta(dani.contexto, { concentracion: 'PARFUM', notas: [] }),
    );
    const suFicha = await fichaDe(suyo);
    // Era EDP y lo metio como PARFUM: al corregirlo va a la ficha del EDP...
    await perfumes.actualizarPerfume(dani.id, suyo, alta(dani.contexto, { concentracion: 'EDP' }));
    const [edp] = (await consultas.buscarEnCatalogo(dani.id, `sauvage ${RONDA}`)).filter(
      (f) => f.concentracion === 'EDP',
    );
    expect(await fichaDe(suyo)).toBe(edp!.id);
    // ...y la ficha equivocada, que ya no tenia a nadie, desaparece.
    const restos = await db.select().from(esquema.ficha).where(orm.eq(esquema.ficha.id, suFicha));
    expect(restos).toHaveLength(0);
  });

  it('una copia de antes de las fichas se restaura enganchándose al catálogo', async () => {
    const eva = await cuenta('eva');
    const [contexto] = await db
      .select()
      .from(esquema.contexto)
      .where(orm.eq(esquema.contexto.id, eva.contexto));
    const nueva = crypto.randomUUID();
    const conocida = crypto.randomUUID();
    const [ambar] = await db
      .select()
      .from(esquema.nota)
      .where(orm.eq(esquema.nota.nombreNormalizado, 'ambar'));
    const frasco = (id: string, nombre: string) => ({
      id,
      userId: eva.id,
      nombre,
      marca: 'Dior',
      concentracion: 'EDT' as const,
      anioLanzamiento: null,
      fragranticaUrl: null,
      volumenMl: 100,
      fechaCompra: null,
      estado: 'LO_TENGO' as const,
      valoracion: 4,
      notasPersonales: null,
      archivado: false,
      creadoEn: new Date(),
      actualizadoEn: new Date(),
    });

    await datos.restaurarCopia(eva.id, {
      version: 1,
      generado: new Date().toISOString(),
      perfumes: [frasco(conocida, `Sauvage ${RONDA}`), frasco(nueva, `Fahrenheit ${RONDA}`)],
      contextos: [contexto!],
      usos: [],
      wishlist: [],
      ajustes: [],
      notas: [ambar!],
      familias: [],
      perfumeNota: [
        { perfumeId: conocida, notaId: ambar!.id, nivel: 'FONDO', orden: 0 },
        { perfumeId: nueva, notaId: ambar!.id, nivel: 'FONDO', orden: 0 },
      ],
      perfumeFamilia: [],
      perfumeContexto: [
        { perfumeId: conocida, contextoId: contexto!.id },
        { perfumeId: nueva, contextoId: contexto!.id },
      ],
      perfumeEstacion: [
        { perfumeId: conocida, estacion: 'OTONO' },
        { perfumeId: nueva, estacion: 'OTONO' },
      ],
      perfumeMomento: [
        { perfumeId: conocida, momento: 'DIA' },
        { perfumeId: nueva, momento: 'DIA' },
      ],
    });

    // El que ya estaba en el catalogo comparte la ficha y no la pisa.
    expect(await fichaDe(conocida)).toBe(await fichaDe(deAna));
    const deAnaFicha = await consultas.fichaDePerfume(ana.id, deAna);
    expect(deAnaFicha?.notas.map((n) => n.nombre)).toEqual(['Bergamota', 'Pimienta', 'Ambroxán']);
    // El nuevo crea la suya, con su piramide.
    const nuevo = await consultas.fichaDePerfume(eva.id, nueva);
    expect(nuevo?.perfume.nombre).toBe(`Fahrenheit ${RONDA}`);
    expect(nuevo?.notas.map((n) => n.nombre)).toEqual(['Ámbar']);
    expect(nuevo?.perfume.valoracion).toBe(4);
  });
});
