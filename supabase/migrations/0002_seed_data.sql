-- ============================================================
-- Initial business data: 3 branches, shareholders, investments
-- Run AFTER 0001_init.sql
-- Numbers marked "TBD" are placeholders to satisfy the
-- ownership_pct > 0 constraint — refine in the UI.
--
-- ⚠  PROJECT-SPECIFIC UUIDs — DO NOT REUSE AS A TEMPLATE
-- The UUIDs below are real auth.users rows from the production
-- Supabase project for Rashed Ali Cafeteria.  Cloning this repo
-- for a new project requires replacing every UUID with the actual
-- auth.users IDs from the new project before running this file.
-- Running this against a different project will silently no-op
-- all UPDATE statements (no matching rows) and leave profiles
-- without roles/names, which will break the app.
-- ============================================================

-- ---------- 1. Profile updates for users with auth accounts -----
-- Mukthar (super_admin) — already set, keep as-is
UPDATE profiles SET role = 'accountant',  full_name = 'SHABEER MOORKANAD' WHERE id = '5f2dca2d-c03d-4082-b20d-d2fbc11226e1';
UPDATE profiles SET role = 'shareholder', full_name = 'AJMAL'             WHERE id = '1b14d2e1-da9b-4552-a289-60f0297742fd';
UPDATE profiles SET role = 'shareholder', full_name = 'NASER'             WHERE id = 'fd48e06e-f11e-4e36-bf99-b64aa9a607f3';
UPDATE profiles SET role = 'shareholder', full_name = 'ABDUL RAHMAN EK'   WHERE id = 'cf5a4e0a-6aec-42fc-8dc1-52e287ad6a4e';

-- ---------- 2. Branches -----------------------------------------
-- Remove the seeded "Main Branch" if you don't need it (skip if you do)
DELETE FROM branches WHERE name = 'Main Branch'
  AND NOT EXISTS (SELECT 1 FROM shareholders s WHERE s.branch_id = branches.id);

INSERT INTO branches (name, location, is_active) VALUES
  ('Ajwa - Ras Al Khaima',   'Ras Al Khaima', true),
  ('Ummu Gaffa',             'Abu Dhabi',     true),
  ('Ajman - Al Hamidiya',    'Ajman',         true)
ON CONFLICT DO NOTHING;

-- =================================================================
-- BRANCH 1: AJWA — Ras Al Khaima (total invested 120,000 AED)
-- Profit % NOT YET CONFIRMED — using placeholder 25% × 4
-- ⚠ Edit in UI once Shabeer confirms the split
-- =================================================================
WITH b AS (SELECT id FROM branches WHERE name = 'Ajwa - Ras Al Khaima' LIMIT 1)
INSERT INTO shareholders (display_name, ownership_pct, profile_id, branch_id) VALUES
  ('SHABEER MOORKANAD',           25.00, '5f2dca2d-c03d-4082-b20d-d2fbc11226e1', (SELECT id FROM b)),
  ('Abdullah',                    25.00, NULL,                                    (SELECT id FROM b)),
  ('Shinas',                      25.00, NULL,                                    (SELECT id FROM b)),
  ('Saleem & Abdullah''s Father', 25.00, NULL,                                    (SELECT id FROM b));

-- Investment records — Ajwa (recorded under Shabeer's row, with notes
-- explaining who actually contributed the cash; profit goes to Shabeer's row)
WITH sh AS (
  SELECT s.id FROM shareholders s
  JOIN branches b ON b.id = s.branch_id
  WHERE b.name = 'Ajwa - Ras Al Khaima' AND s.display_name = 'SHABEER MOORKANAD'
)
INSERT INTO investments (shareholder_id, amount, invested_at, notes, recorded_by) VALUES
  ((SELECT id FROM sh), 10000, '2024-01-01', 'AJMAL contribution — C/O Mukthar', 'caf5fb92-85d2-4c53-bc2d-44150aac026e'),
  ((SELECT id FROM sh),  5000, '2024-01-01', 'NASER contribution — C/O Mukthar', 'caf5fb92-85d2-4c53-bc2d-44150aac026e'),
  ((SELECT id FROM sh), 15000, '2024-01-01', 'KADER (Shabeer''s father) contribution', 'caf5fb92-85d2-4c53-bc2d-44150aac026e');

WITH sh AS (
  SELECT s.id FROM shareholders s
  JOIN branches b ON b.id = s.branch_id
  WHERE b.name = 'Ajwa - Ras Al Khaima' AND s.display_name = 'Abdullah'
)
INSERT INTO investments (shareholder_id, amount, invested_at, notes) VALUES
  ((SELECT id FROM sh), 30000, '2024-01-01', 'Initial capital — Ajwa');

WITH sh AS (
  SELECT s.id FROM shareholders s
  JOIN branches b ON b.id = s.branch_id
  WHERE b.name = 'Ajwa - Ras Al Khaima' AND s.display_name = 'Shinas'
)
INSERT INTO investments (shareholder_id, amount, invested_at, notes) VALUES
  ((SELECT id FROM sh), 30000, '2024-01-01', 'Initial capital — Ajwa');

WITH sh AS (
  SELECT s.id FROM shareholders s
  JOIN branches b ON b.id = s.branch_id
  WHERE b.name = 'Ajwa - Ras Al Khaima' AND s.display_name = 'Saleem & Abdullah''s Father'
)
INSERT INTO investments (shareholder_id, amount, invested_at, notes) VALUES
  ((SELECT id FROM sh), 30000, '2024-01-01', 'Initial capital — Ajwa');

-- =================================================================
-- BRANCH 2: UMMU GAFFA (total invested 192,000 AED)
-- Profit shares calculated from your description:
--   Shajahan 35%, Rashed Ali Licence 30%,
--   Muthu 17.5% (no internal split given),
--   Shabeer pool 17.5% split as:
--     Rafeek 5% of pool       → 0.875%
--     Shabeer 50% of remaining → 8.3125%
--     Mukthar/Naser/Syd Mashud share remaining 47.5%, weighted by cash
--       (10K / 16K / 10K = 27.78% / 44.44% / 27.78%)
--       → Mukthar 2.31%, Naser 3.69%, Syd Mashud 2.31%
-- Total: 35 + 30 + 17.5 + 0.875 + 8.3125 + 2.31 + 3.69 + 2.31 = 100.00% ✓
-- ⚠ Refine in UI when Shabeer confirms
-- =================================================================
WITH b AS (SELECT id FROM branches WHERE name = 'Ummu Gaffa' LIMIT 1)
INSERT INTO shareholders (display_name, ownership_pct, profile_id, branch_id) VALUES
  ('Shajahan',           35.0000, NULL,                                    (SELECT id FROM b)),
  ('Rashed Ali Licence', 30.0000, NULL,                                    (SELECT id FROM b)),
  ('Muthu (Musthafa)',   17.5000, NULL,                                    (SELECT id FROM b)),
  ('SHABEER MOORKANAD',   8.3125, '5f2dca2d-c03d-4082-b20d-d2fbc11226e1',  (SELECT id FROM b)),
  ('NASER',               3.6900, 'fd48e06e-f11e-4e36-bf99-b64aa9a607f3',  (SELECT id FROM b)),
  ('MUKTHAR',             2.3100, 'caf5fb92-85d2-4c53-bc2d-44150aac026e',  (SELECT id FROM b)),
  ('Syd Mashud',          2.3100, NULL,                                    (SELECT id FROM b)),
  ('Rafeek',              0.8750, NULL,                                    (SELECT id FROM b));

-- Investment records — Ummu Gaffa (Shabeer's pool)
WITH sh AS (
  SELECT s.id FROM shareholders s
  JOIN branches b ON b.id = s.branch_id
  WHERE b.name = 'Ummu Gaffa' AND s.display_name = 'MUKTHAR'
)
INSERT INTO investments (shareholder_id, amount, invested_at, notes) VALUES
  ((SELECT id FROM sh), 10000, '2024-01-01', 'Mukthar contribution — Ummu Gaffa');

WITH sh AS (
  SELECT s.id FROM shareholders s
  JOIN branches b ON b.id = s.branch_id
  WHERE b.name = 'Ummu Gaffa' AND s.display_name = 'NASER'
)
INSERT INTO investments (shareholder_id, amount, invested_at, notes, recorded_by) VALUES
  ((SELECT id FROM sh), 16000, '2024-01-01', 'Naser contribution — C/O Mukthar', 'caf5fb92-85d2-4c53-bc2d-44150aac026e');

WITH sh AS (
  SELECT s.id FROM shareholders s
  JOIN branches b ON b.id = s.branch_id
  WHERE b.name = 'Ummu Gaffa' AND s.display_name = 'Syd Mashud'
)
INSERT INTO investments (shareholder_id, amount, invested_at, notes) VALUES
  ((SELECT id FROM sh), 10000, '2024-01-01', 'Syd Mashud contribution');

WITH sh AS (
  SELECT s.id FROM shareholders s
  JOIN branches b ON b.id = s.branch_id
  WHERE b.name = 'Ummu Gaffa' AND s.display_name = 'SHABEER MOORKANAD'
)
INSERT INTO investments (shareholder_id, amount, invested_at, notes) VALUES
  ((SELECT id FROM sh), 1300, '2024-01-01', 'Shabeer own contribution');

-- =================================================================
-- BRANCH 3: AJMAN — Al Hamidiya (total 261,744 AED)
-- Confirmed profit shares:
--   Shajahan 14%, Navas 14%, Shihab 14%, Muthu 14%,
--   Rashed Ali Licence 30%,
--   Shabeer 6%, Abdul Rahman 2%, Ajmal 2%, Naser 2%, Mukthar 2%
-- Total = 100% ✓
-- =================================================================
WITH b AS (SELECT id FROM branches WHERE name = 'Ajman - Al Hamidiya' LIMIT 1)
INSERT INTO shareholders (display_name, ownership_pct, profile_id, branch_id) VALUES
  ('Shajahan',           14.00, NULL,                                    (SELECT id FROM b)),
  ('Navas',              14.00, NULL,                                    (SELECT id FROM b)),
  ('Shihab',             14.00, NULL,                                    (SELECT id FROM b)),
  ('Muthu (Musthafa)',   14.00, NULL,                                    (SELECT id FROM b)),
  ('Rashed Ali Licence', 30.00, NULL,                                    (SELECT id FROM b)),
  ('SHABEER MOORKANAD',   6.00, '5f2dca2d-c03d-4082-b20d-d2fbc11226e1',  (SELECT id FROM b)),
  ('ABDUL RAHMAN EK',     2.00, 'cf5a4e0a-6aec-42fc-8dc1-52e287ad6a4e',  (SELECT id FROM b)),
  ('AJMAL',               2.00, '1b14d2e1-da9b-4552-a289-60f0297742fd',  (SELECT id FROM b)),
  ('NASER',               2.00, 'fd48e06e-f11e-4e36-bf99-b64aa9a607f3',  (SELECT id FROM b)),
  ('MUKTHAR',             2.00, 'caf5fb92-85d2-4c53-bc2d-44150aac026e',  (SELECT id FROM b));

-- Investment records — Ajman (12,875 each from Shabeer's pool)
WITH sh AS (
  SELECT s.id, s.display_name FROM shareholders s
  JOIN branches b ON b.id = s.branch_id
  WHERE b.name = 'Ajman - Al Hamidiya'
)
INSERT INTO investments (shareholder_id, amount, invested_at, notes, recorded_by)
SELECT id, 12875, '2024-01-01',
       CASE display_name
         WHEN 'SHABEER MOORKANAD' THEN 'Shabeer own contribution — Ajman'
         WHEN 'NASER'             THEN 'Naser contribution — C/O Mukthar'
         WHEN 'AJMAL'             THEN 'Ajmal contribution — C/O Mukthar'
         WHEN 'ABDUL RAHMAN EK'   THEN 'Abdul Rahman contribution — C/O Mukthar'
         WHEN 'MUKTHAR'           THEN 'Mukthar contribution'
       END,
       'caf5fb92-85d2-4c53-bc2d-44150aac026e'
FROM sh
WHERE display_name IN ('SHABEER MOORKANAD', 'NASER', 'AJMAL', 'ABDUL RAHMAN EK', 'MUKTHAR');
