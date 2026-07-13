-- Migration 033: Add pack sales support
-- Adds pack multi-function fields to shows, reservations and sales, and creates pack_sales table.

ALTER TABLE `shows`
  ADD COLUMN `pack_enabled` BOOLEAN NOT NULL DEFAULT FALSE AFTER `palcos_individual_seats`,
  ADD COLUMN `pack_pricing_json` JSON NULL AFTER `pack_enabled`,
  ADD COLUMN `pack_max_sessions` INT NOT NULL DEFAULT 3 AFTER `pack_pricing_json`;

ALTER TABLE `reservations`
  ADD COLUMN `pack_id` CHAR(36) NULL AFTER `service_items`,
  ADD INDEX `idx_reservations_pack_id` (`pack_id`);

ALTER TABLE `sales`
  ADD COLUMN `pack_sale_id` CHAR(36) NULL AFTER `session_id`,
  ADD INDEX `idx_sales_pack_sale_id` (`pack_sale_id`);

CREATE TABLE IF NOT EXISTS `pack_sales` (
  `id`                    CHAR(36)       NOT NULL PRIMARY KEY DEFAULT (UUID()),
  `user_id`               CHAR(36)       NULL,
  `discount_id`           CHAR(36)       NULL,
  `payment_method`        VARCHAR(50)    NOT NULL,
  `payment_status`        VARCHAR(50)    NOT NULL DEFAULT 'pending',
  `subtotal`              DECIMAL(10,2)  NOT NULL DEFAULT 0,
  `discount_amount`       DECIMAL(10,2)  NOT NULL DEFAULT 0,
  `service_fee_percent`   DECIMAL(5,2)   NOT NULL DEFAULT 0,
  `service_fee_amount`    DECIMAL(10,2)  NOT NULL DEFAULT 0,
  `services_subtotal`     DECIMAL(10,2)  NOT NULL DEFAULT 0,
  `total_amount`          DECIMAL(10,2)  NOT NULL DEFAULT 0,
  `service_items`         JSON           NULL,
  `customer_name`         VARCHAR(255)   NULL,
  `customer_email`        VARCHAR(255)   NULL,
  `customer_phone`        VARCHAR(255)   NULL,
  `customer_dni`          VARCHAR(255)   NULL,
  `customer_provincia`    VARCHAR(255)   NULL,
  `customer_localidad`    VARCHAR(255)   NULL,
  `sipago_order_id`       VARCHAR(255)   NULL,
  `metadata`              JSON           NULL,
  `created_at`            DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_pack_sales_user_id` (`user_id`),
  INDEX `idx_pack_sales_discount_id` (`discount_id`),
  INDEX `idx_pack_sales_payment_status` (`payment_status`),
  CONSTRAINT `fk_pack_sales_user_id` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_pack_sales_discount_id` FOREIGN KEY (`discount_id`) REFERENCES `discounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
