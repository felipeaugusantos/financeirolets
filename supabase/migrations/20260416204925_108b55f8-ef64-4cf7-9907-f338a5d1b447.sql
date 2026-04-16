-- Tabela de orçamentos
CREATE TABLE public.budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year integer NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  dre_line_id uuid NOT NULL REFERENCES public.dre_lines(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.units(id) ON DELETE CASCADE,
  planned_amount numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT budgets_unique UNIQUE (year, month, dre_line_id, unit_id)
);

-- Permite UNIQUE com unit_id NULL (consolidado)
CREATE UNIQUE INDEX budgets_unique_consolidated
  ON public.budgets (year, month, dre_line_id)
  WHERE unit_id IS NULL;

CREATE INDEX idx_budgets_period ON public.budgets (year, month);
CREATE INDEX idx_budgets_dre_line ON public.budgets (dre_line_id);
CREATE INDEX idx_budgets_unit ON public.budgets (unit_id);

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/financeiro can manage budgets"
  ON public.budgets
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role));

CREATE POLICY "Admin/financeiro/gerente can read budgets"
  ON public.budgets
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role) OR has_role(auth.uid(), 'gerente_unidade'::app_role));

CREATE TRIGGER budgets_updated_at
  BEFORE UPDATE ON public.budgets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Auditoria
CREATE TRIGGER budgets_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.budgets
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_trigger_func();