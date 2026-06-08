-- Add password reset fields to users table

ALTER TABLE users 
ADD COLUMN reset_token VARCHAR(255) NULL,
ADD COLUMN reset_token_expiry DATETIME NULL;

-- Add index for faster token lookups
CREATE INDEX idx_users_reset_token ON users(reset_token);
