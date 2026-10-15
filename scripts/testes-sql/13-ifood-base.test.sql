-- iFood base: duas lojas, pedido com item e financeiro; RLS por papel; unicidade.
-- Rodar depois das migrações (ver README). Erros ERROR: nos casos marcados são o esperado.
\set ON_ERROR_STOP off
insert into public.units (id, name) values ('00000000-0000-0000-0000-0000000000a1', 'Loja 1 teste') on conflict do nothing;
insert into public.ifood_stores (id, name, merchant_id, unit_id) values
 ('00000000-0000-0000-0000-0000000000b1', 'Loja 1', 'M1', '00000000-0000-0000-0000-0000000000a1'),
 ('00000000-0000-0000-0000-0000000000b2', 'Loja 2', null, null);
\echo ===== 1) duas lojas, uma sem merchant_id ainda (esperado: 2)
select count(*) from public.ifood_stores;
\echo ===== 2) merchant_id repetido (esperado: ERROR unique)
insert into public.ifood_stores (name, merchant_id) values ('Dup', 'M1');
insert into public.ifood_orders (id, store_id, ifood_order_id, order_amount) values
 ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'P1', 50);
\echo ===== 3) mesmo pedido na mesma loja (esperado: ERROR unique)
insert into public.ifood_orders (store_id, ifood_order_id) values ('00000000-0000-0000-0000-0000000000b1', 'P1');
\echo ===== 4) mesmo pedido em OUTRA loja é permitido (esperado: INSERT 0 1)
insert into public.ifood_orders (store_id, ifood_order_id) values ('00000000-0000-0000-0000-0000000000b2', 'P1');
insert into public.ifood_order_items (order_id, line_no, name, quantity, unit_price, total_price)
 values ('00000000-0000-0000-0000-0000000000c1', 1, 'Cookie', 2, 25, 50);
insert into public.ifood_order_financials (order_id, gross_value, commission, net_value)
 values ('00000000-0000-0000-0000-0000000000c1', 50, 12, 38);
\echo ===== 5) apagar o pedido leva itens e financeiro (esperado: 0 e 0)
delete from public.ifood_orders where id = '00000000-0000-0000-0000-0000000000c1';
select (select count(*) from public.ifood_order_items) as itens, (select count(*) from public.ifood_order_financials) as fin;
\echo ===== 6) usuário sem papel não lê nada (esperado: 0 linhas)
set role authenticated;
select count(*) from public.ifood_stores;
reset role;
