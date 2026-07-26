-- Run this once in Supabase SQL Editor

-- 1. Add cms_role to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cms_role text
  CHECK (cms_role IN ('admin', 'editor'));

-- 2. Audit Log (player hide/score edit actions)
CREATE TABLE IF NOT EXISTS cms_audit_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  action text NOT NULL,
  performed_by uuid REFERENCES auth.users(id),
  target_type text,
  target_id text,
  details jsonb,
  created_at timestamptz DEFAULT now()
);

-- 3. Push Notification Log
CREATE TABLE IF NOT EXISTS push_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  body text NOT NULL,
  category text,
  deep_link text,
  sent_by uuid REFERENCES auth.users(id),
  sent_at timestamptz DEFAULT now(),
  recipient_count integer DEFAULT 0
);

-- 4. Enable RLS
ALTER TABLE cms_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_log ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
CREATE POLICY "cms read audit" ON cms_audit_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND cms_role IS NOT NULL));

CREATE POLICY "cms insert audit" ON cms_audit_log FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND cms_role IS NOT NULL));

CREATE POLICY "cms read push_log" ON push_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND cms_role IS NOT NULL));

CREATE POLICY "cms insert push_log" ON push_log FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND cms_role IS NOT NULL));

-- 6. Create a CMS admin user
-- After running this SQL, go to Supabase Auth > Users > Invite user
-- Then run: UPDATE profiles SET cms_role = 'admin' WHERE id = '<that user uuid>';
