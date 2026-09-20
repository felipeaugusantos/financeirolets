-- ---------------------------------------------------------------
-- Chat Kaikin: histórico de mensagens por usuário
-- Idempotente: pode rodar mais de uma vez sem erro.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kaikin_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL,
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kaikin_messages_user_created_idx
  ON public.kaikin_messages (user_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kaikin_messages TO authenticated;
GRANT ALL ON public.kaikin_messages TO service_role;

ALTER TABLE public.kaikin_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kaikin_messages_select_own ON public.kaikin_messages;
CREATE POLICY kaikin_messages_select_own ON public.kaikin_messages
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS kaikin_messages_insert_own ON public.kaikin_messages;
CREATE POLICY kaikin_messages_insert_own ON public.kaikin_messages
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS kaikin_messages_update_own ON public.kaikin_messages;
CREATE POLICY kaikin_messages_update_own ON public.kaikin_messages
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS kaikin_messages_delete_own ON public.kaikin_messages;
CREATE POLICY kaikin_messages_delete_own ON public.kaikin_messages
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
