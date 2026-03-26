
-- Remove test unit that has no references
DELETE FROM units WHERE name = 'Quiosque Teste';

-- Deactivate old test bank accounts (can't delete due to FK references)
UPDATE accounts SET active = false WHERE name IN ('Caixa', 'Banco Principal', 'Cartão de Crédito');
