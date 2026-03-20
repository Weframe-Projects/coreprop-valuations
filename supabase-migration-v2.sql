-- CoreProp Valuation App - Migration V2
-- Run this in the Supabase SQL Editor AFTER the initial migration

-- ============================================
-- 1. Inspection Notes table (structured compliance notes)
-- ============================================
CREATE TABLE IF NOT EXISTS inspection_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Inspection metadata
  inspection_date DATE,
  inspector_initials TEXT DEFAULT '',
  time_of_day TEXT DEFAULT 'morning' CHECK (time_of_day IN ('morning', 'afternoon')),
  weather_conditions TEXT DEFAULT '',

  -- Structured note sections
  description_notes TEXT DEFAULT '',      -- Description of property
  construction_notes TEXT DEFAULT '',     -- Type of bricks/materials, roof, stories
  amenities_notes TEXT DEFAULT '',        -- Off street parking, garage, garden
  layout_notes TEXT DEFAULT '',           -- Ground floor, first floor etc - room descriptions
  heating_notes TEXT DEFAULT '',          -- Heating type and condition
  windows_notes TEXT DEFAULT '',          -- Window type and condition
  garden_notes TEXT DEFAULT '',           -- Garden description
  sizing_notes TEXT DEFAULT '',           -- Room measurements
  condition_notes TEXT DEFAULT '',        -- Overall condition assessment
  extra_notes TEXT DEFAULT '',            -- Any additional notes

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inspection_notes_report ON inspection_notes (report_id);

-- RLS for inspection_notes
ALTER TABLE inspection_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY inspection_notes_select ON inspection_notes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY inspection_notes_insert ON inspection_notes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY inspection_notes_update ON inspection_notes
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY inspection_notes_delete ON inspection_notes
  FOR DELETE USING (auth.uid() = user_id);

-- Auto-update trigger
CREATE TRIGGER inspection_notes_updated_at
  BEFORE UPDATE ON inspection_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 2. Auction Comparables table (cached auction data)
-- ============================================
CREATE TABLE IF NOT EXISTS auction_comparables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,                -- 'savills', 'allsop', 'barnard_marcus', 'auction_house_london'
  address TEXT NOT NULL,
  postcode TEXT NOT NULL,
  sale_price INTEGER,
  sale_date DATE,
  property_type TEXT,
  lot_number TEXT,
  auction_date DATE,
  bedrooms INTEGER,
  description TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  url TEXT DEFAULT '',
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  source_id TEXT UNIQUE,               -- Dedup key

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auction_comps_postcode ON auction_comparables (postcode);

-- ============================================
-- 3. Historical Valuations table (uploaded past reports)
-- ============================================
CREATE TABLE IF NOT EXISTS historical_valuations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_address TEXT NOT NULL,
  postcode TEXT NOT NULL,
  valuation_figure INTEGER,
  valuation_date DATE,
  report_type TEXT,
  property_type TEXT,
  floor_area NUMERIC,
  bedrooms INTEGER,
  notes TEXT DEFAULT '',
  storage_path TEXT,                    -- Path to uploaded PDF in Supabase storage
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_historical_user ON historical_valuations (user_id);
CREATE INDEX IF NOT EXISTS idx_historical_postcode ON historical_valuations (postcode);

-- RLS for historical_valuations
ALTER TABLE historical_valuations ENABLE ROW LEVEL SECURITY;

CREATE POLICY hist_val_select ON historical_valuations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY hist_val_insert ON historical_valuations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY hist_val_update ON historical_valuations
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY hist_val_delete ON historical_valuations
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- 4. Alter reports table - new columns
-- ============================================
ALTER TABLE reports ADD COLUMN IF NOT EXISTS title_number TEXT DEFAULT '';
ALTER TABLE reports ADD COLUMN IF NOT EXISTS google_drive_folder_id TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS planning_data JSONB;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS conservation_area BOOLEAN;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS listed_building_grade TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS radon_risk TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS flood_risk_data JSONB;

-- ============================================
-- 5. Alter settings table - Google Drive columns
-- ============================================
ALTER TABLE settings ADD COLUMN IF NOT EXISTS google_drive_root_folder_id TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS google_tokens JSONB;

-- ============================================
-- 6. Alter settings table - T&Cs column
-- ============================================
ALTER TABLE settings ADD COLUMN IF NOT EXISTS terms_and_conditions TEXT;
