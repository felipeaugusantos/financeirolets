
-- ENUMS
CREATE TYPE public.app_role AS ENUM ('admin', 'financeiro', 'gerente_unidade', 'operador', 'vendedor');
CREATE TYPE public.transaction_type AS ENUM ('receita', 'despesa');
CREATE TYPE public.transaction_status AS ENUM ('pendente', 'pago', 'recebido', 'cancelado', 'agendado');
CREATE TYPE public.payment_method AS ENUM ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'boleto', 'transferencia', 'cheque', 'outro');
CREATE TYPE public.partner_type AS ENUM ('fornecedor', 'cliente', 'ambos');
CREATE TYPE public.category_type AS ENUM ('receita', 'despesa');
CREATE TYPE public.allocation_type AS ENUM ('percentual', 'valor');

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- USER ROLES
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'operador',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

-- UNITS
CREATE TABLE public.units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

-- BUSINESS FRONTS
CREATE TABLE public.business_fronts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.business_fronts ENABLE ROW LEVEL SECURITY;

-- ACCOUNTS
CREATE TABLE public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'banco',
  initial_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

-- DRE LINES (customizáveis, hierárquicas)
CREATE TABLE public.dre_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  parent_id UUID REFERENCES public.dre_lines(id),
  sort_order INT NOT NULL DEFAULT 0,
  is_subtotal BOOLEAN NOT NULL DEFAULT false,
  sign INT NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.dre_lines ENABLE ROW LEVEL SECURITY;

-- CATEGORIES (hierárquicas, mapeadas ao DRE)
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type category_type NOT NULL,
  parent_id UUID REFERENCES public.categories(id),
  dre_line_id UUID REFERENCES public.dre_lines(id),
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- PARTNERS
CREATE TABLE public.partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type partner_type NOT NULL DEFAULT 'fornecedor',
  document TEXT,
  email TEXT,
  phone TEXT,
  pix_key TEXT,
  pix_key_type TEXT,
  bank_name TEXT,
  bank_agency TEXT,
  bank_account TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

-- TRANSACTIONS
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type transaction_type NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(15,2) NOT NULL,
  tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  competence_date DATE NOT NULL,
  due_date DATE,
  payment_date DATE,
  status transaction_status NOT NULL DEFAULT 'pendente',
  payment_method payment_method,
  unit_id UUID REFERENCES public.units(id),
  front_id UUID REFERENCES public.business_fronts(id),
  category_id UUID REFERENCES public.categories(id),
  account_id UUID REFERENCES public.accounts(id),
  partner_id UUID REFERENCES public.partners(id),
  installment_number INT,
  installment_total INT,
  installment_group_id UUID,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- TRANSACTION ALLOCATIONS
CREATE TABLE public.transaction_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES public.units(id),
  front_id UUID REFERENCES public.business_fronts(id),
  allocation_type allocation_type NOT NULL DEFAULT 'percentual',
  percentage NUMERIC(5,2),
  amount NUMERIC(15,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.transaction_allocations ENABLE ROW LEVEL SECURITY;

-- ATTACHMENTS
CREATE TABLE public.attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size INT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

-- AUDIT LOGS
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL,
  old_data JSONB,
  new_data JSONB,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- USER-UNIT ASSIGNMENTS
CREATE TABLE public.user_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, unit_id)
);
ALTER TABLE public.user_units ENABLE ROW LEVEL SECURITY;

-- REPORT TEMPLATES (customizáveis)
CREATE TABLE public.report_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'dre',
  config JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id),
  is_default BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.report_templates ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES
-- ============================================
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Auth users can read units" ON public.units FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage units" ON public.units FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));

CREATE POLICY "Auth users can read fronts" ON public.business_fronts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage fronts" ON public.business_fronts FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));

CREATE POLICY "Auth users can read accounts" ON public.accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage accounts" ON public.accounts FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));

CREATE POLICY "Auth users can read categories" ON public.categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage categories" ON public.categories FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));

CREATE POLICY "Auth users can read dre_lines" ON public.dre_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage dre_lines" ON public.dre_lines FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));

CREATE POLICY "Auth users can read partners" ON public.partners FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage partners" ON public.partners FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));

CREATE POLICY "Auth users can read transactions" ON public.transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert transactions" ON public.transactions FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Admins can manage transactions" ON public.transactions FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));

CREATE POLICY "Auth users can read allocations" ON public.transaction_allocations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage allocations" ON public.transaction_allocations FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));

CREATE POLICY "Auth users can read attachments" ON public.attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert attachments" ON public.attachments FOR INSERT TO authenticated WITH CHECK (uploaded_by = auth.uid());
CREATE POLICY "Admins can manage attachments" ON public.attachments FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can read audit_logs" ON public.audit_logs FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own units" ON public.user_units FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins can manage user_units" ON public.user_units FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Auth users can read report_templates" ON public.report_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage report_templates" ON public.report_templates FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));

-- ============================================
-- TRIGGERS
-- ============================================

-- Audit trigger on transactions
CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs(table_name, record_id, action, new_data, user_id)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs(table_name, record_id, action, old_data, new_data, user_id)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs(table_name, record_id, action, old_data, user_id)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD), auth.uid());
    RETURN OLD;
  END IF;
END;
$$;

CREATE TRIGGER audit_transactions
  AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'operador');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at triggers
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_units_updated_at BEFORE UPDATE ON public.units FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_business_fronts_updated_at BEFORE UPDATE ON public.business_fronts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_partners_updated_at BEFORE UPDATE ON public.partners FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_report_templates_updated_at BEFORE UPDATE ON public.report_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
