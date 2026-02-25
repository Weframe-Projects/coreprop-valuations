-- CoreProp Valuation App - Database Migration
-- Run this in the Supabase SQL Editor

-- ============================================
-- 1. Reports table
-- ============================================
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'final')),
  report_type TEXT NOT NULL,

  -- Core identifiers
  property_address TEXT NOT NULL,
  postcode TEXT NOT NULL,
  reference_number TEXT DEFAULT '',

  -- Client details
  client_details JSONB NOT NULL DEFAULT '{}',

  -- Auto-fetched data snapshots
  epc_data JSONB,
  google_maps_data JSONB,

  -- Property details (confirmed by surveyor)
  property_details JSONB NOT NULL DEFAULT '{}',
  inspection_data JSONB,

  -- Comparables array
  comparables JSONB NOT NULL DEFAULT '[]',

  -- AI-generated + user-edited section text
  generated_sections JSONB NOT NULL DEFAULT '{}',

  -- Valuation figures
  valuation_figure INTEGER,
  valuation_figure_words TEXT DEFAULT '',
  auction_reserve INTEGER,
  auction_reserve_words TEXT DEFAULT '',

  -- Metadata
  local_authority TEXT,
  postal_district TEXT,
  land_registry_title TEXT DEFAULT '',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_user_updated ON reports (user_id, updated_at DESC);

-- ============================================
-- 2. Settings table
-- ============================================
CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Editable market commentary (two versions)
  market_commentary_iht TEXT,
  market_commentary_non_iht TEXT,

  -- Firm details
  firm_name TEXT DEFAULT 'The CoreProp Group',
  signatory_name TEXT DEFAULT 'Nicholas Green MRICS',
  signatory_title_iht TEXT DEFAULT 'RICS Registered Valuer',
  signatory_title_other TEXT DEFAULT 'RICS Registered Valuer
Group Managing Director',
  firm_rics_number TEXT DEFAULT '863315',
  firm_email TEXT DEFAULT 'nick.green@coreprop.co.uk',
  firm_phone TEXT DEFAULT '0203 143 0123',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 3. Report photos table
-- ============================================
CREATE TABLE IF NOT EXISTS report_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT 'Front Elevation',
  sort_order INTEGER NOT NULL DEFAULT 0,
  ai_analysis JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_photos_report ON report_photos (report_id, sort_order);

-- ============================================
-- 4. Auto-update updated_at trigger
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reports_updated_at
  BEFORE UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER settings_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 5. Row Level Security
-- ============================================

-- Reports
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY reports_select ON reports
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY reports_insert ON reports
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY reports_update ON reports
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY reports_delete ON reports
  FOR DELETE USING (auth.uid() = user_id);

-- Settings
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY settings_select ON settings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY settings_insert ON settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY settings_update ON settings
  FOR UPDATE USING (auth.uid() = user_id);

-- Report photos (access via report ownership)
ALTER TABLE report_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY photos_select ON report_photos
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM reports WHERE reports.id = report_photos.report_id AND reports.user_id = auth.uid())
  );

CREATE POLICY photos_insert ON report_photos
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM reports WHERE reports.id = report_photos.report_id AND reports.user_id = auth.uid())
  );

CREATE POLICY photos_delete ON report_photos
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM reports WHERE reports.id = report_photos.report_id AND reports.user_id = auth.uid())
  );

-- ============================================
-- 6. Storage bucket for photos
-- ============================================
-- Run this separately or via Supabase dashboard:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('report-photos', 'report-photos', false);
