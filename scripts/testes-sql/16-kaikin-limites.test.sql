-- Limites do Kaikin: contagem por usuário, minuto e dia, recusa sem gastar cota, isolamento e acesso.
-- Só precisa dos stubs e da migração 20261029120000 (ver README). Linhas "ERROR:" nos casos marcados são o esperado.
\set ON_ERROR_STOP off
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1','a@t'),('00000000-0000-0000-0000-0000000000a2','b@t') on conflict do nothing;
delete from public.kaikin_usage;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \gset
\echo ===== 1) três pedidos com limite 3/min (esperado: allowed true x3)
select public.kaikin_consume(3, 100)->>'allowed' as a1, public.kaikin_consume(3, 100)->>'allowed' as a2, public.kaikin_consume(3, 100)->>'allowed' as a3;
\echo ===== 2) quarto pedido (esperado: allowed false, limit minute, retry_after entre 1 e 60)
select r->>'allowed' as allowed, r->>'limit' as lim, (r->>'retry_after')::int between 1 and 60 as retry_ok from (select public.kaikin_consume(3, 100) as r) s;
\echo ===== 3) recusa por minuto não gasta o dia (esperado: dia = 3)
reset role;
select used as dia from public.kaikin_usage where bucket = 'day' and user_id = '00000000-0000-0000-0000-0000000000a1';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \gset
\echo ===== 4) outro usuário tem a própria cota (esperado: allowed true)
select public.kaikin_consume(3, 100)->>'allowed' as allowed;
\echo ===== 5) limite do dia 3, com 1 já usado no caso 4 (esperado: true, true, depois false com limit day e retry_after até 86400)
select public.kaikin_consume(50, 3)->>'allowed' as a1, public.kaikin_consume(50, 3)->>'allowed' as a2;
select r->>'allowed' as allowed, r->>'limit' as lim, (r->>'retry_after')::int between 1 and 86400 as retry_ok from (select public.kaikin_consume(50, 3) as r) s;
reset role;
\echo ===== 6) recusa por dia não conta o minuto (esperado: minuto do usuário B = 3: um do caso 4 e dois do caso 5)
select used as minuto from public.kaikin_usage where bucket = 'minute' and user_id = '00000000-0000-0000-0000-0000000000a2';
set role authenticated;
\echo ===== 7) limites inválidos (esperado: ERROR Limites inválidos)
select public.kaikin_consume(0, 10);
select public.kaikin_consume(null, 10);
\echo ===== 8) sem usuário (esperado: ERROR não autenticado)
select set_config('request.jwt.claim.sub','',false) \gset
select public.kaikin_consume(3, 10);
\echo ===== 9) o usuário não lê nem altera a tabela (esperado: ERROR permission denied x2)
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \gset
select count(*) from public.kaikin_usage;
update public.kaikin_usage set used = 0;
reset role;
set role anon;
\echo ===== 10) anônimo não executa a função (esperado: ERROR permission denied)
select public.kaikin_consume(3, 10);
reset role;
