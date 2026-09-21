-- Semillas (seccion 11).
--
-- Contenido:
--   1. Familias olfativas iniciales  (vocabulario global)
--   2. Notas olfativas iniciales     (vocabulario global)
--   3. Funcion sembrar_usuario()     (los seis contextos y los umbrales por defecto)
--
-- Todo es idempotente: la migracion puede reaplicarse sin duplicar nada.
-- Los contextos y los ajustes cuelgan de un usuario, asi que viven en una funcion
-- que se invoca al crear cada usuario (hoy solo hay uno; ver src/db/seed.ts).

/* --------------------------------------------- 1. familias olfativas ---- */

INSERT INTO "familia" ("slug", "nombre") VALUES
  ('amaderado',   'Amaderado'),
  ('oriental',    'Oriental'),
  ('ambar',       'Ámbar'),
  ('cuero',       'Cuero'),
  ('marino',      'Marino / Acuático'),
  ('aromatico',   'Aromático'),
  ('especiado',   'Especiado'),
  ('citrico',     'Cítrico'),
  ('floral',      'Floral'),
  ('gourmand',    'Gourmand'),
  ('fougere',     'Fougère'),
  ('chipre',      'Chipre'),
  ('almizclado',  'Almizclado'),
  ('atalcado',    'Atalcado'),
  ('afrutado',    'Afrutado'),
  ('verde',       'Verde'),
  ('resinoso',    'Resinoso / Incienso'),
  ('tabaco',      'Tabaco'),
  ('dulce',       'Dulce'),
  ('mineral',     'Mineral / Ozónico')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint

/* -------------------------------------------------- 2. notas olfativas ---- */
-- `nombre` conserva la grafia con acentos; `nombre_normalizado` es la clave de
-- deduplicacion en minusculas y sin acentos.

INSERT INTO "nota" ("nombre", "nombre_normalizado") VALUES
  -- citricos y salida fresca
  ('Bergamota',            'bergamota'),
  ('Limón',                'limon'),
  ('Naranja',              'naranja'),
  ('Mandarina',            'mandarina'),
  ('Pomelo',               'pomelo'),
  ('Lima',                 'lima'),
  ('Petit grain',          'petit grain'),
  ('Notas marinas',        'notas marinas'),
  ('Notas acuáticas',      'notas acuaticas'),
  ('Sal',                  'sal'),
  -- especias
  ('Cardamomo',            'cardamomo'),
  ('Pimienta negra',       'pimienta negra'),
  ('Pimienta rosa',        'pimienta rosa'),
  ('Azafrán',              'azafran'),
  ('Canela',               'canela'),
  ('Clavo',                'clavo'),
  ('Nuez moscada',         'nuez moscada'),
  ('Jengibre',             'jengibre'),
  ('Comino',               'comino'),
  ('Anís',                 'anis'),
  -- aromaticos y verdes
  ('Lavanda',              'lavanda'),
  ('Menta',                'menta'),
  ('Albahaca',             'albahaca'),
  ('Romero',               'romero'),
  ('Salvia',               'salvia'),
  ('Salvia esclarea',      'salvia esclarea'),
  ('Té verde',             'te verde'),
  ('Notas verdes',         'notas verdes'),
  -- frutas
  ('Manzana',              'manzana'),
  ('Piña',                 'pina'),
  ('Melón',                'melon'),
  ('Pera',                 'pera'),
  ('Ciruela',              'ciruela'),
  ('Dátil',                'datil'),
  ('Higo',                 'higo'),
  ('Frambuesa',            'frambuesa'),
  ('Grosella negra',       'grosella negra'),
  ('Melocotón',            'melocoton'),
  -- flores
  ('Rosa',                 'rosa'),
  ('Rosa de Taif',         'rosa de taif'),
  ('Jazmín',               'jazmin'),
  ('Azahar',               'azahar'),
  ('Neroli',               'neroli'),
  ('Ylang-ylang',          'ylang-ylang'),
  ('Violeta',              'violeta'),
  ('Iris',                 'iris'),
  ('Geranio',              'geranio'),
  ('Lirio de los valles',  'lirio de los valles'),
  ('Magnolia',             'magnolia'),
  ('Tuberosa',             'tuberosa'),
  ('Osmanthus',            'osmanthus'),
  -- maderas
  ('Oud',                  'oud'),
  ('Sándalo',              'sandalo'),
  ('Cedro',                'cedro'),
  ('Vetiver',              'vetiver'),
  ('Pachulí',              'pachuli'),
  ('Madera de gaiac',      'madera de gaiac'),
  ('Abedul',               'abedul'),
  ('Cashmeran',            'cashmeran'),
  ('Maderas secas',        'maderas secas'),
  ('Bambú',                'bambu'),
  -- resinas, balsamicos y ambar
  ('Ámbar',                'ambar'),
  ('Ambroxán',             'ambroxan'),
  ('Ámbar gris',           'ambar gris'),
  ('Incienso',             'incienso'),
  ('Olíbano',              'olibano'),
  ('Mirra',                'mirra'),
  ('Benjuí',               'benjui'),
  ('Labdanum',             'labdanum'),
  ('Bálsamo de Perú',      'balsamo de peru'),
  ('Elemí',                'elemi'),
  -- fondo animal, dulce y mineral
  ('Cuero',                'cuero'),
  ('Almizcle',             'almizcle'),
  ('Almizcle blanco',      'almizcle blanco'),
  ('Castóreo',             'castoreo'),
  ('Tabaco',               'tabaco'),
  ('Vainilla',             'vainilla'),
  ('Haba tonka',           'haba tonka'),
  ('Caramelo',             'caramelo'),
  ('Miel',                 'miel'),
  ('Cacao',                'cacao'),
  ('Café',                 'cafe'),
  ('Praliné',              'praline'),
  ('Coco',                 'coco'),
  ('Musgo de roble',       'musgo de roble'),
  ('Pólvora',              'polvora'),
  ('Cuero de gamuza',      'cuero de gamuza')
ON CONFLICT ("nombre_normalizado") DO NOTHING;
--> statement-breakpoint

/* ------------------------------------- 3. semillas por usuario (funcion) ---- */
-- Los seis contextos exactos de la seccion 3 y los umbrales de la seccion 7.1.
-- Idempotente: ON CONFLICT DO NOTHING no pisa los valores que el usuario haya
-- cambiado despues desde la pantalla de configuracion.

CREATE OR REPLACE FUNCTION sembrar_usuario(p_user_id uuid) RETURNS void AS $$
BEGIN
  -- Los seis contextos. Entorno social y formalidad, nunca hora del dia.
  INSERT INTO "contexto" ("user_id", "slug", "nombre", "orden") VALUES
    (p_user_id, 'oficina',  'Oficina',          1),
    (p_user_id, 'gimnasio', 'Gimnasio',         2),
    (p_user_id, 'cita',     'Cita',             3),
    (p_user_id, 'amigos',   'Amigos',           4),
    (p_user_id, 'elegante', 'Ocasión elegante', 5),
    (p_user_id, 'casa',     'Casa',             6)
  ON CONFLICT ("user_id", "slug") DO NOTHING;

  -- Ubicacion por defecto y umbrales de temperatura (seccion 7.1).
  -- Son un punto de partida, no una verdad: se editan desde configuracion.
  INSERT INTO "ajuste" ("user_id", "clave", "valor", "descripcion") VALUES
    (p_user_id, 'ubicacion',
      '{"lat": 38.4257, "lon": -0.4009, "etiqueta": "El Campello, Alicante"}'::jsonb,
      'Ubicacion por defecto para consultar el tiempo.'),
    (p_user_id, 'umbral_verano', '28'::jsonb,
      'A partir de esta temperatura solo VERANO.'),
    (p_user_id, 'umbral_verano_entretiempo', '24'::jsonb,
      'Desde aqui hasta umbral_verano: VERANO + entretiempo.'),
    (p_user_id, 'umbral_entretiempo', '18'::jsonb,
      'Desde aqui hasta umbral_verano_entretiempo: solo entretiempo.'),
    (p_user_id, 'umbral_entretiempo_invierno', '13'::jsonb,
      'Desde aqui hasta umbral_entretiempo: entretiempo + INVIERNO. Por debajo, solo INVIERNO.'),
    (p_user_id, 'bochorno_humedad_pct', '70'::jsonb,
      'Humedad relativa media por encima de la cual se aplica el ajuste por bochorno costero.'),
    (p_user_id, 'bochorno_temperatura_min', '24'::jsonb,
      'Temperatura minima para que el ajuste por bochorno se aplique.'),
    (p_user_id, 'bochorno_incremento', '2'::jsonb,
      'Grados que se suman a la temperatura cuando hay bochorno.')
  ON CONFLICT ("user_id", "clave") DO NOTHING;
END;
$$ LANGUAGE plpgsql;
