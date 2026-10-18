-- Contextos atemporales.
--
-- En algunos contextos las condiciones son siempre las mismas, sea la hora o
-- la estacion que sea: en el gimnasio hace el mismo calor, con la misma
-- humedad y el mismo sudor, en enero que en agosto y de dia que de noche. Ahi
-- el momento y la estacion no dicen nada, y la idoneidad, la recomendacion,
-- los huecos y el viaje solo miran si el perfume esta marcado para el contexto.
--
-- Por defecto solo el gimnasio. Se cambia desde configuracion.
ALTER TABLE "contexto" ADD COLUMN "atemporal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "contexto" SET "atemporal" = true WHERE "slug" = 'gimnasio';--> statement-breakpoint

CREATE OR REPLACE FUNCTION sembrar_usuario(p_user_id uuid) RETURNS void AS $$
BEGIN
  -- Los seis contextos. Entorno social y formalidad, nunca hora del dia.
  -- El gimnasio es atemporal: ni el momento ni la estacion cambian nada alli.
  INSERT INTO "contexto" ("user_id", "slug", "nombre", "orden", "atemporal") VALUES
    (p_user_id, 'oficina',  'Oficina',          1, false),
    (p_user_id, 'gimnasio', 'Gimnasio',         2, true),
    (p_user_id, 'cita',     'Cita',             3, false),
    (p_user_id, 'amigos',   'Amigos',           4, false),
    (p_user_id, 'elegante', 'Ocasión elegante', 5, false),
    (p_user_id, 'casa',     'Casa',             6, false)
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
