-- Teste de unlink_statement_entries (SQL 10). Veja o README desta pasta.
\set ON_ERROR_STOP off
\pset format unaligned
\pset tuples_only on
truncate public.transaction_allocations, public.bank_statement_entries, public.card_statement_entries, public.transactions, public.closed_periods, public.user_roles, public.accounts, public.units, auth.users cascade;
insert into auth.users(id,email) values ('11111111-1111-1111-1111-111111111111','fin@x'),('22222222-2222-2222-2222-222222222222','op@x');
delete from public.user_roles;
insert into public.user_roles(user_id, role) values ('11111111-1111-1111-1111-111111111111','financeiro'),('22222222-2222-2222-2222-222222222222','operador');
insert into public.accounts(id,name,type) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Bradesco Café','banco');
insert into public.units(id,name) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Café');
insert into public.bank_statement_entries(id,account_id,fitid,posted_at,amount,memo,status) values
 ('e0000000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','F1','2026-09-23', -100,'TARIFA','pendente'),
 ('e0000000-0000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','F2','2026-09-23', -200,'FORNECEDOR','pendente'),
 ('e0000000-0000-0000-0000-000000000003','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','F3','2026-09-24', -30,'AGRUP A','pendente'),
 ('e0000000-0000-0000-0000-000000000004','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','F4','2026-09-24', -20,'AGRUP B','pendente'),
 ('e0000000-0000-0000-0000-000000000005','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','F5','2026-09-25', -10,'IGNORADA','pendente');
create or replace function pg_temp.tx(amount numeric, d text) returns jsonb language sql as $$
 select jsonb_build_object('type','despesa','description',d,'amount',amount,'tax_amount',0,'net_amount',amount,
  'competence_date','2026-09-23','due_date','2026-09-23','payment_date','2026-09-23','status','pago',
  'account_id','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$;
-- como o app faz: criar a partir do extrato (nota 'Criado a partir do extrato')
begin; set local role authenticated; set local request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select public.create_transaction_from_entries(array['e0000000-0000-0000-0000-000000000001']::uuid[], pg_temp.tx(100,'Tarifa criada'), '[{"unit_id":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","allocation_type":"percentual","percentage":100}]'::jsonb, 'Criado a partir do extrato') is not null;
select public.create_transaction_from_entries(array['e0000000-0000-0000-0000-000000000003','e0000000-0000-0000-0000-000000000004']::uuid[], pg_temp.tx(50,'Agrupado'), '[]'::jsonb, 'Criado a partir do extrato (agrupado: 2 linhas)') is not null;
commit;
-- lançamento que já existia e foi só vinculado
insert into public.transactions(id,type,description,amount,tax_amount,net_amount,competence_date,payment_date,status,account_id,created_by)
 values ('f0000000-0000-0000-0000-000000000002','despesa','Fornecedor lançado antes',200,0,200,'2026-09-23','2026-09-23','pago','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111');
update public.bank_statement_entries set status='vinculado', transaction_id='f0000000-0000-0000-0000-000000000002', match_note='Vinculado na conciliação em painéis' where fitid='F2';
update public.bank_statement_entries set status='ignorado', ignore_reason='Transferência própria', match_note='Transferência própria' where fitid='F5';
select 'inicio: tx=' || count(*) from public.transactions;

\echo ===== 1) desvincular linha CRIADA a partir do extrato (esperado: unlinked=1 deleted=1; linha pendente; lançamento e rateio somem)
begin; set local role authenticated; set local request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select public.unlink_statement_entries(array['e0000000-0000-0000-0000-000000000001']::uuid[]);
commit;
select 'linha=' || status || ' tx_id_nulo=' || (transaction_id is null) from public.bank_statement_entries where fitid='F1';
select 'tx_tarifa=' || count(*) || ' rateios=' || (select count(*) from public.transaction_allocations) from public.transactions where description='Tarifa criada';

\echo ===== 2) desvincular linha ligada a lançamento que JÁ EXISTIA (esperado: unlinked=1 deleted=0 kept=0; lançamento permanece)
begin; set local role authenticated; set local request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select public.unlink_statement_entries(array['e0000000-0000-0000-0000-000000000002']::uuid[]);
commit;
select 'linha=' || status || ' lancamento_existe=' || (select count(*) from public.transactions where id='f0000000-0000-0000-0000-000000000002') from public.bank_statement_entries where fitid='F2';

\echo ===== 3) agrupado: desvincular só UMA das 2 linhas (esperado: deleted=0 kept=1; lançamento permanece)
begin; set local role authenticated; set local request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select public.unlink_statement_entries(array['e0000000-0000-0000-0000-000000000003']::uuid[]);
commit;
select 'agrupado_existe=' || count(*) from public.transactions where description='Agrupado';
\echo ===== 3b) desvincular a ÚLTIMA linha do agrupamento (esperado: deleted=1)
begin; set local role authenticated; set local request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select public.unlink_statement_entries(array['e0000000-0000-0000-0000-000000000004']::uuid[]);
commit;
select 'agrupado_existe=' || count(*) from public.transactions where description='Agrupado';

\echo ===== 4) recriar o agrupado e desvincular as duas JUNTAS (esperado: unlinked=2 deleted=1)
begin; set local role authenticated; set local request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select public.create_transaction_from_entries(array['e0000000-0000-0000-0000-000000000003','e0000000-0000-0000-0000-000000000004']::uuid[], pg_temp.tx(50,'Agrupado 2'), '[]'::jsonb, 'Criado a partir do extrato (agrupado: 2 linhas)') is not null;
select public.unlink_statement_entries(array['e0000000-0000-0000-0000-000000000003','e0000000-0000-0000-0000-000000000004']::uuid[]);
commit;
select 'agrupado2_existe=' || count(*) from public.transactions where description='Agrupado 2';

\echo ===== 5) reabrir linha IGNORADA (esperado: unlinked=1 deleted=0; linha pendente)
begin; set local role authenticated; set local request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select public.unlink_statement_entries(array['e0000000-0000-0000-0000-000000000005']::uuid[]);
commit;
select 'linha=' || status || ' motivo_limpo=' || (ignore_reason is null) from public.bank_statement_entries where fitid='F5';

\echo ===== 6) mês fechado (esperado: erro e NADA muda: linha continua vinculada, lançamento existe)
begin; set local role authenticated; set local request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select public.create_transaction_from_entries(array['e0000000-0000-0000-0000-000000000001']::uuid[], pg_temp.tx(100,'Tarifa 2'), '[]'::jsonb, 'Criado a partir do extrato') is not null;
commit;
insert into public.closed_periods(year,month) values (2026,9);
begin; set local role authenticated; set local request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select public.unlink_statement_entries(array['e0000000-0000-0000-0000-000000000001']::uuid[]);
rollback;
select 'linha=' || status || ' tx=' || (select count(*) from public.transactions where description='Tarifa 2') from public.bank_statement_entries where fitid='F1';
delete from public.closed_periods;

\echo ===== 7) operador (sem permissão) (esperado: erro entry_not_found; nada muda)
begin; set local role authenticated; set local request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
select public.unlink_statement_entries(array['e0000000-0000-0000-0000-000000000001']::uuid[]);
rollback;
select 'linha=' || status || ' tx=' || (select count(*) from public.transactions where description='Tarifa 2') from public.bank_statement_entries where fitid='F1';

\echo ===== 8) sem login, lista vazia e id inexistente (esperado: 3 erros)
begin; set local role authenticated; set local request.jwt.claim.sub='';
select public.unlink_statement_entries(array['e0000000-0000-0000-0000-000000000001']::uuid[]);
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select public.unlink_statement_entries('{}'::uuid[]);
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select public.unlink_statement_entries(array['99999999-9999-9999-9999-999999999999']::uuid[]);
rollback;
