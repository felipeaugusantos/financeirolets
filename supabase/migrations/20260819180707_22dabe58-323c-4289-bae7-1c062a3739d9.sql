-- Conciliação julho/2026: correções pontuais confirmadas contra extratos bancários

-- B. Correção de valores (somente amount/net_amount)
UPDATE public.transactions SET amount = 71.78, net_amount = 71.78 WHERE id = 'b9a6c6ce-777d-4b9b-9866-cf35d1c23993' AND net_amount = 30.71;
UPDATE public.transactions SET amount = 40.91, net_amount = 40.91 WHERE id = 'b75fb681-3588-4b8d-8e58-db48a93c967e' AND net_amount = 147.18;
UPDATE public.transactions SET amount = 320.80, net_amount = 320.80 WHERE id = '0f47741b-84e8-446d-98db-250b603465bf' AND net_amount = 337.20;
UPDATE public.transactions SET amount = 450.42, net_amount = 450.42 WHERE id = 'ccceccb3-d673-47d6-85de-acfec59a29ed' AND net_amount = 450.52;

-- C. Cancelamento (sem exclusão)
UPDATE public.transactions SET status = 'cancelado' WHERE id = 'ec39af03-b589-47e5-aabe-e09ba9b4d706' AND status = 'recebido';

-- D. Data de pagamento correta (PIX 72,50)
UPDATE public.transactions SET payment_date = '2026-07-21' WHERE id = '2c538855-e26c-41fd-ba56-70aa2992e517' AND payment_date = '2026-07-22';

-- Item 1: lançamento já existente sem data de pagamento (30,39)
UPDATE public.transactions SET payment_date = '2026-07-01', competence_date = '2026-07-01' WHERE id = '5035c345-a319-4dc8-88ec-d668c87df097' AND payment_date IS NULL;

-- A. Lançamentos ausentes, herdando os campos do Stone equivalente da mesma conta
INSERT INTO public.transactions (type, description, amount, tax_amount, net_amount, competence_date, payment_date, status, payment_method, category_id, account_id, unit_id, front_id, affects_dre, affects_cashflow, created_by, notes)
SELECT r.type, 'VISA ANTECIPACAO STONE INSTITUICAO DE PAGAMENTO', 205.95, 0, 205.95, '2026-07-10', '2026-07-10', r.status, r.payment_method, r.category_id, r.account_id, r.unit_id, r.front_id, r.affects_dre, r.affects_cashflow, r.created_by, 'Conciliação extrato julho/2026'
FROM public.transactions r WHERE r.id = '99a1b048-5984-4d32-b2b6-011897eb00a4';

INSERT INTO public.transactions (type, description, amount, tax_amount, net_amount, competence_date, payment_date, status, payment_method, category_id, account_id, unit_id, front_id, affects_dre, affects_cashflow, created_by, notes)
SELECT r.type, 'STONE VISA DEBITO STONE INSTITUICAO DE PAGAMENTO', 104.05, 0, 104.05, '2026-07-29', '2026-07-29', r.status, r.payment_method, r.category_id, r.account_id, r.unit_id, r.front_id, r.affects_dre, r.affects_cashflow, r.created_by, 'Conciliação extrato julho/2026'
FROM public.transactions r WHERE r.id = '99a1b048-5984-4d32-b2b6-011897eb00a4';