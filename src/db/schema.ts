/**
 * Esquema de datos de Scentify — seccion 3 de la especificacion.
 *
 * Reglas duras que el esquema hace cumplir a nivel de base de datos:
 *  - Un perfume nunca se borra, se archiva: `uso.perfume_id` es ON DELETE RESTRICT,
 *    de modo que un DELETE sobre un perfume con historial falla.
 *  - Los votos de Fragrantica no se persisten: no hay ninguna columna de votos en
 *    `perfume_estacion` ni en `perfume_momento`. Solo se conserva `fragrantica_url`.
 *  - La idoneidad de un uso es un snapshot: se guarda calculada y no se recalcula
 *    nunca, aunque el perfume cambie despues.
 *
 * Reglas que el esquema NO puede hacer cumplir y se validan en la capa de dominio
 * (con Zod) porque son cardinalidades minimas sobre tablas hijas:
 *  - Minimo un contexto, una estacion y un momento por perfume.
 */
import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  decimal,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/* ------------------------------------------------------------------ enums */

export const concentracionEnum = pgEnum('concentracion', [
  'EDC',
  'EDT',
  'EDP',
  'EXTRAIT',
  'PARFUM',
  'ACEITE',
  'OTRO',
]);

export const estadoPerfumeEnum = pgEnum('estado_perfume', ['LO_TENGO', 'LO_TUVE']);

export const nivelPiramideEnum = pgEnum('nivel_piramide', ['SALIDA', 'CORAZON', 'FONDO']);

export const estacionEnum = pgEnum('estacion', ['PRIMAVERA', 'VERANO', 'OTONO', 'INVIERNO']);

export const momentoEnum = pgEnum('momento', ['DIA', 'NOCHE']);

export const duracionPercibidaEnum = pgEnum('duracion_percibida', [
  'MENOS_2H',
  'DE_2_4H',
  'DE_4_6H',
  'DE_6_8H',
  'MAS_8H',
]);

export const prioridadWishlistEnum = pgEnum('prioridad_wishlist', [
  'EN_EL_RADAR',
  'LO_QUIERO',
  'LO_NECESITO',
]);

/** Como se obtuvo la estacion efectiva de un uso. Ver seccion 7.1 y su fallback. */
export const origenEstacionEnum = pgEnum('origen_estacion', [
  'TEMPERATURA',
  'CALENDARIO',
  'MANUAL',
]);

/* --------------------------------------------------------------- usuarios */

/**
 * Las tablas principales llevan `user_id` desde el primer dia (seccion 2), y
 * eso es lo que ha permitido abrir cuentas a mas personas. Las tablas hijas
 * de un frasco (`perfume_contexto`, `perfume_estacion`, `perfume_momento`) no
 * lo llevan: cuelgan del perfume, y es el servicio quien comprueba que ese
 * perfume es propio. Las fichas, en cambio, son comunes a todos.
 */
export const usuario = pgTable('usuario', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------- vocabulario compartido */

/**
 * Notas olfativas. Vocabulario global y no por usuario: la deduplicacion por
 * nombre normalizado solo tiene sentido si el catalogo es unico.
 * `nombre` conserva la grafia bonita ("Ámbar gris"); `nombre_normalizado` es la
 * clave de deduplicacion (minusculas, sin acentos).
 */
export const nota = pgTable(
  'nota',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nombre: text('nombre').notNull(),
    nombreNormalizado: text('nombre_normalizado').notNull().unique(),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_nota_normalizado').on(t.nombreNormalizado)],
);

/** Familias olfativas y acordes principales. Tambien vocabulario global. */
export const familia = pgTable('familia', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  nombre: text('nombre').notNull(),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Contextos: tabla y no enum en codigo, para anadir o renombrar sin tocar el build.
 * Describen entorno social y formalidad, nunca la hora del dia: el eje dia/noche
 * es independiente y duplicarlo romperia el calculo de idoneidad.
 */
export const contexto = pgTable(
  'contexto',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usuario.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    nombre: text('nombre').notNull(),
    orden: smallint('orden').notNull().default(0),
    archivado: boolean('archivado').notNull().default(false),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('uq_contexto_usuario_slug').on(t.userId, t.slug)],
);

/* ---------------------------------------------------------------- fichas */

/**
 * La ficha de un perfume: lo que es igual para quien lo tenga. Catalogo comun
 * a todas las cuentas, como las notas y las familias, para que un perfume se
 * de de alta una sola vez y el resto lo encuentre ya hecho.
 *
 * Lo personal —cuando me lo pongo, cuanto me queda, que me parece— vive en
 * `perfume`, que es el frasco de cada uno y apunta aqui.
 *
 * Un mismo nombre y marca en dos concentraciones son perfumes distintos (el EDT
 * y el EDP huelen distinto), asi que la clave de deduplicacion incluye la
 * concentracion.
 */
export const ficha = pgTable(
  'ficha',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nombre: text('nombre').notNull(),
    marca: text('marca').notNull(),
    /** Clave de busqueda insensible a acentos y mayusculas (seccion 6.1). */
    busquedaNormalizada: text('busqueda_normalizada').notNull(),
    concentracion: concentracionEnum('concentracion'),
    anioLanzamiento: integer('anio_lanzamiento'),
    /** Se conserva para poder reconsultar bajo demanda. Los votos no se persisten. */
    fragranticaUrl: text('fragrantica_url'),
    /** Quien la dio de alta. Si esa cuenta desaparece, la ficha sigue. */
    creadaPor: uuid('creada_por').references(() => usuario.id, { onDelete: 'set null' }),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'ck_ficha_anio',
      sql`${t.anioLanzamiento} is null or ${t.anioLanzamiento} between 1700 and 2200`,
    ),
    // Dos indices parciales y no uno con coalesce: el paso de enum a texto no
    // es IMMUTABLE y Postgres no lo admite en un indice. Y NULLS NOT DISTINCT
    // exige Postgres 15, que no todos los proyectos de Neon tienen.
    uniqueIndex('uq_ficha_clave')
      .on(t.busquedaNormalizada, t.concentracion)
      .where(sql`${t.concentracion} is not null`),
    uniqueIndex('uq_ficha_clave_sin_concentracion')
      .on(t.busquedaNormalizada)
      .where(sql`${t.concentracion} is null`),
    index('idx_ficha_busqueda').on(t.busquedaNormalizada),
  ],
);

/** Piramide olfativa normalizada: permite filtrar y hacer estadistica por nota. */
export const fichaNota = pgTable(
  'ficha_nota',
  {
    fichaId: uuid('ficha_id')
      .notNull()
      .references(() => ficha.id, { onDelete: 'cascade' }),
    notaId: uuid('nota_id')
      .notNull()
      .references(() => nota.id, { onDelete: 'restrict' }),
    nivel: nivelPiramideEnum('nivel').notNull(),
    orden: smallint('orden').notNull().default(0),
  },
  (t) => [
    primaryKey({ name: 'pk_ficha_nota', columns: [t.fichaId, t.notaId, t.nivel] }),
    index('idx_ficha_nota_nota').on(t.notaId),
  ],
);

/** Relacion N:M con orden de relevancia. */
export const fichaFamilia = pgTable(
  'ficha_familia',
  {
    fichaId: uuid('ficha_id')
      .notNull()
      .references(() => ficha.id, { onDelete: 'cascade' }),
    familiaId: uuid('familia_id')
      .notNull()
      .references(() => familia.id, { onDelete: 'restrict' }),
    orden: smallint('orden').notNull().default(0),
  },
  (t) => [
    primaryKey({ name: 'pk_ficha_familia', columns: [t.fichaId, t.familiaId] }),
    index('idx_ficha_familia_familia').on(t.familiaId),
  ],
);

/* -------------------------------------------------------------- perfumes */

/**
 * El frasco de cada usuario. Lo que describe el perfume esta en su `ficha`,
 * compartida; aqui solo lo que es de cada uno.
 */
export const perfume = pgTable(
  'perfume',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usuario.id, { onDelete: 'cascade' }),
    /** RESTRICT: una ficha con frascos no se puede borrar. */
    fichaId: uuid('ficha_id')
      .notNull()
      .references(() => ficha.id, { onDelete: 'restrict' }),
    volumenMl: integer('volumen_ml'),
    fechaCompra: date('fecha_compra'),
    estado: estadoPerfumeEnum('estado').notNull().default('LO_TENGO'),
    valoracion: smallint('valoracion'),
    notasPersonales: text('notas_personales'),
    archivado: boolean('archivado').notNull().default(false),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('ck_perfume_valoracion', sql`${t.valoracion} is null or ${t.valoracion} between 1 and 5`),
    check('ck_perfume_volumen', sql`${t.volumenMl} is null or ${t.volumenMl} > 0`),
    index('idx_perfume_usuario_estado').on(t.userId, t.estado, t.archivado),
    index('idx_perfume_ficha').on(t.fichaId),
  ],
);

/** Minimo uno por perfume (validado en dominio), editable siempre. */
export const perfumeContexto = pgTable(
  'perfume_contexto',
  {
    perfumeId: uuid('perfume_id')
      .notNull()
      .references(() => perfume.id, { onDelete: 'cascade' }),
    contextoId: uuid('contexto_id')
      .notNull()
      .references(() => contexto.id, { onDelete: 'restrict' }),
  },
  (t) => [
    primaryKey({ name: 'pk_perfume_contexto', columns: [t.perfumeId, t.contextoId] }),
    index('idx_perfume_contexto_contexto').on(t.contextoId),
  ],
);

/** Solo las estaciones marcadas por el usuario. Sin columnas de votos. */
export const perfumeEstacion = pgTable(
  'perfume_estacion',
  {
    perfumeId: uuid('perfume_id')
      .notNull()
      .references(() => perfume.id, { onDelete: 'cascade' }),
    estacion: estacionEnum('estacion').notNull(),
  },
  (t) => [primaryKey({ name: 'pk_perfume_estacion', columns: [t.perfumeId, t.estacion] })],
);

/** Solo los momentos marcados por el usuario. Sin columnas de votos. */
export const perfumeMomento = pgTable(
  'perfume_momento',
  {
    perfumeId: uuid('perfume_id')
      .notNull()
      .references(() => perfume.id, { onDelete: 'cascade' }),
    momento: momentoEnum('momento').notNull(),
  },
  (t) => [primaryKey({ name: 'pk_perfume_momento', columns: [t.perfumeId, t.momento] })],
);

/* ------------------------------------------------------------------- usos */

export const uso = pgTable(
  'uso',
  {
    /** Generado en el cliente para que un reenvio de la cola offline sea idempotente. */
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usuario.id, { onDelete: 'cascade' }),
    /** RESTRICT: materializa la regla dura de que un perfume con historial no se borra. */
    perfumeId: uuid('perfume_id')
      .notNull()
      .references(() => perfume.id, { onDelete: 'restrict' }),
    fecha: date('fecha').notNull().default(sql`current_date`),
    momento: momentoEnum('momento').notNull(),
    contextoId: uuid('contexto_id')
      .notNull()
      .references(() => contexto.id, { onDelete: 'restrict' }),
    sprays: smallint('sprays'),
    duracionPercibida: duracionPercibidaEnum('duracion_percibida'),
    valoracionDia: smallint('valoracion_dia'),
    /** Snapshot: 0, 33, 67 o 100 en el momento del registro. No se recalcula. */
    idoneidadPct: smallint('idoneidad_pct').notNull(),
    /** Snapshot del desglose por eje: {momento: bool, contexto: bool, estacion: bool}. */
    idoneidadDetalle: jsonb('idoneidad_detalle')
      .$type<{ momento: boolean; contexto: boolean; estacion: boolean }>()
      .notNull(),
    /** Estacion dominante del conjunto compatible. Es la que agrupa en estadisticas. */
    estacionEfectiva: estacionEnum('estacion_efectiva').notNull(),
    /** Conjunto completo de estaciones compatibles que se uso para calcular (7.1). */
    estacionesEfectivas: estacionEnum('estaciones_efectivas').array().notNull(),
    origenEstacion: origenEstacionEnum('origen_estacion').notNull().default('TEMPERATURA'),
    comentario: text('comentario'),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('ck_uso_idoneidad', sql`${t.idoneidadPct} in (0, 33, 67, 100)`),
    check(
      'ck_uso_valoracion_dia',
      sql`${t.valoracionDia} is null or ${t.valoracionDia} between 1 and 5`,
    ),
    check('ck_uso_sprays', sql`${t.sprays} is null or ${t.sprays} between 0 and 100`),
    check('ck_uso_estaciones_efectivas', sql`cardinality(${t.estacionesEfectivas}) between 1 and 2`),
    check(
      'ck_uso_estacion_dominante',
      sql`${t.estacionEfectiva} = any(${t.estacionesEfectivas})`,
    ),
    index('idx_uso_usuario_fecha').on(t.userId, t.fecha),
    index('idx_uso_perfume_fecha').on(t.perfumeId, t.fecha),
    index('idx_uso_contexto').on(t.contextoId),
  ],
);

/* -------------------------------------------------------------- wishlist */

export const wishlist = pgTable(
  'wishlist',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usuario.id, { onDelete: 'cascade' }),
    nombre: text('nombre').notNull(),
    marca: text('marca').notNull(),
    prioridad: prioridadWishlistEnum('prioridad').notNull().default('EN_EL_RADAR'),
    /** Precio maximo que estoy dispuesto a pagar, no una estimacion de mercado. */
    precioObjetivo: decimal('precio_objetivo', { precision: 10, scale: 2 }),
    notas: text('notas'),
    fragranticaUrl: text('fragrantica_url'),
    convertidoAPerfumeId: uuid('convertido_a_perfume_id').references(() => perfume.id, {
      onDelete: 'set null',
    }),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'ck_wishlist_precio',
      sql`${t.precioObjetivo} is null or ${t.precioObjetivo} >= 0`,
    ),
    index('idx_wishlist_usuario_prioridad').on(t.userId, t.prioridad),
  ],
);

/**
 * Notas de fondo de un deseo (seccion 10.2).
 *
 * Se guardan normalizadas contra el mismo vocabulario que los perfumes, y no
 * como texto suelto en `wishlist.notas`, por lo mismo que en la seccion 3: si
 * no, no se pueden cruzar con la coleccion para detectar el solapamiento.
 * Solo el fondo: es lo que hace que dos frascos sean redundantes.
 */
export const wishlistNota = pgTable(
  'wishlist_nota',
  {
    wishlistId: uuid('wishlist_id')
      .notNull()
      .references(() => wishlist.id, { onDelete: 'cascade' }),
    notaId: uuid('nota_id')
      .notNull()
      .references(() => nota.id, { onDelete: 'restrict' }),
    orden: smallint('orden').notNull().default(0),
  },
  (t) => [
    primaryKey({ name: 'pk_wishlist_nota', columns: [t.wishlistId, t.notaId] }),
    index('idx_wishlist_nota_nota').on(t.notaId),
  ],
);

/* -------------------------------------------------------------- ajustes */

/**
 * Clave-valor de configuracion: ubicacion por defecto y los umbrales de la
 * seccion 7.1, editables desde la pantalla de configuracion sin desplegar.
 */
export const ajuste = pgTable(
  'ajuste',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => usuario.id, { onDelete: 'cascade' }),
    clave: text('clave').notNull(),
    valor: jsonb('valor').notNull(),
    descripcion: text('descripcion'),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ name: 'pk_ajuste', columns: [t.userId, t.clave] })],
);

/* ------------------------------------------------- soporte de recomendacion */

/**
 * Boton "Otro" de la seccion 7.2: descarta una sugerencia durante el resto del dia.
 * En base de datos y no en el navegador, para que sea coherente entre dispositivos.
 */
export const recomendacionDescarte = pgTable(
  'recomendacion_descarte',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => usuario.id, { onDelete: 'cascade' }),
    perfumeId: uuid('perfume_id')
      .notNull()
      .references(() => perfume.id, { onDelete: 'cascade' }),
    fecha: date('fecha').notNull().default(sql`current_date`),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'pk_recomendacion_descarte', columns: [t.userId, t.perfumeId, t.fecha] }),
  ],
);

/**
 * Suscripcion de avisos del navegador (seccion 10.4).
 *
 * Un mismo usuario puede tener varias: el movil, la tablet, el escritorio. El
 * endpoint que da el navegador es la clave, y cuando caduca el servicio de push
 * devuelve 410 y la fila se borra.
 */
export const pushSuscripcion = pgTable(
  'push_suscripcion',
  {
    endpoint: text('endpoint').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usuario.id, { onDelete: 'cascade' }),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_push_usuario').on(t.userId)],
);

/**
 * Avisos ya enviados, para no repetir el recordatorio del mismo dia si la tarea
 * programada se ejecuta mas de una vez.
 */
export const recordatorioEnviado = pgTable(
  'recordatorio_enviado',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => usuario.id, { onDelete: 'cascade' }),
    fecha: date('fecha').notNull(),
    enviadoEn: timestamp('enviado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ name: 'pk_recordatorio_enviado', columns: [t.userId, t.fecha] })],
);

/**
 * Cache del tiempo: una llamada al dia por ubicacion (seccion 7.1), y ademas
 * permite calcular la estacion efectiva de un registro con fecha pasada con el
 * tiempo que hizo realmente ese dia.
 */
export const climaDiario = pgTable(
  'clima_diario',
  {
    lat: decimal('lat', { precision: 8, scale: 5 }).notNull(),
    lon: decimal('lon', { precision: 8, scale: 5 }).notNull(),
    fecha: date('fecha').notNull(),
    temperaturaMax: decimal('temperatura_max', { precision: 4, scale: 1 }).notNull(),
    temperaturaMin: decimal('temperatura_min', { precision: 4, scale: 1 }).notNull(),
    humedadMedia: decimal('humedad_media', { precision: 5, scale: 2 }),
    obtenidoEn: timestamp('obtenido_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ name: 'pk_clima_diario', columns: [t.lat, t.lon, t.fecha] })],
);

/* ------------------------------------------------------------- relaciones */

export const usuarioRelations = relations(usuario, ({ many }) => ({
  perfumes: many(perfume),
  contextos: many(contexto),
  usos: many(uso),
  wishlist: many(wishlist),
  ajustes: many(ajuste),
}));

export const fichaRelations = relations(ficha, ({ one, many }) => ({
  creador: one(usuario, { fields: [ficha.creadaPor], references: [usuario.id] }),
  notas: many(fichaNota),
  familias: many(fichaFamilia),
  frascos: many(perfume),
}));

export const perfumeRelations = relations(perfume, ({ one, many }) => ({
  usuario: one(usuario, { fields: [perfume.userId], references: [usuario.id] }),
  ficha: one(ficha, { fields: [perfume.fichaId], references: [ficha.id] }),
  contextos: many(perfumeContexto),
  estaciones: many(perfumeEstacion),
  momentos: many(perfumeMomento),
  usos: many(uso),
}));

export const notaRelations = relations(nota, ({ many }) => ({ fichas: many(fichaNota) }));

export const familiaRelations = relations(familia, ({ many }) => ({
  fichas: many(fichaFamilia),
}));

export const contextoRelations = relations(contexto, ({ one, many }) => ({
  usuario: one(usuario, { fields: [contexto.userId], references: [usuario.id] }),
  perfumes: many(perfumeContexto),
  usos: many(uso),
}));

export const fichaNotaRelations = relations(fichaNota, ({ one }) => ({
  ficha: one(ficha, { fields: [fichaNota.fichaId], references: [ficha.id] }),
  nota: one(nota, { fields: [fichaNota.notaId], references: [nota.id] }),
}));

export const fichaFamiliaRelations = relations(fichaFamilia, ({ one }) => ({
  ficha: one(ficha, { fields: [fichaFamilia.fichaId], references: [ficha.id] }),
  familia: one(familia, { fields: [fichaFamilia.familiaId], references: [familia.id] }),
}));

export const perfumeContextoRelations = relations(perfumeContexto, ({ one }) => ({
  perfume: one(perfume, { fields: [perfumeContexto.perfumeId], references: [perfume.id] }),
  contexto: one(contexto, { fields: [perfumeContexto.contextoId], references: [contexto.id] }),
}));

export const perfumeEstacionRelations = relations(perfumeEstacion, ({ one }) => ({
  perfume: one(perfume, { fields: [perfumeEstacion.perfumeId], references: [perfume.id] }),
}));

export const perfumeMomentoRelations = relations(perfumeMomento, ({ one }) => ({
  perfume: one(perfume, { fields: [perfumeMomento.perfumeId], references: [perfume.id] }),
}));

export const usoRelations = relations(uso, ({ one }) => ({
  usuario: one(usuario, { fields: [uso.userId], references: [usuario.id] }),
  perfume: one(perfume, { fields: [uso.perfumeId], references: [perfume.id] }),
  contexto: one(contexto, { fields: [uso.contextoId], references: [contexto.id] }),
}));

export const wishlistRelations = relations(wishlist, ({ one, many }) => ({
  usuario: one(usuario, { fields: [wishlist.userId], references: [usuario.id] }),
  perfumeConvertido: one(perfume, {
    fields: [wishlist.convertidoAPerfumeId],
    references: [perfume.id],
  }),
  notasFondo: many(wishlistNota),
}));

export const wishlistNotaRelations = relations(wishlistNota, ({ one }) => ({
  deseo: one(wishlist, { fields: [wishlistNota.wishlistId], references: [wishlist.id] }),
  nota: one(nota, { fields: [wishlistNota.notaId], references: [nota.id] }),
}));
