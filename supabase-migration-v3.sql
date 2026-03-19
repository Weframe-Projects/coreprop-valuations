-- V3: Add assigned_to column for surveyor/folder assignment
-- Run this in the Supabase SQL Editor

ALTER TABLE reports ADD COLUMN IF NOT EXISTS assigned_to TEXT;

-- Index for filtering by assigned_to
CREATE INDEX IF NOT EXISTS idx_reports_assigned_to ON reports(assigned_to);
