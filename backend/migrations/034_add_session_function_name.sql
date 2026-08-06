ALTER TABLE `sessions`
  ADD COLUMN `function_name` VARCHAR(150) NULL AFTER `ends_at`;
