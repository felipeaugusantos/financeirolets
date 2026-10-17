# CRM — Vendas corporativas e coffee breaks

## Objetivo e limites
Criar um módulo comercial dentro do Let's Finance para encontrar empresas, organizar contatos, preparar propostas e acompanhar pedidos corporativos por unidade. O foco inicial é coffee breaks, eventos de empresas e encomendas corporativas; expansão de franquias fica fora desta etapa.

Este é um plano de construção, não uma implantação. Nenhum lançamento, classificação ou valor financeiro será alterado agora. O funil comercial terá seus próprios indicadores: oportunidades não entram no DRE nem no saldo das contas.

## Navegação e jornada
Adicionar o grupo **CRM** ao menu, mantendo o financeiro atual intacto. A entrada será **Minha agenda**, uma tela de trabalho, não uma página de apresentação.

````text
Buscar empresas → Revisar e salvar lead → Qualificar
→ Criar oportunidade → Preparar proposta → Registrar aceite
→ Acompanhar pedido → Solicitar lançamento ao Financeiro
````

Uma empresa pode ter vários contatos e oportunidades sem duplicar o cadastro.

## Plano tela a tela

### 1. Minha agenda
- Contatos agendados, propostas aguardando retorno e eventos próximos, com empresa, unidade, responsável e próxima ação.
- Filtros por período, unidade e responsável, respeitando o acesso do usuário.
- Ações: abrir negociação, registrar contato e concluir ou reagendar tarefa.
- Pendências atrasadas em destaque; estado vazio sem informações fictícias.

### 2. Buscar empresas
- Escolher cidade/bairro ou unidade como referência, raio de busca e segmento: escritórios, clínicas, agências, escolas, hotéis e outros.
- Resultados em lista; mapa como visualização complementar quando a integração estiver habilitada.
- Cada resultado mostra nome, endereço, distância e telefone/site quando realmente disponíveis, além da fonte e data da consulta.
- Ações: abrir informações, selecionar empresas e enviar para revisão antes de salvar no CRM.
**Limites:** busca geográfica não garante CNPJ, e-mail, nome do decisor, porte ou faturamento. Esses campos ficam vazios ou aguardam validação; não serão inventados. Distância em raio não representa tempo de entrega.

### 3. Revisar e adicionar leads
- Revisar nome, contato disponível, endereço, unidade comercial, responsável, segmento e origem.
- Marcar interesse inicial: coffee break, evento corporativo ou encomenda.
- Verificar duplicidade por CNPJ, identificador da fonte e, secundariamente, telefone/site e nome com endereço.
- Permitir vincular a uma empresa existente, descartar ou salvar; coincidências aproximadas exigem revisão, não mesclagem automática.

### 4. Leads e empresas
- Lista com empresa, segmento, unidade, responsável, situação, último contato e próxima ação.
- Busca por nome, CNPJ, telefone e e-mail; filtros por origem, interesse e situação.
- Situações do lead: novo, em contato, qualificado e descartado. A etapa da negociação pertence à oportunidade, não à empresa.
- Ações: novo lead, abrir ficha e criar oportunidade.

### 5. Ficha da empresa
- Abas: dados, contatos, oportunidades e histórico.
- Contatos com nome, cargo e canal; registrar se os dados foram confirmados e a origem.
- Histórico de ligação, reunião, degustação, mensagem registrada, proposta e tarefa.
- Notas sobre interesse, frequência de eventos e restrições alimentares relevantes ao pedido, evitando dados pessoais desnecessários.

### 6. Funil de oportunidades
- Etapas sugeridas: qualificação → briefing/degustação → proposta → negociação → ganha ou perdida.
- Cada oportunidade mostra empresa, tipo de venda, valor estimado, data do evento/entrega, unidade, responsável e próxima ação.
- Mudança de etapa por seletor e, no quadro, arraste; opções acessíveis sem arraste no celular.
- Registrar motivo de perda; alertar sobre eventos vencidos e propostas sem retorno.

### 7. Oportunidade e briefing do coffee break
- Empresa e contato, unidade comercial, unidade de produção/atendimento quando diferente, vendedor e tipo de pedido.
- Data e horário do evento, número de participantes, endereço, retirada/entrega, janela de montagem e necessidades de serviço.
- Itens desejados, quantidade, restrições alimentares, orçamento informado e observações.
- Para encomendas sem evento, usar data de entrega e quantidades, sem exigir participantes.

### 8. Proposta comercial
- Itens/pacotes, quantidade, preço unitário, desconto, entrega, serviço e total discriminado.
- Condições de pagamento, validade, data do evento, inclusões, exclusões e observações.
- Preços, sinal, pedido mínimo e política de cancelamento serão informados pela equipe; não serão presumidos.
- Salvar rascunho, gerar PDF legível, registrar envio e criar nova revisão preservando a anterior.

### 9. Pedidos e eventos confirmados
- Resumo da proposta aceita, itens, quantidades, responsáveis, datas e condições combinadas.
- Etapas de acompanhamento: confirmado, em preparação, entregue e cancelado, com histórico.
- Checklist de confirmação, produção, entrega/retirada e comprovante opcional.
- Alterações após aceite exigem nova revisão ou justificativa; cancelamento comercial não apaga nem cancela automaticamente lançamentos financeiros existentes.

### 10. Solicitações ao Financeiro
- Vendedor solicita o lançamento a partir de um pedido aprovado; Financeiro/Admin revisa cliente, unidade, categoria, valor, vencimentos, competência e condições.
- Vincular a um parceiro existente ou confirmar sua criação antes do lançamento.
- Mostrar prévia das parcelas e vínculos; competência segue o reconhecimento definido, não automaticamente a data do aceite.
- Aprovação explícita por usuário autorizado antes de gravar. Nenhum lançamento histórico será reclassificado e meses fechados permanecem protegidos.

### 11. Indicadores comerciais
- Leads adicionados, contatos realizados, oportunidades abertas, propostas enviadas, conversão, ticket médio e tempo de fechamento.
- Separar valor estimado, propostas aceitas e valores efetivamente recebidos, com ligação aos registros de origem.
- Filtros com período de referência explícito: criação, fechamento ou data do evento, conforme o indicador.
- Conversão de oportunidades = ganhas ÷ (ganhas + perdidas); sem negócios encerrados, mostrar sem dados, não uma taxa inventada.

### 12. Configurações do CRM
- Administrar segmentos, origens, motivos de perda, modelos de proposta e catálogo comercial de itens/pacotes.
- Associar usuários e unidades aproveitando os cadastros existentes.
- Controlar acesso às consultas externas e acompanhar uso/custos; consultas por demanda, não varredura automática ilimitada.
- Preservar histórico quando itens ou opções forem desativados.

## Acesso e proteção de dados
- Proposta: vendedor acessa sua carteira nas unidades autorizadas; gerente acompanha suas unidades; Admin acompanha o consolidado; Financeiro acessa solicitações e dados necessários à cobrança. Validar o alcance do perfil Operador antes de habilitá-lo no CRM.
- Aplicar restrições também na busca, exportação, histórico e serviços de consulta, não só nos botões.
- Dados públicos não dispensam cuidados com LGPD: finalidade comercial documentada, coleta mínima, origem, retenção e possibilidade de oposição ao contato; validar a base legal com o responsável pela privacidade.
- Não coletar dados privados, contornar acessos ou fazer disparos em massa nesta etapa.

## Entrega em fases
1. **Carteira e rotina comercial:** telas 1, 4–7; cadastro manual, contatos, tarefas, quadro e permissões. Homologar com dados de teste isolados.
2. **Busca ativa:** telas 2–3; conectar a fonte de empresas, revisar resultados, deduplicar e importar CSV. Esta fase é parte do escopo inicial, não apenas uma possibilidade futura.
3. **Proposta e execução:** telas 8–9 e configurações comerciais; preços reais fornecidos pela equipe, PDF e aceite registrado.
4. **Passagem ao financeiro e indicadores:** telas 10–11; somente após aprovação dos testes e autorização explícita para a integração financeira.
5. **Evoluções opcionais:** apoio do Kaikin, envio integrado e recorrência comercial. Fora da primeira entrega: franquias, disparos em massa, emissão fiscal e assinatura digital.

## Detalhes técnicos
- Reusar CRUD, navegação, identidade visual, autenticação e unidades. Incluir acesso no menu e na navegação móvel. Manter `partners` como identidade financeira; prospecção separada, vinculada quando necessário.
- Novas estruturas: empresas/leads, contatos, oportunidades, atividades, propostas versionadas, itens, pedidos e solicitações financeiras, com responsáveis e histórico.
- Busca geográfica proposta: Google Maps Platform/Places via Lovable Cloud, mediante conexão e cobrança por uso. CNPJ requer fonte autorizada separada. Nenhuma integração de busca foi confirmada no projeto.
- Validar termos de armazenamento/atribuição do provedor. Consultas autenticadas por demanda, credenciais protegidas e sem coleta ilimitada.
- O acesso atual a parceiros/financeiro não comprova isolamento do CRM por unidade: implementar e testar permissões comerciais próprias, sem liberar dados bancários aos vendedores.
- Confirmar rotinas financeiras atômicas antes da integração; não herdar gravações parciais. Não alterar conciliação OFX, regras de rateio ou meses fechados. Recebimentos parciais não foram confirmados e exigem desenho separado.

## Critérios de aprovação
- Testar acesso entre usuários/unidades, pesquisa sem vazamento e restrição de exportações.
- Testar duplicidade na adição de leads, múltiplas oportunidades por empresa e repetição de solicitações.
- Conferir cálculo de itens, desconto, total e parcelas com valores de teste concretos; preservar versões aceitas.
- Confirmar que lead, proposta e pedido sem aprovação financeira não mudam Dashboard, DRE ou fluxo de caixa.
- Conferir oposição ao contato, falhas de consulta, ausência de dados e PDF completo.
- Executar a jornada inteira com sessão autorizada, em ambiente de teste; publicar por fases sem modificar dados históricos.


