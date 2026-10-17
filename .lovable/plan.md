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

Uma empresa pode ter vários contatos e várias oportunidades. Exemplo: o mesmo cliente pode contratar um coffee break e depois uma encomenda de brindes, sem duplicar o cadastro.

## Plano tela a tela

### 1. Minha agenda
**Objetivo:** mostrar o que o vendedor precisa tratar hoje.
- Contatos agendados, propostas aguardando retorno e eventos próximos, com empresa, unidade, responsável e próxima ação.
- Filtros por período, unidade e responsável, respeitando o acesso do usuário.
- Ações: abrir negociação, registrar contato e concluir ou reagendar tarefa.
- Pendências atrasadas em destaque; estado vazio sem informações fictícias.
**Saída:** cada atendimento fica registrado e deixa uma próxima ação definida.

### 2. Buscar empresas
**Objetivo:** encontrar potenciais clientes corporativos, separadamente da busca nos leads já cadastrados.
- Escolher cidade/bairro ou unidade como referência, raio de busca e segmento: escritórios, clínicas, agências, escolas, hotéis e outros.
- Resultados em lista; mapa como visualização complementar quando a integração estiver habilitada.
- Cada resultado mostra nome, endereço, distância e telefone/site quando realmente disponíveis, além da fonte e data da consulta.
- Ações: abrir informações, selecionar empresas e enviar para revisão antes de salvar no CRM.
- Sinalizar empresas já cadastradas sem expor dados comerciais de outra unidade a usuários sem permissão.
- Mostrar busca em andamento, nenhum resultado, integração indisponível e limite de consulta atingido, com possibilidade de cadastro manual.
**Limites:** busca geográfica não garante CNPJ, e-mail, nome do decisor, porte ou faturamento. Esses campos ficam vazios ou aguardam validação; não serão inventados. Distância em raio não representa tempo de entrega.
**Saída:** empresas selecionadas, ainda sem contato automático nem efeito financeiro.

### 3. Revisar e adicionar leads
**Objetivo:** salvar somente empresas úteis, com responsável e origem conhecidos.
- Revisar nome, contato disponível, endereço, unidade comercial, responsável, segmento e origem.
- Marcar interesse inicial: coffee break, evento corporativo ou encomenda.
- Verificar duplicidade por CNPJ, identificador da fonte e, secundariamente, telefone/site e nome com endereço.
- Permitir vincular a uma empresa existente, descartar ou salvar; coincidências aproximadas exigem revisão, não mesclagem automática.
- Informar quantos registros foram adicionados, já existiam ou falharam; repetir a operação sem criar cópias.
- Cadastro manual e importação CSV com prévia, mapeamento e validação, sem importar lançamentos.
**Saída:** lead salvo e pronto para qualificação.

### 4. Leads e empresas
**Objetivo:** manter a carteira comercial organizada.
- Lista com empresa, segmento, unidade, responsável, situação, último contato e próxima ação.
- Busca por nome, CNPJ, telefone e e-mail; filtros por origem, interesse e situação.
- Situações do lead: novo, em contato, qualificado e descartado. A etapa da negociação pertence à oportunidade, não à empresa.
- Ações: novo lead, abrir ficha e criar oportunidade.
- Arquivar com motivo, mantendo histórico; não excluir clientes financeiros nem registros vinculados.
**Saída:** acesso rápido à carteira sem misturar leads e clientes financeiros.

### 5. Ficha da empresa
**Objetivo:** concentrar contexto, contatos e histórico.
- Abas: dados, contatos, oportunidades e histórico.
- Contatos com nome, cargo e canal; registrar se os dados foram confirmados e a origem.
- Histórico de ligação, reunião, degustação, mensagem registrada, proposta e tarefa.
- Notas sobre interesse, frequência de eventos e restrições alimentares relevantes ao pedido, evitando dados pessoais desnecessários.
- Ações: agendar retorno, criar oportunidade e abrir WhatsApp/e-mail com rascunho revisável.
- Abrir WhatsApp não significa mensagem enviada: confirmação e registro são manuais nesta fase.
- Registrar pedido de não contato e impedir novas abordagens pelo módulo.
**Saída:** relacionamento preservado mesmo quando muda o responsável.

### 6. Funil de oportunidades
**Objetivo:** acompanhar cada negociação em quadro ou lista.
- Etapas sugeridas: qualificação → briefing/degustação → proposta → negociação → ganha ou perdida.
- Cada oportunidade mostra empresa, tipo de venda, valor estimado, data do evento/entrega, unidade, responsável e próxima ação.
- Mudança de etapa por seletor e, no quadro, arraste; opções acessíveis sem arraste no celular.
- Registrar motivo de perda; alertar sobre eventos vencidos e propostas sem retorno.
- Valor em negociação, valor ganho e receita recebida são indicadores distintos.
**Saída:** visibilidade comercial sem tratar estimativa como receita contábil.

### 7. Oportunidade e briefing do coffee break
**Objetivo:** coletar o necessário para orçar e entregar.
- Empresa e contato, unidade comercial, unidade de produção/atendimento quando diferente, vendedor e tipo de pedido.
- Data e horário do evento, número de participantes, endereço, retirada/entrega, janela de montagem e necessidades de serviço.
- Itens desejados, quantidade, restrições alimentares, orçamento informado e observações.
- Para encomendas sem evento, usar data de entrega e quantidades, sem exigir participantes.
- Quantidade de participantes não substitui a quantidade dos itens; orçamento do cliente não vira preço automaticamente.
- Mostrar tarefas, propostas e histórico da negociação; permitir adicionar entidades inline conforme o padrão do sistema.
**Saída:** briefing consistente para a proposta, sem prometer disponibilidade de produção ou estoque.

### 8. Proposta comercial
**Objetivo:** preparar uma oferta clara e rastreável.
- Itens/pacotes, quantidade, preço unitário, desconto, entrega, serviço e total discriminado.
- Condições de pagamento, validade, data do evento, inclusões, exclusões e observações.
- Preços, sinal, pedido mínimo e política de cancelamento serão informados pela equipe; não serão presumidos.
- Salvar rascunho, gerar PDF legível, registrar envio e criar nova revisão preservando a anterior.
- Situações: rascunho, enviada, aceita, recusada e expirada. Aceite manual com registro de quem confirmou e evidência opcional; não equivale a assinatura digital.
- Envio automático de mensagens, portal público e assinatura digital ficam para evolução posterior.
**Saída:** proposta aceita com versão identificada; ainda sem lançamento financeiro.

### 9. Pedidos e eventos confirmados
**Objetivo:** transformar o aceite em acompanhamento de execução.
- Resumo da proposta aceita, itens, quantidades, responsáveis, datas e condições combinadas.
- Etapas de acompanhamento: confirmado, em preparação, entregue e cancelado, com histórico.
- Checklist de confirmação, produção, entrega/retirada e comprovante opcional.
- Alterações após aceite exigem nova revisão ou justificativa; cancelamento comercial não apaga nem cancela automaticamente lançamentos financeiros existentes.
- Esta tela não cria um sistema de estoque, roteirização ou capacidade de produção.
**Saída:** entrega acompanhada e solicitação financeira preparada.

### 10. Solicitações ao Financeiro
**Objetivo:** evitar redigitação sem gerar receitas indevidas.
- Vendedor solicita o lançamento a partir de um pedido aprovado; Financeiro/Admin revisa cliente, unidade, categoria, valor, vencimentos, competência e condições.
- Vincular a um parceiro existente ou confirmar sua criação antes do lançamento.
- Mostrar prévia das parcelas e vínculos; competência segue o reconhecimento definido, não automaticamente a data do aceite.
- Aprovação explícita por usuário autorizado antes de gravar. Nenhum lançamento histórico será reclassificado e meses fechados permanecem protegidos.
- Uma solicitação aprovada não pode gerar o mesmo lançamento novamente, inclusive em duplo clique ou repetição após falha.
- Reutilizar Contas a Receber e as regras de comissão existentes somente após validar seu gatilho de apuração; previsão comercial não paga comissão automaticamente.
**Saída:** lançamento rastreável e consultável na tela financeira existente, quando essa fase for autorizada.

### 11. Indicadores comerciais
**Objetivo:** comparar desempenho por unidade e responsável.
- Leads adicionados, contatos realizados, oportunidades abertas, propostas enviadas, conversão, ticket médio e tempo de fechamento.
- Separar valor estimado, propostas aceitas e valores efetivamente recebidos, com ligação aos registros de origem.
- Filtros com período de referência explícito: criação, fechamento ou data do evento, conforme o indicador.
- Conversão de oportunidades = ganhas ÷ (ganhas + perdidas); sem negócios encerrados, mostrar sem dados, não uma taxa inventada.
- Kaikin poderá sugerir abordagem e resumir informações autorizadas em fase posterior, sem disparar mensagens nem alterar negócios sozinho.
**Saída:** gestão comercial independente dos totais do DRE.

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
- Reaproveitar os padrões CRUD, navegação, identidade visual, autenticação e unidades existentes. Conservar `partners` como cadastro de cliente/fornecedor; dados de prospecção e negociações ficam separados e vinculados ao parceiro quando necessário.
- Modelo proposto: empresas/leads, contatos, oportunidades, atividades, propostas versionadas, itens, pedidos e solicitações financeiras; todos com unidade, responsável e rastreabilidade adequados.
- Para busca por localização, considerar Google Maps Platform/Places via Lovable Cloud. Depende de conexão e uso cobrado; não afirmar que a integração já está disponível no projeto. Consulta de CNPJ é um enriquecimento separado, condicionado a fonte autorizada e cobertura confirmada.
- Respeitar condições do provedor para atribuição, armazenamento e atualização de dados. Não persistir indiscriminadamente todos os resultados externos.
- Serviços externos autenticados, credenciais protegidas, consultas limitadas e resultados revisáveis. Sem chamadas pagas automáticas a cada abertura de tela.
- Não reutilizar a conciliação OFX para vendas nem alterar regras de rateio. Integração financeira deve chamar o fluxo existente, com proteção contra duplicidade e respeito aos fechamentos.

## Critérios de aprovação
- Testar acesso entre usuários/unidades, pesquisa sem vazamento e restrição de exportações.
- Testar duplicidade na adição de leads, múltiplas oportunidades por empresa e repetição de solicitações.
- Conferir cálculo de itens, desconto, total e parcelas com valores de teste concretos; preservar versões aceitas.
- Confirmar que lead, proposta e pedido sem aprovação financeira não mudam Dashboard, DRE ou fluxo de caixa.
- Conferir oposição ao contato, falhas de consulta, ausência de dados e PDF completo.
- Executar a jornada inteira com sessão autorizada, em ambiente de teste; publicar por fases sem modificar dados históricos.

**Resultado esperado:** encontrar empresas para coffee breaks, organizar a abordagem, fechar propostas e acompanhar entregas; só depois conectar as vendas aprovadas ao financeiro, com revisão e sem duplicidade.