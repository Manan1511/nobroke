-- Allow Realtime to publish only friendship rows involving the signed-in user.
-- The app schema remains outside PostgREST's exposed schemas.
GRANT SELECT ON app.friendships TO authenticated;

CREATE POLICY friendships_participant_read ON app.friendships
  FOR SELECT TO authenticated
  USING (user_a = auth.uid() OR user_b = auth.uid());

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_publication WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'app'
      AND tablename = 'friendships'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE app.friendships';
  END IF;
END
$$;
