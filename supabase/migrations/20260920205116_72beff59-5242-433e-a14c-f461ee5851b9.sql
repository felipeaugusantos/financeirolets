
-- 1) desvincular linhas do extrato apontando para os lançamentos criados
UPDATE public.bank_statement_entries b
SET transaction_id = NULL,
    status = 'pendente',
    match_note = 'Revertido: conciliação agosto/2026 desfeita',
    updated_at = now()
WHERE b.transaction_id IN (
  SELECT id FROM public.transactions WHERE notes ILIKE '%Concilia%OFX%agosto%'
);

-- 2) remover alocações de rateio desses lançamentos
DELETE FROM public.transaction_allocations
WHERE transaction_id IN (
  SELECT id FROM public.transactions WHERE notes ILIKE '%Concilia%OFX%agosto%'
);

-- 3) remover os lançamentos criados pela conciliação
DELETE FROM public.transactions
WHERE notes ILIKE '%Concilia%OFX%agosto%';
