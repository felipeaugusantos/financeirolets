CREATE OR REPLACE FUNCTION public.generate_recurring_transactions()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  parent record;
  next_due date;
  next_competence date;
  generated_count integer := 0;
  interval_unit interval;
  today_local date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  FOR parent IN
    SELECT * FROM public.transactions
    WHERE is_recurring = true
      AND recurrence_parent_id IS NULL
      AND (recurrence_end_date IS NULL OR recurrence_end_date >= today_local)
  LOOP
    interval_unit := CASE parent.recurrence_frequency
      WHEN 'semanal' THEN interval '7 days'
      WHEN 'mensal' THEN interval '1 month'
      WHEN 'anual' THEN interval '1 year'
    END;

    next_due := COALESCE(parent.last_recurrence_generated_at, parent.due_date, parent.competence_date) + interval_unit;
    next_competence := COALESCE(parent.last_recurrence_generated_at, parent.competence_date) + interval_unit;

    WHILE next_due <= today_local + interval '30 days'
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

    UPDATE public.transactions
    SET last_recurrence_generated_at = next_due - interval_unit
    WHERE id = parent.id;
  END LOOP;

  RETURN generated_count;
END;
$function$;