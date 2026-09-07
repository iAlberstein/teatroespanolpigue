-- Migration 040: Persist individual SiPago payment attempts

CREATE TABLE IF NOT EXISTS `sipago_payment_attempts` (
  `id` CHAR(36) NOT NULL PRIMARY KEY,
  `reservation_id` CHAR(36) NOT NULL,
  `sale_id` CHAR(36) NULL,
  `provider_order_uuid` VARCHAR(255) NULL,
  `expected_amount` BIGINT UNSIGNED NOT NULL,
  `expected_currency` VARCHAR(10) NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'pending',
  `provider_status` VARCHAR(100) NULL,
  `provider_response` JSON NULL,
  `expires_at` DATETIME NOT NULL,
  `customer_metadata` JSON NULL,
  `discount_id` CHAR(36) NULL,
  `service_items` JSON NULL,
  `finalized_at` DATETIME NULL,
  `verification_error` VARCHAR(500) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX `uq_sipago_attempt_provider_order` (`provider_order_uuid`),
  INDEX `idx_sipago_attempt_reservation` (`reservation_id`),
  INDEX `idx_sipago_attempt_sale` (`sale_id`),
  INDEX `idx_sipago_attempt_status` (`status`),
  CONSTRAINT `fk_sipago_attempt_reservation` FOREIGN KEY (`reservation_id`) REFERENCES `reservations` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_sipago_attempt_sale` FOREIGN KEY (`sale_id`) REFERENCES `sales` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_sipago_attempt_discount` FOREIGN KEY (`discount_id`) REFERENCES `discounts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
