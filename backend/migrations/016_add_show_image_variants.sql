ALTER TABLE shows
  ADD COLUMN image_principal_web VARCHAR(255) NULL AFTER image_url,
  ADD COLUMN image_secundaria_web VARCHAR(255) NULL AFTER image_principal_web,
  ADD COLUMN image_principal_mobile VARCHAR(255) NULL AFTER image_secundaria_web;
