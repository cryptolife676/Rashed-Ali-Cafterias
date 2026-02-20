CREATE TABLE IF NOT EXISTS branches (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,
  location    TEXT,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name     TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'viewer'
                CHECK (role IN ('super_admin','manager','accountant','partner','viewer')),
  is_active     BOOLEAN DEFAULT TRUE,
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS income_entries (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id   UUID REFERENCES branches(id) ON DELETE SET NULL,
  entry_date  DATE NOT NULL,
  amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  category    TEXT NOT NULL DEFAULT 'Sales',
  notes       TEXT,
  recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expense_entries (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id   UUID REFERENCES branches(id) ON DELETE SET NULL,
  entry_date  DATE NOT NULL,
  amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  category    TEXT NOT NULL DEFAULT 'Supplies',
  notes       TEXT,
  recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS partners (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name          TEXT NOT NULL,
  branch_id     UUID REFERENCES branches(id) ON DELETE SET NULL,
  ownership_pct NUMERIC(5,2) NOT NULL CHECK (ownership_pct > 0 AND ownership_pct <= 100),
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_income_branch_date  ON income_entries  (branch_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_expense_branch_date ON expense_entries (branch_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_partners_branch     ON partners        (branch_id);
CREATE INDEX IF NOT EXISTS idx_users_email         ON users           (email);

INSERT INTO users (full_name, email, password_hash, role, is_active)
VALUES ('Super Admin', 'admin@rashedali.com', 'admin123', 'super_admin', TRUE)
ON CONFLICT (email) DO NOTHING;

INSERT INTO branches (name, location, is_active)
VALUES ('Main Branch', 'Abu Dhabi', TRUE)
ON CONFLICT DO NOTHING;