-- Add is_permanent column to flights to prevent deletion of system flights
ALTER TABLE flights
  ADD COLUMN IF NOT EXISTS is_permanent BOOLEAN NOT NULL DEFAULT false;

-- Mark the General Availability flight as permanent
UPDATE flights SET is_permanent = true WHERE name = 'General Availability';
