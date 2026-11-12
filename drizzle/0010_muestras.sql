-- Muestras: perfumes probados sin tenerlos (una muestra, un decant, el
-- probador del aeropuerto). Se guardan con su ficha y sus marcas para poder
-- registrar el uso y por si se compran luego, pero no son de la coleccion.
ALTER TYPE "public"."estado_perfume" ADD VALUE IF NOT EXISTS 'MUESTRA';
