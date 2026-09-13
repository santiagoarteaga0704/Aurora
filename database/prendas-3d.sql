-- ---------------------------------------------------------------------------
-- Anclajes de realidad aumentada
--
-- `producto_prenda_3d.anclaje_json` dice donde se apoya cada prenda sobre el
-- encuadre de la camara, en fracciones del alto. Son pocos productos a
-- proposito: alcanza para demostrar que el anclaje propio gana sobre el
-- generico por tipo de prenda, que es lo que hay que poder mostrar.
--
-- El resto del catalogo funciona igual con el anclaje por tipo. Exigir que
-- alguien mida a mano los 30 productos antes de encender la RA la dejaria
-- apagada para siempre.
-- ---------------------------------------------------------------------------

INSERT INTO producto_prenda_3d (producto_id, color_id, url_glb, url_textura, anclaje_json, escala_base, activo)
SELECT p.id, NULL, NULL, NULL, a.anclaje::jsonb, a.escala, TRUE
FROM (VALUES
  -- Un vestido largo llega mas abajo y se abre mas que el midi.
  ('vestido-largo-de-noche',
   '{"hombros":0.28,"bajo":0.96,"ancho_hombros":0.24,"ancho_bajo":0.40,"entalle":0.26,"cintura":0.30}',
   1.000),
  ('vestido-midi-plisado',
   '{"hombros":0.30,"bajo":0.80,"ancho_hombros":0.25,"ancho_bajo":0.38,"entalle":0.24,"cintura":0.32}',
   1.000),
  -- Una camisa oversize cae recta y ancha: casi sin entalle.
  ('camisa-de-lino-oversize',
   '{"hombros":0.27,"bajo":0.64,"ancho_hombros":0.32,"ancho_bajo":0.32,"entalle":0.02,"cintura":0.60}',
   1.000),
  ('blusa-de-seda-lavada',
   '{"hombros":0.30,"bajo":0.60,"ancho_hombros":0.26,"ancho_bajo":0.25,"entalle":0.14,"cintura":0.70}',
   1.000)
) AS a(slug, anclaje, escala)
JOIN producto p ON p.slug = a.slug
ON CONFLICT DO NOTHING;
