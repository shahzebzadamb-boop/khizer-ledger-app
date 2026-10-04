INSERT INTO flats (id, name, sortOrder) VALUES
  ('flat_802-A', '802-A', 1),
  ('flat_408-B', '408-B', 2),
  ('flat_204-D', '204-D', 3),
  ('flat_204-C', '204-C', 4),
  ('flat_811-D', '811-D', 5),
  ('flat_815-B', '815-B', 6)
ON DUPLICATE KEY UPDATE name = VALUES(name), sortOrder = VALUES(sortOrder);
