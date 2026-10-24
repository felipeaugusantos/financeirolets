-- CRM / pedidos B2B / Fábrica: acesso por papel, trava de carteira e idempotência dos scripts 14a-14f.
-- Rodar depois das migrações e dos scripts de scripts/producao/14-crm-fabrica (ver README).
-- Linhas "ERROR:" nos casos marcados como esperado são o comportamento correto.
\set ON_ERROR_STOP off
reset role;
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-0000000000a1','vend-a@t'),('00000000-0000-0000-0000-0000000000a2','vend-b@t'),
 ('00000000-0000-0000-0000-0000000000a3','gerente@t'),('00000000-0000-0000-0000-0000000000a4','vend-outra@t'),
 ('00000000-0000-0000-0000-0000000000a5','operador@t'),('00000000-0000-0000-0000-0000000000a6','admin@t');
insert into public.units (id, name) values ('00000000-0000-0000-0000-0000000000b1','U1'),('00000000-0000-0000-0000-0000000000b2','U2') on conflict do nothing;
delete from public.user_roles where user_id in (select id from auth.users where email like '%@t');
insert into public.user_roles (user_id, role) values
 ('00000000-0000-0000-0000-0000000000a1','vendedor'),('00000000-0000-0000-0000-0000000000a2','vendedor'),
 ('00000000-0000-0000-0000-0000000000a3','gerente_unidade'),('00000000-0000-0000-0000-0000000000a4','vendedor'),
 ('00000000-0000-0000-0000-0000000000a5','operador'),('00000000-0000-0000-0000-0000000000a6','admin');
insert into public.user_units (user_id, unit_id) values
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b1'),
 ('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000b1'),
 ('00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000b1'),
 ('00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000b2')
 on conflict do nothing;
insert into public.crm_products (id, name) values ('00000000-0000-0000-0000-0000000000c1','Cookie') on conflict do nothing;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
\echo ===== 1) vendedor A cria empresa na sua unidade (esperado: INSERT 0 1)
insert into public.crm_companies (id, name, unit_id, owner_id) values ('00000000-0000-0000-0000-0000000000d1','Empresa A','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1');
\echo ===== 2) vendedor A cria empresa em unidade que não é dele (esperado: ERROR RLS)
insert into public.crm_companies (name, unit_id, owner_id) values ('Fora','00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000a1');
\echo ===== 3) vendedor A vê 1 empresa (esperado: 1)
select count(*) from public.crm_companies;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
\echo ===== 4) vendedor B, mesma unidade, não vê a carteira do A (esperado: 0)
select count(*) from public.crm_companies;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false);
\echo ===== 5) gerente da unidade vê (esperado: 1)
select count(*) from public.crm_companies;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
\echo ===== 6) vendedor de outra unidade não vê (esperado: 0)
select count(*) from public.crm_companies;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
\echo ===== 7) vendedor tenta transferir a carteira (esperado: ERROR Somente administrador)
update public.crm_companies set owner_id='00000000-0000-0000-0000-0000000000a2' where id='00000000-0000-0000-0000-0000000000d1';
\echo ===== 8) oportunidade com dono diferente da empresa (esperado: ERROR)
insert into public.crm_opportunities (company_id, title, unit_id, owner_id) values ('00000000-0000-0000-0000-0000000000d1','Op','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a2');
\echo ===== 9) oportunidade correta (esperado: INSERT 0 1)
insert into public.crm_opportunities (id, company_id, title, unit_id, owner_id) values ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000d1','Op','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1');
\echo ===== 10) pedido B2B vinculado à oportunidade; segundo pedido para a mesma oportunidade (esperado: INSERT 0 1 e depois ERROR unique)
insert into public.crm_orders (company_id, unit_id, owner_id, opportunity_id) values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e1');
insert into public.crm_orders (company_id, unit_id, owner_id, opportunity_id) values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e1');
\echo ===== 11) empresa marcada para não contatar bloqueia nova oportunidade (esperado: ERROR)
reset role;
update public.crm_companies set do_not_contact = true where id='00000000-0000-0000-0000-0000000000d1';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
insert into public.crm_opportunities (company_id, title, unit_id, owner_id) values ('00000000-0000-0000-0000-0000000000d1','Op2','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1');
\echo ===== 12) CRM não pode ser apagado por usuário (esperado: ERROR permission denied)
delete from public.crm_companies;
\echo ===== 13) operador lê produtos mas não grava (esperado: 1 e depois ERROR RLS)
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select count(*) from public.crm_products;
insert into public.crm_products (name) values ('Tentativa');
\echo ===== 14) vendedor não vê repasses do iFood nem os lotes de fábrica pode gravar (esperado: 0 e depois ERROR RLS)
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select count(*) from public.ifood_payout_postings;
insert into public.factory_batches (production_date, product_id) values (current_date,'00000000-0000-0000-0000-0000000000c1');
\echo ===== 15) gerente grava lote e previsão duplicada é recusada (esperado: INSERT 0 1, INSERT 0 1, ERROR unique)
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false);
insert into public.factory_batches (production_date, product_id) values (current_date,'00000000-0000-0000-0000-0000000000c1');
insert into public.factory_forecasts (production_date, unit_id, product_id, quantity) values (current_date,'00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000c1',10);
insert into public.factory_forecasts (production_date, unit_id, product_id, quantity) values (current_date,'00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000c1',20);
\echo ===== 16) sem login (anon) não lê nada (esperado: ERROR permission denied)
reset role;
set role anon;
select count(*) from public.crm_companies;
reset role;
