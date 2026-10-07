-- Teste das funções do SQL 09 (salvar e excluir lançamento). Veja o README desta pasta.
\set ON_ERROR_STOP off
\pset format unaligned
\pset tuples_only on
truncate public.transaction_allocations, public.attachments, public.transactions, public.closed_periods, public.user_roles, public.accounts, public.units, auth.users cascade;
insert into auth.users(id,email) values ('11111111-1111-1111-1111-111111111111','fin@x'),('22222222-2222-2222-2222-222222222222','op@x');
delete from public.user_roles;
insert into public.user_roles(user_id, role) values ('11111111-1111-1111-1111-111111111111','financeiro'),('22222222-2222-2222-2222-222222222222','operador');
insert into public.units(id,name) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Café'),('cccccccc-cccc-cccc-cccc-cccccccccccc','Boulevard');
create or replace function pg_temp.row(d text, amt numeric, comp text) returns jsonb language sql as $$
 select jsonb_build_object('type','despesa','description',d,'status','pendente','amount',amt,'tax_amount',0,'net_amount',amt,
  'competence_date',comp,'due_date',comp,'created_by','11111111-1111-1111-1111-111111111111','affects_dre',true,'affects_cashflow',true) $$;

\echo ===== 1) criar 3 parcelas com rateio (esperado: 3 ids, 3 lançamentos, 6 rateios)
begin; set local role authenticated; set local request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select 'ids=' || array_length(public.create_transactions_with_allocations(
  jsonb_build_array(pg_temp.row('Parc 1',100,'2026-09-10'),pg_temp.row('Parc 2',100,'2026-09-10'),pg_temp.row('Parc 3',100,'2026-09-10')),
  '[{"unit_id":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","allocation_type":"valor","amount":30},{"unit_id":"cccccccc-cccc-cccc-cccc-cccccccccccc","allocation_type":"valor","amount":70}]'::jsonb),1);
commit;
select 'transacoes=' || count(*) from public.transactions;
select 'rateios=' || count(*) from public.transaction_allocations;

\echo ===== 2) rateio inválido na criação (esperado: erro e NADA criado, continua 3)
begin; set local role authenticated; set local request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select public.create_transactions_with_allocations(jsonb_build_array(pg_temp.row('Falha',50,'2026-09-10')),
  '[{"unit_id":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","allocation_type":"invalido","amount":50}]'::jsonb);
rollback;
select 'transacoes=' || count(*) from public.transactions;

\echo ===== 3) editar valor sem rateio novo (esperado: rateios em R$ reajustados 60/140; descrição trocada; status mantido)
select id as tid from public.transactions where description='Parc 1' \gset
begin; set local role authenticated; set local request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select public.update_transaction_with_allocations(:'tid', '{"description":"Parc 1 editada","amount":200,"tax_amount":0,"net_amount":200}'::jsonb);
commit;
select 'desc=' || description || ' net=' || net_amount || ' status=' || status || ' created_by_ok=' || (created_by='11111111-1111-1111-1111-111111111111') from public.transactions where id=:'tid';
select 'rateios=' || string_agg(amount::text, ',' order by amount) from public.transaction_allocations where transaction_id=:'tid';

\echo ===== 4) editar só a observação (esperado: valor e rateio intactos)
begin; set local role authenticated; set local request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select public.update_transaction_with_allocations(:'tid', '{"notes":"obs"}'::jsonb);
commit;
select 'net=' || net_amount || ' notes=' || notes || ' rateios=' || (select string_agg(amount::text, ',' order by amount) from public.transaction_allocations where transaction_id=:'tid') from public.transactions where id=:'tid';

\echo ===== 5) trocar rateio com um item inválido (esperado: erro e o rateio ANTIGO continua)
begin; set local role authenticated; set local request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select public.update_transaction_with_allocations(:'tid', '{"notes":"x"}'::jsonb, '[{"unit_id":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","allocation_type":"invalido","amount":200}]'::jsonb);
rollback;
select 'rateios=' || string_agg(amount::text, ',' order by amount) || ' notes=' || (select notes from public.transactions where id=:'tid') from public.transaction_allocations where transaction_id=:'tid';

\echo ===== 6) trocar rateio por lista válida e por lista vazia
begin; set local role authenticated; set local request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select public.update_transaction_with_allocations(:'tid', '{}'::jsonb, '[{"unit_id":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","allocation_type":"percentual","percentage":100}]'::jsonb);
commit;
select 'apos_troca=' || count(*) || ' tipo=' || min(allocation_type::text) from public.transaction_allocations where transaction_id=:'tid';
begin; set local role authenticated; set local request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select public.update_transaction_with_allocations(:'tid', '{}'::jsonb, '[]'::jsonb);
commit;
select 'apos_vazio=' || count(*) from public.transaction_allocations where transaction_id=:'tid';

\echo ===== 7) operador tenta editar e excluir (esperado: erro transaction_not_found nos dois; nada muda)
begin; set local role authenticated; set local request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
select public.update_transaction_with_allocations(:'tid', '{"description":"hack"}'::jsonb);
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
select public.delete_transaction_with_children(:'tid');
rollback;
select 'desc=' || description from public.transactions where id=:'tid';

\echo ===== 8) sem login (esperado: erro 28000 nas duas)
begin; set local role authenticated; set local request.jwt.claim.sub='';
select public.delete_transaction_with_children(:'tid');
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub='';
select public.create_transactions_with_allocations('[]'::jsonb);
rollback;

\echo ===== 9) excluir (esperado: devolve row+rateios+anexos; lançamento, rateio e anexo somem)
select id as tid2 from public.transactions where description='Parc 2' \gset
insert into public.attachments(transaction_id,file_name,file_url,uploaded_by) values (:'tid2','nf.pdf','http://x/nf.pdf','11111111-1111-1111-1111-111111111111');
begin; set local role authenticated; set local request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select 'ret_row=' || (r->'row'->>'description') || ' rateios=' || jsonb_array_length(r->'allocations') || ' anexos=' || jsonb_array_length(r->'attachments') from (select public.delete_transaction_with_children(:'tid2') as r) q;
commit;
select 'restam_tx=' || count(*) || ' rateios_do_excluido=' || (select count(*) from public.transaction_allocations where transaction_id=:'tid2') || ' anexos_do_excluido=' || (select count(*) from public.attachments where transaction_id=:'tid2') from public.transactions;

\echo ===== 10) mês fechado: tudo é recusado e nada se perde
select id as tid3 from public.transactions where description='Parc 3' \gset
insert into public.attachments(transaction_id,file_name,file_url,uploaded_by) values (:'tid3','nf3.pdf','http://x/nf3.pdf','11111111-1111-1111-1111-111111111111');
insert into public.closed_periods(year,month) values (2026,9);
begin; set local role authenticated; set local request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select public.delete_transaction_with_children(:'tid3');
rollback;
select 'apos_delete_recusado: tx=' || (select count(*) from public.transactions where id=:'tid3') || ' anexos=' || (select count(*) from public.attachments where transaction_id=:'tid3') || ' rateios=' || (select count(*) from public.transaction_allocations where transaction_id=:'tid3');
begin; set local role authenticated; set local request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select public.update_transaction_with_allocations(:'tid3', '{"description":"x"}'::jsonb, '[]'::jsonb);
rollback;
select 'apos_update_recusado: rateios=' || (select count(*) from public.transaction_allocations where transaction_id=:'tid3') || ' desc=' || (select description from public.transactions where id=:'tid3');
begin; set local role authenticated; set local request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select public.create_transactions_with_allocations(jsonb_build_array(pg_temp.row('Em mes fechado',10,'2026-09-15')), '[]'::jsonb);
rollback;
select 'total_tx=' || count(*) from public.transactions;
