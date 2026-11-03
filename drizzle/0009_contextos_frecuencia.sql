-- Frecuencia de uso de cada contexto y momentos en que existe.
--
-- El reparto comparaba cada casilla con la media de todas, como si cinco
-- perfumes de oficina (cinco dias a la semana) pesaran lo mismo que cinco de
-- ocasion elegante (dos veces al mes). Ahora cada contexto dice cuantas veces
-- a la semana se usa y que parte es de noche, y el reparto espera mas frascos
-- donde mas se usan.
--
-- Ademas, un contexto puede existir solo de dia o solo de noche: a la oficina
-- se va de dia, y «Oficina · Noche» desaparece de toda la app.
--
-- Las frecuencias de partida son las que dio el usuario: oficina y gimnasio 5,
-- amigos 3, cita 1 y ocasion elegante 0,5 veces por semana. Casa queda sin
-- decir. Todo se cambia desde configuracion.
ALTER TABLE "contexto" ADD COLUMN "momentos" "momento"[] DEFAULT '{DIA,NOCHE}'::momento[] NOT NULL;--> statement-breakpoint
ALTER TABLE "contexto" ADD COLUMN "usos_semana" real;--> statement-breakpoint
ALTER TABLE "contexto" ADD COLUMN "pct_noche" smallint DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "contexto" ADD CONSTRAINT "ck_contexto_momentos" CHECK (cardinality("contexto"."momentos") between 1 and 2);--> statement-breakpoint
ALTER TABLE "contexto" ADD CONSTRAINT "ck_contexto_pct_noche" CHECK ("contexto"."pct_noche" between 0 and 100);--> statement-breakpoint
ALTER TABLE "contexto" ADD CONSTRAINT "ck_contexto_usos_semana" CHECK ("contexto"."usos_semana" is null or "contexto"."usos_semana" between 0 and 14);--> statement-breakpoint

UPDATE "contexto" SET "momentos" = '{DIA}', "pct_noche" = 0 WHERE "slug" = 'oficina';--> statement-breakpoint
UPDATE "contexto" SET "pct_noche" = 80 WHERE "slug" IN ('cita', 'elegante');--> statement-breakpoint
UPDATE "contexto" SET "usos_semana" = 5 WHERE "slug" IN ('oficina', 'gimnasio');--> statement-breakpoint
UPDATE "contexto" SET "usos_semana" = 3 WHERE "slug" = 'amigos';--> statement-breakpoint
UPDATE "contexto" SET "usos_semana" = 1 WHERE "slug" = 'cita';--> statement-breakpoint
UPDATE "contexto" SET "usos_semana" = 0.5 WHERE "slug" = 'elegante';--> statement-breakpoint

CREATE OR REPLACE FUNCTION sembrar_usuario(p_user_id uuid) RETURNS void AS $$
BEGIN
  -- Los seis contextos. Entorno social y formalidad, nunca hora del dia.
  -- El gimnasio es atemporal: ni el momento ni la estacion cambian nada alli.
  -- A la oficina solo se va de dia; las citas y las ocasiones elegantes son
  -- sobre todo de noche. Cuantas veces a la semana se usa cada uno no se
  -- presupone: lo dice cada cual en configuracion.
  INSERT INTO "contexto" ("user_id", "slug", "nombre", "orden", "atemporal", "momentos", "pct_noche") VALUES
    (p_user_id, 'oficina',  'Oficina',          1, false, '{DIA}',       0),
    (p_user_id, 'gimnasio', 'Gimnasio',         2, true,  '{DIA,NOCHE}', 50),
    (p_user_id, 'cita',     'Cita',             3, false, '{DIA,NOCHE}', 80),
    (p_user_id, 'amigos',   'Amigos',           4, false, '{DIA,NOCHE}', 50),
    (p_user_id, 'elegante', 'Ocasión elegante', 5, false, '{DIA,NOCHE}', 80),
    (p_user_id, 'casa',     'Casa',             6, false, '{DIA,NOCHE}', 50)
  ON CONFLICT ("user_id", "slug") DO NOTHING;

  -- Ubicacion automatica (la de la conexion) y umbrales de temperatura
  -- (seccion 7.1). Son un punto de partida, no una verdad: se editan desde
  -- configuracion.
  INSERT INTO "ajuste" ("user_id", "clave", "valor", "descripcion") VALUES
    (p_user_id, 'ubicacion',
      '{"modo": "auto"}'::jsonb,
      'Ubicacion para consultar el tiempo: automatica (por IP) o fija.'),
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
