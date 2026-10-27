-- Saldos consultados e histórico de consultas da API do Bradesco: unicidade, validação e RLS.
-- Rodar depois das migrações (ver README). Linhas "ERROR:" nos casos marcados são o esperado.
\set ON_ERROR_STOP off
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1','fin@t'),('00000000-0000-0000-0000-0000000000f2','op@t') on conflict do nothing;
delete from public.user_roles where user_id in ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000f2');
insert into public.user_roles (user_id, role) values ('00000000-0000-0000-0000-0000000000f1','financeiro'),('00000000-0000-0000-0000-0000000000f2','operador');
insert into public.accounts (id, name) values ('00000000-0000-0000-0000-0000000000f9','Bradesco teste') on conflict do nothing;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000f1',false) \gset
\echo ===== 1) financeiro grava o saldo do dia (esperado: INSERT 0 1)
insert into public.bank_balance_snapshots (account_id, ref_date, source, total_resources, checking_balance) values ('00000000-0000-0000-0000-0000000000f9','2026-10-27','api_saldo',77.95,77.95);
\echo ===== 2) mesma conta, data e origem (esperado: ERROR unique)
insert into public.bank_balance_snapshots (account_id, ref_date, source, total_resources) values ('00000000-0000-0000-0000-0000000000f9','2026-10-27','api_saldo',1);
\echo ===== 3) origem fora da lista (esperado: ERROR check)
insert into public.bank_balance_snapshots (account_id, ref_date, source) values ('00000000-0000-0000-0000-0000000000f9','2026-10-28','planilha');
\echo ===== 4) registro de consulta de extrato (esperado: INSERT 0 1) e tipo inválido (esperado: ERROR check)
insert into public.bank_api_sync_runs (account_id, kind, rows_received, rows_inserted, rows_skipped) values ('00000000-0000-0000-0000-0000000000f9','extrato',10,8,2);
insert into public.bank_api_sync_runs (account_id, kind) values ('00000000-0000-0000-0000-0000000000f9','pix');
\echo ===== 5) financeiro lê (esperado: 1 e 1)
select (select count(*) from public.bank_balance_snapshots) as saldos, (select count(*) from public.bank_api_sync_runs) as consultas;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000f2',false) \gset
\echo ===== 6) operador não lê nem grava (esperado: 0 e 0, depois ERROR RLS)
select (select count(*) from public.bank_balance_snapshots) as saldos, (select count(*) from public.bank_api_sync_runs) as consultas;
insert into public.bank_balance_snapshots (account_id, ref_date, source) values ('00000000-0000-0000-0000-0000000000f9','2026-10-29','manual');
reset role;
set role anon;
\echo ===== 7) anônimo (esperado: ERROR permission denied)
select count(*) from public.bank_balance_snapshots;
reset role;
\echo ===== 8) apagar a conta leva os saldos junto e mantém o histórico sem conta (esperado: 0 e 1 com account_id nulo)
delete from public.accounts where id = '00000000-0000-0000-0000-0000000000f9';
select (select count(*) from public.bank_balance_snapshots) as saldos, (select count(*) from public.bank_api_sync_runs where account_id is null) as consultas_sem_conta;
