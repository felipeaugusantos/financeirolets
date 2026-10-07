-- Teste de dashboard_summary (SQL 11). Veja o README desta pasta.
\set ON_ERROR_STOP off
\pset format unaligned
\pset tuples_only on
truncate public.transaction_allocations, public.transactions, public.accounts, public.units, public.categories, public.partners, public.user_roles, auth.users cascade;
insert into auth.users(id,email) values ('11111111-1111-1111-1111-111111111111','fin@x');
delete from public.user_roles;
insert into public.user_roles(user_id, role) values ('11111111-1111-1111-1111-111111111111','financeiro');
insert into public.units(id,name) values ('00000000-0000-0000-0000-0000000000a1','Café'),('00000000-0000-0000-0000-0000000000a2','Boulevard');
insert into public.categories(id,name,type) values ('00000000-0000-0000-0000-0000000000c1','Vendas','receita'),('00000000-0000-0000-0000-0000000000c2','Aluguel','despesa');
insert into public.accounts(id,name,type,initial_balance,initial_balance_date) values ('00000000-0000-0000-0000-0000000000b1','Banco','banco',5000,'2026-08-31');
-- mesmas linhas do teste do hook (hoje = 15/09/2026)
insert into public.transactions(id,type,description,amount,tax_amount,net_amount,status,payment_date,competence_date,due_date,category_id,unit_id,affects_dre,affects_cashflow,account_id,created_by) values
 ('10000000-0000-0000-0000-000000000001','receita','t1',1000,0,1000,'recebido','2026-09-10','2026-09-10',null,'00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1',true,true,'00000000-0000-0000-0000-0000000000b1','11111111-1111-1111-1111-111111111111'),
 ('10000000-0000-0000-0000-000000000002','despesa','t2 rateada',400,0,400,'pago','2026-09-11','2026-09-11',null,'00000000-0000-0000-0000-0000000000c2',null,true,true,'00000000-0000-0000-0000-0000000000b1','11111111-1111-1111-1111-111111111111'),
 ('10000000-0000-0000-0000-000000000003','despesa','t3 transferencia',300,0,300,'pago','2026-09-12','2026-09-12',null,'00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000a1',false,false,'00000000-0000-0000-0000-0000000000b1','11111111-1111-1111-1111-111111111111'),
 ('10000000-0000-0000-0000-000000000004','despesa','t4 vencida no periodo',200,0,200,'pendente',null,'2026-09-20','2026-09-05','00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000a2',true,true,null,'11111111-1111-1111-1111-111111111111'),
 ('10000000-0000-0000-0000-000000000005','despesa','t5 vencida ha meses',50,0,50,'pendente',null,'2026-06-01','2026-06-01',null,'00000000-0000-0000-0000-0000000000a1',true,true,null,'11111111-1111-1111-1111-111111111111'),
 ('10000000-0000-0000-0000-000000000006','receita','t6 antes da data-base',700,0,700,'recebido','2026-08-31','2026-08-31',null,'00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1',true,true,'00000000-0000-0000-0000-0000000000b1','11111111-1111-1111-1111-111111111111'),
 ('10000000-0000-0000-0000-000000000007','despesa','t7 cancelada',999,0,999,'cancelado','2026-09-13','2026-09-13',null,'00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000a1',true,true,'00000000-0000-0000-0000-0000000000b1','11111111-1111-1111-1111-111111111111');
insert into public.transaction_allocations(transaction_id,unit_id,allocation_type,percentage) values
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000a1','percentual',50),
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000a2','percentual',50);
create or replace function pg_temp.s(p_unit uuid default null, p_front uuid default null, p_prov boolean default false) returns jsonb language sql as $$
 select public.dashboard_summary('2026-09-01','2026-09-30',p_unit,p_front,p_prov,'2026-09-15') $$;

\echo ===== 1) visão geral (esperado: rec 1000, desp 400, mov 600 (700 na data-base fica fora), prov desp 200, atrasadas 2)
begin; set local role authenticated; set local request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select 'rec=' || (r->>'receitas') || ' desp=' || (r->>'despesas') || ' prov_desp=' || (r->>'despesasProvisionadas')
  || ' mov=' || (r->>'movimentacaoCalculada') || ' saldo_ini=' || (r->>'saldoInicialTotal') || ' cfg=' || (r->>'saldoInicialConfigurado')
  from (select pg_temp.s() r) q;
select 'atrasadas=' || jsonb_array_length(r->'overdueBills') || ' hoje=' || jsonb_array_length(r->'dueTodayBills') || ' ids=' || (r->'overdueBills'->0->>'description') || ',' || (r->'overdueBills'->1->>'description') from (select pg_temp.s() r) q;
select 'ranking=' || (select string_agg((x->>'unitName') || ':' || (x->>'despesas') || '/' || (x->>'receitas'), ' | ' order by ord) from jsonb_array_elements(r->'unitRanking') with ordinality t(x,ord)) from (select pg_temp.s() r) q;
select 'prev=' || (r->>'prevReceitas') || '/' || (r->>'prevDespesas') || ' semCat=' || (r->>'semCategoria') || ' semUnid=' || (r->>'semUnidade') from (select pg_temp.s() r) q;
select 'meses=' || jsonb_array_length(r->'monthly') || ' set=' || (r->'monthly'->0->>'receitas') || '/' || (r->'monthly'->0->>'despesas') || '/' || (r->'monthly'->0->>'despesasProv') from (select pg_temp.s() r) q;
select 'cat_desp=' || (r->'categoryData'->0->>'name') || ':' || (r->'categoryData'->0->>'value') || ' cat_rec=' || (r->'receitaCategoryData'->0->>'name') || ':' || (r->'receitaCategoryData'->0->>'value') from (select pg_temp.s() r) q;
commit;

\echo ===== 2) filtro Boulevard (esperado: desp 200 (metade da rateada), rec 0, saldo sem saldo inicial, atrasadas 1)
begin; set local role authenticated; set local request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select 'rec=' || (r->>'receitas') || ' desp=' || (r->>'despesas') || ' mov=' || (r->>'movimentacaoCalculada') || ' saldo_ini=' || (r->>'saldoInicialTotal') || ' cfg=' || (r->>'saldoInicialConfigurado') || ' atrasadas=' || jsonb_array_length(r->'overdueBills')
  from (select pg_temp.s('00000000-0000-0000-0000-0000000000a2') r) q;
select 'ranking=' || (select string_agg((x->>'unitName') || ':' || (x->>'despesas'), ' | ') from jsonb_array_elements(r->'unitRanking') x) from (select pg_temp.s('00000000-0000-0000-0000-0000000000a2') r) q;
commit;

\echo ===== 3) incluir provisionados (esperado: ranking Boulevard 400 = 200 rateada + 200 pendente; categorias somam provisionado)
begin; set local role authenticated; set local request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select 'ranking=' || (select string_agg((x->>'unitName') || ':' || (x->>'despesas'), ' | ' order by ord) from jsonb_array_elements(r->'unitRanking') with ordinality t(x,ord)) || ' cat_desp=' || (r->'categoryData'->0->>'value') from (select pg_temp.s(null,null,true) r) q;
commit;

\echo ===== 4) sem login (papel anon) e período invertido (esperado: permissão negada; período invertido devolve vazio, o app valida antes)
begin; set local role anon;
select pg_temp.s();
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select 'invertido: rec=' || (r->>'receitas') || ' meses=' || jsonb_array_length(r->'monthly') from (select public.dashboard_summary('2026-09-30','2026-09-01',null,null,false,'2026-09-15') r) q;
commit;

\echo ===== 5) período longo: máximo de 24 meses
begin; set local role authenticated; set local request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select 'meses=' || jsonb_array_length((public.dashboard_summary('2020-01-01','2026-09-30',null,null,false,'2026-09-15'))->'monthly');
commit;
