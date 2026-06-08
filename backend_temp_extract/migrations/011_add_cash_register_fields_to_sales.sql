ALTER TABLE `sales`
  ADD COLUMN `cashier_id` CHAR(36) NULL AFTER `user_id`,
  ADD COLUMN `cash_register_shift_id` CHAR(36) NULL AFTER `cashier_id`;

ALTER TABLE `sales`
  ADD CONSTRAINT `fk_sales_cash_register_shift`
    FOREIGN KEY (`cash_register_shift_id`)
    REFERENCES `cash_register_shifts`(`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE;
