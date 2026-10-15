/**
 * Flujos que antes se cortaban a un paso del final, y la recategorizacion,
 * contra PostgreSQL. Se salta solo si no hay `DATABASE_URL`.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { usuarioDePruebas } from './usuario';

const cuando = process.env.DATABASE_URL ? describe : describe.skip;

cuando('flujos cerrados y recategorizacion', () => {
  let USUARIO: string;
  let perfumes: typeof import('@/servicios/perfumes');
  let usos: typeof import('@/servicios/usos');
  let consultas: typeof import('@/servicios/consultas');
  let recategorizacion: typeof import('@/servicios/recategorizacion');
  let contextos: string[];
  const sufijo = crypto.randomUUID().slice(0, 8);

  const alta = (nombre: string, extra: Partial<import('@/servicios/perfumes').DatosPerfume> = {}) => ({
    nombre,
    marca: 'Flujos',
    estado: 'LO_TENGO' as const,
    notas: [],
    familiaIds: [],
    contextoIds: [contextos[0]!],
    estaciones: ['OTONO' as const],
    momentos: ['NOCHE' as const],
    ...extra,
  });

  beforeAll(async () => {
    USUARIO = await usuarioDePruebas();
    perfumes = await import('@/servicios/perfumes');
    usos = await import('@/servicios/usos');
    consultas = await import('@/servicios/consultas');
    recategorizacion = await import('@/servicios/recategorizacion');
    contextos = (await consultas.listarContextos(USUARIO)).map((c) => c.id);
  });

  it('un segundo frasco del mismo perfume pide confirmación', async () => {
    const nombre = `Duplicado ${sufijo}`;
    const primero = await perfumes.crearPerfume(USUARIO, alta(nombre));
    await expect(perfumes.crearPerfume(USUARIO, alta(nombre))).rejects.toMatchObject({
      perfumeId: primero,
    });
    // Escrito de otra forma, es la misma ficha.
    await expect(perfumes.crearPerfume(USUARIO, alta(nombre.toUpperCase()))).rejects.toThrow(
      'Ya tienes este perfume',
    );
    // Confirmado, se crea.
    const segundo = await perfumes.crearPerfume(USUARIO, { ...alta(nombre), confirmarDuplicado: true });
    expect(segundo).not.toBe(primero);
  });

  it('un deseo convertido sale de la wishlist', async () => {
    const wishlist = await import('@/servicios/wishlist');
    const deseoId = await wishlist.crearDeseo(USUARIO, {
      nombre: `Deseo ${sufijo}`,
      marca: 'Flujos',
      prioridad: 'LO_QUIERO',
    });
    const perfumeId = await perfumes.crearPerfume(USUARIO, alta(`Deseo ${sufijo}`));
    await wishlist.marcarConvertido(USUARIO, deseoId, perfumeId);
    const deseo = (await consultas.listarWishlist(USUARIO)).find((d) => d.id === deseoId);
    expect(deseo?.convertidoAPerfumeId).toBe(perfumeId);
  });

  it('propone añadir lo que haces y aplica solo ese cambio', async () => {
    const perfumeId = await perfumes.crearPerfume(USUARIO, alta(`Recategorizar ${sufijo}`));
    const hoy = usos.hoyIso();
    for (const dias of [1, 3, 5, 8]) {
      await usos.registrarUso(USUARIO, {
        perfumeId,
        fecha: usos.desplazarDias(hoy, -dias),
        momento: 'NOCHE',
        contextoId: contextos[1]!,
        valoracionDia: 4,
        estacionesForzadas: ['OTONO'],
      });
    }

    const propuestas = await recategorizacion.propuestasDeLaColeccion(USUARIO, hoy, perfumeId);
    const añadir = propuestas.find((p) => p.eje === 'contexto' && p.accion === 'añadir');
    expect(añadir).toMatchObject({ valor: contextos[1], usos: 4, valoracionMedia: 4 });

    // «Fue casualidad» la oculta.
    await recategorizacion.rechazarPropuesta(USUARIO, perfumeId, 'contexto', contextos[1]!, hoy);
    expect(
      (await recategorizacion.propuestasDeLaColeccion(USUARIO, hoy, perfumeId)).find(
        (p) => p.valor === contextos[1],
      ),
    ).toBeUndefined();

    await recategorizacion.ajustarMarca(USUARIO, perfumeId, 'contexto', contextos[1]!, 'añadir');
    const marcas = await consultas.marcasParaIdoneidad(perfumeId);
    expect(marcas.contextos.sort()).toEqual([contextos[0]!, contextos[1]!].sort());
  });

  it('no deja un eje vacío ni toca perfumes ajenos', async () => {
    const perfumeId = await perfumes.crearPerfume(USUARIO, alta(`Eje ${sufijo}`));
    await expect(
      recategorizacion.ajustarMarca(USUARIO, perfumeId, 'momento', 'NOCHE', 'quitar'),
    ).rejects.toThrow('al menos un momento');
    await expect(
      recategorizacion.ajustarMarca(crypto.randomUUID(), perfumeId, 'momento', 'DIA', 'añadir'),
    ).rejects.toThrow('Perfume no encontrado');
    await expect(
      recategorizacion.ajustarMarca(USUARIO, perfumeId, 'estacion', 'NAVIDAD', 'añadir'),
    ).rejects.toThrow('Estación no válida');
  });

  it('«lo de siempre» del aviso es el más usado últimamente, con su contexto habitual', async () => {
    // En una fecha lejana y distinta en cada ejecución, para no mezclarse con
    // los usos de otros tests ni con los de ejecuciones anteriores.
    const base = usos.desplazarDias('2040-01-01', 20 * Math.floor(Math.random() * 5000));
    const favorito = await perfumes.crearPerfume(USUARIO, alta(`Favorito ${sufijo}`));
    const otro = await perfumes.crearPerfume(USUARIO, alta(`Otro ${sufijo}`));
    for (const [perfumeId, dias] of [
      [favorito, [1, 2, 3]],
      [otro, [4]],
    ] as const) {
      for (const d of dias) {
        await usos.registrarUso(USUARIO, {
          perfumeId,
          fecha: usos.desplazarDias(base, -d),
          momento: 'DIA',
          contextoId: contextos[2]!,
          sprays: 5,
          estacionesForzadas: ['OTONO'],
        });
      }
    }
    const habitual = await consultas.perfumeHabitual(USUARIO, usos.desplazarDias(base, -10));
    expect(habitual).toMatchObject({
      perfumeId: favorito,
      momento: 'DIA',
      contextoId: contextos[2],
      sprays: 5,
    });
    expect(habitual?.contexto).toBeTruthy();
  });
});
