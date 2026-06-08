-- Add billing fields to sales table
ALTER TABLE sales
  ADD COLUMN billing_status ENUM('pending', 'invoiced') DEFAULT 'pending' AFTER total_capacity,
  ADD COLUMN invoiced_at TIMESTAMP NULL AFTER billing_status,
  ADD COLUMN invoiced_by UUID NULL AFTER invoiced_at;
