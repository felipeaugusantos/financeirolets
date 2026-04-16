-- Enum de frequência
DO $$ BEGIN
  CREATE TYPE public.recurrence_frequency AS ENUM ('semanal', 'mensal', 'anual');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Colunas na transactions
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence_frequency public.recurrence_frequency,
  ADD COLUMN IF NOT EXISTS recurrence_end_date date,
  ADD COLUMN IF NOT EXISTS recurrence_parent_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_recurrence_generated_at date;

CREATE INDEX IF NOT EXISTS idx_transactions_recurring 
  ON public.transactions(is_recurring) WHERE is_recurring = true;

CREATE INDEX IF NOT EXISTS idx_transactions_recurrence_parent 
  ON public.transactions(recurrence_parent_id);

-- Função para gerar próximas ocorrências (chamada manualmente ou via cron)
CREATE OR REPLACE FUNCTION public.generate_recurring_transactions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent record;
  next_due date;
  next_competence date;
  generated_count integer := 0;
  interval_unit interval;
BEGIN
  FOR parent IN
    SELECT * FROM public.transactions
    WHERE is_recurring = true
      AND recurrence_parent_id IS NULL
      AND (recurrence_end_date IS NULL OR recurrence_end_date >= CURRENT_DATE)
  LOOP
    -- Definir intervalo
    interval_unit := CASE parent.recurrence_frequency
      WHEN 'semanal' THEN interval '7 days'
      WHEN 'mensal' THEN interval '1 month'
      WHEN 'anual' THEN interval '1 year'
    END;

    -- Próxima data baseada na última gerada (ou na original)
    next_due := COALESCE(parent.last_recurrence_generated_at, parent.due_date, parent.competence_date) + interval_unit;
    next_competence := COALESCE(parent.last_recurrence_generated_at, parent.competence_date) + interval_unit;

    -- Gerar enquanto não exceder 30 dias no futuro nem o end_date
    WHILE next_due <= CURRENT_DATE + interval '30 days'
      AND (parent.recurrence_end_date IS NULL OR next_due <= parent.recurrence_end_date)
    LOOP
      INSERT INTO public.transactions (
        type, description, amount, tax_amount, net_amount,
        competence_date, due_date, status,
        payment_method, category_id, account_id, partner_id,
        unit_id, front_id, notes, created_by,
        recurrence_parent_id
      ) VALUES (
        parent.type, parent.description, parent.amount, parent.tax_amount, parent.net_amount,
        next_competence, next_due,
        CASE WHEN parent.type = 'receita' THEN 'pendente'::transaction_status ELSE 'pendente'::transaction_status END,
        parent.payment_method, parent.category_id, parent.account_id, parent.partner_id,
        parent.unit_id, parent.front_id, parent.notes, parent.created_by,
        parent.id
      );
      generated_count := generated_count + 1;
      next_due := next_due + interval_unit;
      next_competence := next_competence + interval_unit;
    END LOOP;

    -- Atualizar marcador
    UPDATE public.transactions
    SET last_recurrence_generated_at = next_due - interval_unit
    WHERE id = parent.id;
  END LOOP;

  RETURN generated_count;
END;
$$;