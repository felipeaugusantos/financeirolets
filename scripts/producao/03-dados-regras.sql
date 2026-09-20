-- =====================================================================
-- DADOS: regras de conciliação (ofx_import_rules) + unidade padrão das contas
-- Rodar DEPOIS das migrações de schema (02-migracoes-schema.sql).
-- Seguro para rodar mais de uma vez: usa ON CONFLICT DO NOTHING.
-- ATENÇÃO: os IDs de categoria / frente / unidade / conta abaixo são os
-- mesmos de produção (o banco de homologação foi carregado a partir do
-- backup de produção). Se algum ID não existir em produção, a linha falha —
-- rode a conferência no fim do arquivo.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------
-- 1) Unidade padrão de cada conta bancária (usada por "unidade do extrato")
-- ---------------------------------------------------------------
update public.accounts set default_unit_id = '9ef5217b-7779-4871-a3b9-144a8d23aa58'::uuid where id = 'f006bc0a-1f53-484c-bee6-90d66573943a'::uuid;
update public.accounts set default_unit_id = '82d4efc8-2488-4c2f-976a-d00b606bebde'::uuid where id = 'b8340c53-a868-4aa4-a3fb-04ad006fcfa1'::uuid;
update public.accounts set default_unit_id = '6b1ffe3d-93df-40f9-b02b-ec56847ebacc'::uuid where id = 'b41cb24e-8b28-43ae-8689-dd0942bea5bb'::uuid;
update public.accounts set default_unit_id = 'b9120d67-86aa-414d-80db-3e530d857469'::uuid where id = '7f5cf0ce-b68f-49ff-a797-a223a3b2f5e6'::uuid;
update public.accounts set default_unit_id = '9ef5217b-7779-4871-a3b9-144a8d23aa58'::uuid where id = '9149afec-6f9c-415f-88a5-328ff356088d'::uuid;
update public.accounts set default_unit_id = '82d4efc8-2488-4c2f-976a-d00b606bebde'::uuid where id = '3ede236b-995b-4675-a0db-9f09f918c450'::uuid;

-- ---------------------------------------------------------------
-- 2) Regras de conciliação (37)
-- ---------------------------------------------------------------
insert into public.ofx_import_rules
  (id,pattern,match_type,applies_to,category_id,unit_id,front_id,partner_id,priority,active,account_id,exclude_pattern,min_amount,max_amount,use_statement_unit,allocations)
values
('6158c470-ceb3-4ab2-86d0-3225a1b5f4f2'::uuid,'AMEX ANTECIPACAO STONE','contains','receita','56993ca5-cdc5-46e9-9345-3521101956f5'::uuid,null,'61f839a7-29b4-4483-bf11-7fe08884c492'::uuid,null,100,true,null,null,null,null,true,null),
('8bf3ef5f-d3b6-4efd-bb6d-43262c961e86'::uuid,'COBRANCA CONTABILIDADE','contains','despesa','91817a7c-cd96-4eb6-a97c-d81a7927cd01'::uuid,null,'61b423a4-6dfa-43d2-9c2b-5a9dfe4fd4b0'::uuid,null,100,true,null,null,null,null,true,null),
('1cbb30a4-73ed-4898-a224-f1acb1d19555'::uuid,'CONTA DE TELEFONE INTERNET','contains','despesa','917330e6-a7b3-47c0-99dd-d7a4de2c3a04'::uuid,null,'61b423a4-6dfa-43d2-9c2b-5a9dfe4fd4b0'::uuid,null,100,true,null,null,null,null,true,null),
('48e98f36-a6c8-4415-87b8-52c1edd1b6cd'::uuid,'ELO ANTECIPACAO STONE','contains','receita','56993ca5-cdc5-46e9-9345-3521101956f5'::uuid,null,'61f839a7-29b4-4483-bf11-7fe08884c492'::uuid,null,100,true,null,null,null,null,true,null),
('093d7357-2066-46aa-b97b-8e59503a5216'::uuid,'MASTER ANTECIPACAO STONE','contains','receita','56993ca5-cdc5-46e9-9345-3521101956f5'::uuid,null,'61f839a7-29b4-4483-bf11-7fe08884c492'::uuid,null,100,true,null,null,null,null,true,null),
('e6dbbb3e-fa4a-422e-bf1a-332359dc5e2b'::uuid,'PORTO SEGURO ODONTO','contains','despesa','9a14d16d-94a6-402f-a62b-ce495c1d4f22'::uuid,null,'61b423a4-6dfa-43d2-9c2b-5a9dfe4fd4b0'::uuid,null,100,true,null,null,null,null,true,null),
('6bfe2d21-a7c4-456f-ae8b-701136d3da75'::uuid,'RENTAB.INVEST','contains','receita','4503f259-1783-45ee-a5c3-d84b21280c68'::uuid,null,'61b423a4-6dfa-43d2-9c2b-5a9dfe4fd4b0'::uuid,null,100,true,null,null,null,null,true,null),
('0529c1bf-d0af-44d2-aec9-b61b78e17bfb'::uuid,'STONE ELO DEBITO','contains','ambos','56993ca5-cdc5-46e9-9345-3521101956f5'::uuid,null,'61f839a7-29b4-4483-bf11-7fe08884c492'::uuid,null,100,true,null,null,null,null,true,null),
('ecfe1616-46b8-4ab6-b98f-d6939e7e34ac'::uuid,'STONE MASTER DEBITO','contains','ambos','56993ca5-cdc5-46e9-9345-3521101956f5'::uuid,null,'61f839a7-29b4-4483-bf11-7fe08884c492'::uuid,null,100,true,null,null,null,null,true,null),
('1744d1e0-db44-4eba-9a18-ee47b1f54b81'::uuid,'STONE VISA DEBITO','contains','ambos','56993ca5-cdc5-46e9-9345-3521101956f5'::uuid,null,'61f839a7-29b4-4483-bf11-7fe08884c492'::uuid,null,100,true,null,null,null,null,true,null),
('5682f15c-7aa9-4cbc-9469-968a53309b92'::uuid,'TARIFA','contains','despesa','bbdbba72-08ca-46b8-9b2d-efc65be3b809'::uuid,null,'61b423a4-6dfa-43d2-9c2b-5a9dfe4fd4b0'::uuid,null,100,true,null,null,null,null,true,null),
('19e9361a-28a1-4a57-9c7f-b125e2cffdad'::uuid,'TAXA SINDICATO','contains','despesa','4dea9a84-b087-4a8e-84df-2bcc73c12b78'::uuid,null,'61b423a4-6dfa-43d2-9c2b-5a9dfe4fd4b0'::uuid,null,100,true,null,null,null,null,true,null),
('8c82b30b-ebc3-4bf6-9cc1-205ef181b165'::uuid,'VISA ANTECIPACAO STONE INSTITUICAO DE PAGAMENTO','contains','receita','56993ca5-cdc5-46e9-9345-3521101956f5'::uuid,null,'61f839a7-29b4-4483-bf11-7fe08884c492'::uuid,null,100,true,null,null,null,null,true,null),
('272f8935-8065-4351-9612-f88fc5ec492c'::uuid,'DES: ANA CAROLINE DE FREIT','contains','despesa','1ba1adc4-6ade-4237-9eff-c268c3d0d062'::uuid,null,'61f839a7-29b4-4483-bf11-7fe08884c492'::uuid,null,90,true,null,null,null,null,true,null),
('bfda9098-2a67-49b6-9df8-d5614edd5951'::uuid,'DES: Ana Julia Rodrigues D','contains','despesa','1ba1adc4-6ade-4237-9eff-c268c3d0d062'::uuid,null,'d346159e-adb6-4461-bfb2-d03b123301b8'::uuid,null,90,true,null,null,null,null,true,null),
('50401760-2a9e-4d0f-8e54-1287117c89bc'::uuid,'DES: BARBARA RIBEIRO BARRO','contains','despesa','1ba1adc4-6ade-4237-9eff-c268c3d0d062'::uuid,null,'61f839a7-29b4-4483-bf11-7fe08884c492'::uuid,null,90,true,null,null,null,null,true,null),
('58b15eac-bf9c-48f1-b817-170970718332'::uuid,'DES: CRISTIANE CARLA DONEG','contains','despesa','fd8e58e3-9311-4ae4-ace7-404dd884c144'::uuid,null,'61f839a7-29b4-4483-bf11-7fe08884c492'::uuid,null,90,true,null,null,null,null,true,null),
('8df57274-16c0-42db-aeb1-124693488929'::uuid,'DES: DIENE GARCIA DOS SANT','contains','despesa','1ba1adc4-6ade-4237-9eff-c268c3d0d062'::uuid,null,'61f839a7-29b4-4483-bf11-7fe08884c492'::uuid,null,90,true,null,null,null,null,true,null),
('80976bc1-2585-4428-b4ee-14cc16b7fd36'::uuid,'DES: Ester Andrade Amarant','contains','despesa','1ba1adc4-6ade-4237-9eff-c268c3d0d062'::uuid,null,'61f839a7-29b4-4483-bf11-7fe08884c492'::uuid,null,90,true,null,null,null,null,true,null),
('3addd42f-3289-4738-9823-b86fdf705742'::uuid,'DES: FABRICIO BORHER','contains','despesa','a6716f32-f839-48b2-97c6-126442f82497'::uuid,null,'61f839a7-29b4-4483-bf11-7fe08884c492'::uuid,null,90,true,null,null,null,null,true,null),
('06e26129-e6a8-47f3-9104-cdfb07440524'::uuid,'DES: FERNANDO BENTO DA SIL','contains','despesa','fd8e58e3-9311-4ae4-ace7-404dd884c144'::uuid,null,'d346159e-adb6-4461-bfb2-d03b123301b8'::uuid,null,90,true,null,null,null,null,true,null),
('30c2a348-cbaa-4429-acf7-9ca0d0459b15'::uuid,'DES: FRANCIELE VITORIA DE','contains','despesa','1ba1adc4-6ade-4237-9eff-c268c3d0d062'::uuid,null,'61f839a7-29b4-4483-bf11-7fe08884c492'::uuid,null,90,true,null,null,null,null,true,null),
('ca20250e-9114-4763-b905-326be8f00a5f'::uuid,'DES: João Victor Camilo','contains','despesa','a6716f32-f839-48b2-97c6-126442f82497'::uuid,null,'61f839a7-29b4-4483-bf11-7fe08884c492'::uuid,null,90,true,null,null,null,null,true,null),
('1cb3d361-a4f8-4f49-99ea-0de84ba20a3e'::uuid,'DES: KAIC DA SILVA SEVERIA','contains','despesa','a6716f32-f839-48b2-97c6-126442f82497'::uuid,null,'61f839a7-29b4-4483-bf11-7fe08884c492'::uuid,null,90,true,null,null,null,null,true,null),
('50233803-9227-475b-82e0-161bcc203aa8'::uuid,'DES: KAIQUE MORESCA MARTIN','contains','despesa','1ba1adc4-6ade-4237-9eff-c268c3d0d062'::uuid,null,'61f839a7-29b4-4483-bf11-7fe08884c492'::uuid,null,90,true,null,null,null,null,true,null),
('cb329aa0-6564-49b2-87c9-40552beac783'::uuid,'DES: KEVIN DIEGO DO VALE E','contains','despesa','a6716f32-f839-48b2-97c6-126442f82497'::uuid,null,'61f839a7-29b4-4483-bf11-7fe08884c492'::uuid,null,90,true,null,null,null,null,true,null),
('ea6e2541-44a2-448d-9824-20fffd3f6be0'::uuid,'DES: LAVORE MEDICINA DO TR','contains','despesa','463e2201-ac58-4d40-93a0-e1d952ecc68a'::uuid,null,'61f839a7-29b4-4483-bf11-7fe08884c492'::uuid,null,90,true,null,null,null,null,true,null),
('72454a25-2042-4672-8673-db663f80e116'::uuid,'DES: LUCIA VILLA ARAUJO','contains','despesa','1ba1adc4-6ade-4237-9eff-c268c3d0d062'::uuid,null,'5a4ef23b-9bf4-4283-8641-ac7195839f87'::uuid,null,90,true,null,null,null,null,true,null),
('cf26c161-bc1e-44ef-a064-a540f3ad060c'::uuid,'DES: LUIZ HENRIQUE TORRES','contains','despesa','a6716f32-f839-48b2-97c6-126442f82497'::uuid,null,'61f839a7-29b4-4483-bf11-7fe08884c492'::uuid,null,90,true,null,null,null,null,true,null),
('32ba1c95-cbe9-478a-b088-4be3a58c55bd'::uuid,'DES: Marcio Alves Santos','contains','despesa','a6716f32-f839-48b2-97c6-126442f82497'::uuid,null,'61f839a7-29b4-4483-bf11-7fe08884c492'::uuid,null,90,true,null,null,null,null,true,null),
('240b6057-1963-4f24-9556-6d2932e5faff'::uuid,'DES: PAULO ROBERTO DOS REI','contains','despesa','a6716f32-f839-48b2-97c6-126442f82497'::uuid,null,'61f839a7-29b4-4483-bf11-7fe08884c492'::uuid,null,90,true,null,null,null,null,true,null),
('d46dbc2e-40f6-4f03-aaae-1f51a3f33fa3'::uuid,'DES: RICHARD MATHYAS ALVES','contains','despesa','a6716f32-f839-48b2-97c6-126442f82497'::uuid,null,'61f839a7-29b4-4483-bf11-7fe08884c492'::uuid,null,90,true,null,null,null,null,true,null),
('4ad8ca59-ef1a-49bb-9efd-bc865b905dfb'::uuid,'DES: SAMUEL SCATENA SCANDI','contains','despesa','1ba1adc4-6ade-4237-9eff-c268c3d0d062'::uuid,null,'61f839a7-29b4-4483-bf11-7fe08884c492'::uuid,null,90,true,null,null,null,null,true,null),
('14549f8e-1a62-4cf8-abf4-f8ba44d3af22'::uuid,'DES: Silvana Borges Sabio','contains','despesa','03e9db51-4706-41fd-b297-641f584d82b1'::uuid,null,'61f839a7-29b4-4483-bf11-7fe08884c492'::uuid,null,90,true,null,null,null,null,true,null),
('ea76097e-30ae-4401-b707-8307f1aacf5b'::uuid,'DES: Tania Kubata de Souza','contains','despesa','56a08ffb-6d97-4e87-989f-8d0d5ae94585'::uuid,null,'61f839a7-29b4-4483-bf11-7fe08884c492'::uuid,null,90,true,null,null,null,null,true,null),
('653333fe-14e1-4383-9940-7ad6aa0bb50a'::uuid,'DES: TATIANA CRISTINA SEIX','contains','despesa','6e0f57f7-1aaf-4c3f-92a5-5dffe4988a58'::uuid,null,'61f839a7-29b4-4483-bf11-7fe08884c492'::uuid,null,90,true,null,null,null,null,true,null),
('6a7467c8-35ac-4c99-982e-1a9121b6dc7c'::uuid,'DES: WESLEY BIAZOTTO','contains','despesa','a6716f32-f839-48b2-97c6-126442f82497'::uuid,null,'61f839a7-29b4-4483-bf11-7fe08884c492'::uuid,null,90,true,null,null,null,null,true,null)
on conflict (id) do nothing;

COMMIT;

-- ---------------------------------------------------------------
-- Conferência (rodar depois): deve retornar 37 e nenhuma linha órfã
-- ---------------------------------------------------------------
-- select count(*) from public.ofx_import_rules;
-- select r.pattern from public.ofx_import_rules r
--   left join public.categories c on c.id = r.category_id
--   where r.category_id is not null and c.id is null;
-- select name, default_unit_id from public.accounts order by name;
