-- Ubicacion por usuario de verdad.
--
-- Hasta ahora todas las cuentas nacian en El Campello, que solo es cierto para
-- la primera. Las nuevas nacen en modo automatico: la ubicacion sale de la
-- geolocalizacion por IP de cada peticion (cabeceras x-vercel-ip-*).
--
-- Las cuentas invitadas que siguen con la ubicacion de partida sin tocar pasan
-- tambien a automatica. La primera cuenta (la de `db:seed`) se queda como esta.

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
--> statement-breakpoint

UPDATE "ajuste"
SET "valor" = '{"modo": "auto"}'::jsonb,
    "descripcion" = 'Ubicacion para consultar el tiempo: automatica (por IP) o fija.',
    "actualizado_en" = now()
WHERE "clave" = 'ubicacion'
  AND "valor" = '{"lat": 38.4257, "lon": -0.4009, "etiqueta": "El Campello, Alicante"}'::jsonb
  AND "user_id" <> (SELECT "id" FROM "usuario" ORDER BY "creado_en", "id" LIMIT 1);
