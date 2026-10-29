-- Kaikin (assistente de IA): contador de uso por usuário para limitar pedidos por minuto e por dia.
-- A tabela não é acessível pelo app: só a função kaikin_consume (do próprio usuário autenticado) escreve nela. Idempotente.

CREATE TABLE IF NOT EXISTS public.kaikin_usage (
  user_id uuid NOT NULL,
  bucket text NOT NULL CHECK (bucket IN ('minute','day')),
  window_start timestamptz NOT NULL,
  used integer NOT NULL DEFAULT 0 CHECK (used >= 0),
  PRIMARY KEY (user_id, bucket, window_start)
);

ALTER TABLE public.kaikin_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kaikin_usage FROM anon, authenticated;
GRANT ALL ON public.kaikin_usage TO service_role;

-- Consome 1 pedido do usuário logado. Só conta quando cabe nos dois limites; pedidos recusados não gastam a cota do dia.
-- O dia vira à meia-noite de America/Sao_Paulo. Devolve {"allowed": bool, "retry_after": segundos, "limit": "minute"|"day"|null}.
CREATE OR REPLACE FUNCTION public.kaikin_consume(p_per_minute integer, p_per_day integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_now timestamptz := now();
  v_minute timestamptz := date_trunc('minute', v_now);
  v_day timestamptz := date_trunc('day', v_now AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
  v_hit integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = '28000';
  END IF;
  IF p_per_minute IS NULL OR p_per_day IS NULL OR p_per_minute < 1 OR p_per_day < 1 THEN
    RAISE EXCEPTION 'Limites inválidos' USING ERRCODE = '22023';
  END IF;

  -- Dia primeiro: se já estourou, não mexe no minuto.
  INSERT INTO public.kaikin_usage AS u (user_id, bucket, window_start, used)
  VALUES (v_user, 'day', v_day, 1)
  ON CONFLICT (user_id, bucket, window_start) DO UPDATE SET used = u.used + 1 WHERE u.used < p_per_day
  RETURNING 1 INTO v_hit;
  IF v_hit IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'limit', 'day',
      'retry_after', GREATEST(1, CEIL(EXTRACT(EPOCH FROM ((v_day + interval '1 day') - v_now)))::integer));
  END IF;

  v_hit := NULL;
  INSERT INTO public.kaikin_usage AS u (user_id, bucket, window_start, used)
  VALUES (v_user, 'minute', v_minute, 1)
  ON CONFLICT (user_id, bucket, window_start) DO UPDATE SET used = u.used + 1 WHERE u.used < p_per_minute
  RETURNING 1 INTO v_hit;
  IF v_hit IS NULL THEN
    -- devolve o pedido do dia que acabou de ser contado
    UPDATE public.kaikin_usage SET used = used - 1 WHERE user_id = v_user AND bucket = 'day' AND window_start = v_day;
    RETURN jsonb_build_object('allowed', false, 'limit', 'minute',
      'retry_after', GREATEST(1, CEIL(EXTRACT(EPOCH FROM ((v_minute + interval '1 minute') - v_now)))::integer));
  END IF;

  -- Limpeza eventual de janelas antigas (a tabela não cresce sem fim).
  IF random() < 0.01 THEN
    DELETE FROM public.kaikin_usage WHERE window_start < v_now - interval '3 days';
  END IF;

  RETURN jsonb_build_object('allowed', true, 'limit', NULL, 'retry_after', 0);
END;
$$;

REVOKE ALL ON FUNCTION public.kaikin_consume(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kaikin_consume(integer, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
