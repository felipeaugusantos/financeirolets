# Let's Flow Finance

Você é um Product Builder sênior. Crie um ERP simples (controle financeiro) para o grupo Let’s Cookies, com foco em praticidade (menos “firulas” que Bling/Conta Azul/Omie), baseado no fluxo de um app financeiro simples (tipo “food-fin-flow”), porém adaptado para multiunidades, anexos de comprovantes, DRE e comissões.

NOME DO PRODUTO

“Let’s Finance” (Controle Financeiro Let’s Cookies)

OBJETIVO

Sistema financeiro unificado (base única em tempo real) para registrar receitas/despesas, contas a pagar/receber, pagamentos, anexar comprovantes (print/upload), e gerar DRE por unidade e consolidado do grupo.

PLATAFORMAS

- Web responsivo

- Mobile: PWA instalável (foco iPhone), com UX de “app” e suporte a upload de fotos/arquivos.

- Autenticação e permissões por função.

UNIDADES (Centros)

- Let’s Café

- Let’s Boulevard

- Fábrica

- Distribuição

FRENTES DE NEGÓCIO (Centro de Resultado)

- Loja/Cafeteria

- Produção (Fábrica)

- Vendas/Distribuição

(permitir criar novas frentes futuramente)

PRINCIPAIS FUNCIONALIDADES

1) Lançamentos Financeiros (Caixa e Competência)

- Criar receita ou despesa

- Campos:

  - Tipo: Receita / Despesa

  - Data de competência

  - Data de pagamento/recebimento (opcional)

  - Unidade (obrigatório)

  - Frente de negócio (obrigatório)

  - Categoria (obrigatório)

  - Subcategoria (opcional)

  - Conta (Caixa/Banco/Cartão) (obrigatório)

  - Descrição / Observações

  - Fornecedor/Cliente (cadastro de “Parceiros” genérico)

  - Forma de pagamento: PIX / Cartão / Boleto / Transferência / Dinheiro / Outros

  - Status: Previsto, Aprovado, Pago/Recebido, Cancelado, Em atraso

  - Valor bruto

  - Taxas (opcional)

  - Valor líquido (calculado)

  - Parcelas (opcional): nº de parcelas, recorrência, rateio automático

  - Rateio (opcional): dividir por unidades e/ou frentes (percentual ou valor)

  - Anexos de comprovante: upload de imagem/PDF e captura via câmera (no mobile)

- Permitir anexar múltiplos comprovantes por lançamento.

2) Contas a Pagar e a Receber

- Tela dedicada com filtros por:

  - período, unidade, frente, categoria, status, parceiro, forma de pagamento

- Ações rápidas:

  - “Marcar como pago/recebido”

  - “Anexar comprovante”

  - “Duplicar lançamento”

  - “Agendar” (criar previsto)

- Alertas: vencendo hoje, vencendo em 7 dias, em atraso.

3) Pagamentos (prático no iPhone)

- Ao abrir um lançamento “a pagar”, permitir:

  - copiar chave PIX / colar código / exibir QR (se houver campo)

  - botão “Abrir banco” (deep link genérico) + instruções

  - depois: “Confirmar pagamento” e anexar comprovante (print/upload)

Obs: se não houver integração bancária direta, manter fluxo “assistido”: registrar pagamento + anexar comprovante, com auditoria.

4) Dashboard

- Cards:

  - Saldo por conta (Caixa/Banco/Cartão)

  - Receitas do mês / Despesas do mês

  - Resultado parcial (Receitas - Despesas)

  - Contas a pagar (próximos 7 dias) e em atraso

- Gráficos:

  - Fluxo de caixa por semana/mês

  - Despesas por categoria

  - Resultado por unidade e por frente

- Filtros globais: período, unidade (ou “todas”), frente.

5) Relatórios

5.1) DRE (por unidade e consolidado)

- Gerar DRE por:

  - Unidade (Let’s Café, Boulevard, Fábrica, Distribuição)

  - Frente de negócio

  - Consolidado do grupo (todas as unidades)

- Período selecionável (mês, trimestre, intervalo custom)

- Regime: Caixa ou Competência (toggle)

- Estrutura DRE (editável pelo admin):

  - Receita Bruta

  - (-) Deduções/Impostos/Taxas

  - Receita Líquida

  - (-) CMV / Custo de Produção

  - Lucro Bruto

  - (-) Despesas Operacionais

     - Pessoal

     - Aluguel/Condomínio

     - Marketing

     - Logística/Entrega

     - Energia/Água/Gás

     - Manutenção

     - Sistemas/Assinaturas

     - Outras

  - EBITDA

  - (-) Depreciação/Amortização (opcional)

  - (+/-) Resultado Financeiro (juros, tarifas)

  - Lucro/Prejuízo do Período

- Mapear Categorias/Subcategorias -> Linha do DRE (tabela de mapeamento).

- Exportar: PDF e CSV.

5.2) Fluxo de Caixa

- Entradas, saídas, saldo acumulado por período

- Por unidade e consolidado

- Exportar CSV

6) Parceiros, Fornecedores, Clientes

- Cadastro único “Parceiros” com tipo:

  - Fornecedor, Cliente, Parceiro, Vendedor (pode ser múltiplo)

- Campos:

  - Nome/Razão, Documento, Contato, Chave PIX/Conta bancária, Observações

- Relacionar lançamentos a parceiros

7) Vendedores e Comissões

- Cadastro de vendedores (internos/externos) e regras de comissão:

  - Regra por unidade e/ou frente

  - Percentual sobre Receita Líquida (receita - taxas - devoluções) OU sobre Receita Bruta

  - Validade por período (data início/fim)

  - Exceções por categoria (ex.: sem comissão em “taxas”)

- Tela “Comissões”:

  - Apuração por período

  - Por vendedor e por unidade

  - Status: Apurada, Aprovada, Paga

  - Gerar lançamento automático de “Despesa de Comissão” ao marcar como “Paga”

- Permitir associar uma venda/receita a um vendedor (campo no lançamento de receita)

8) Usuários e Permissões (RBAC)

- Perfis:

  - Admin (tudo)

  - Financeiro (tudo financeiro, sem alterar estrutura do DRE)

  - Gerente de Unidade (vê e edita apenas sua unidade)

  - Operador (lança e anexa comprovantes, não apaga)

  - Vendedor (vê suas comissões e receitas vinculadas, sem ver despesas gerais)

- Auditoria:

  - log de criação/edição/pagamento/cancelamento (quem, quando, o que mudou)

9) Importação e Exportação

- Importar lançamentos via CSV (modelo baixável)

- Exportar lançamentos filtrados (CSV)

- Backup simples (export geral)

REQUISITOS NÃO-FUNCIONAIS

- Tempo real: atualizações refletidas imediatamente (principalmente status pago/recebido e anexos)

- Mobile-first: telas com botões grandes e fluxo rápido para “pagar + anexar comprovante”

- Performance: paginação, filtros eficientes

- Segurança: armazenamento seguro de anexos, regras por unidade (row-level)

MODELO DE DADOS (tabelas/coleções)

1) units

- id, name (Let’s Café etc), active

2) business_fronts

- id, name, active

3) accounts

- id, name (Banco X, Caixa, Cartão Y), type (bank/cash/card), unit_id (opcional se conta for por unidade), active

4) categories

- id, name, type (income/expense), parent_id (subcategoria), dre_line_id (opcional), active

5) dre_lines

- id, name, order, group (Receita, CMV, Despesas Operacionais etc), sign (+/-)

6) partners

- id, name, doc, email, phone, pix_key, bank_info, tags, notes, types (array: supplier/client/vendor/partner)

7) vendors

- id, partner_id (FK), active

8) commission_rules

- id, vendor_id, unit_id (nullable), business_front_id (nullable), percentage, base (gross/net), include_categories (nullable), exclude_categories (nullable), start_date, end_date, active

9) transactions

- id

- type (income/expense)

- competence_date

- due_date (opcional)

- paid_date (opcional)

- unit_id

- business_front_id

- category_id

- account_id

- partner_id (opcional)

- vendor_id (opcional, para receitas)

- description

- payment_method

- status (planned/approved/paid/canceled/overdue)

- gross_amount

- fees_amount

- net_amount (calc)

- is_recurring, recurrence_rule (opcional)

- installments_total, installment_number, installment_group_id (opcional)

- created_by, updated_by, created_at, updated_at

10) transaction_allocations (rateios)

- id, transaction_id, unit_id, business_front_id, percentage, amount

11) attachments

- id, transaction_id, file_url, file_type, uploaded_by, uploaded_at

12) commission_statements

- id, vendor_id, period_start, period_end, unit_id (nullable), total_base, total_commission, status (calculated/approved/paid), created_at

13) audit_logs

- id, user_id, action, entity, entity_id, diff_json, created_at

TELAS (INFORMAÇÕES DE UI)

A) Login

- email/senha, recuperação

B) Layout principal

- Sidebar (web) e Bottom tabs (mobile):

  1. Dashboard

  2. Lançamentos

  3. Pagar/Receber

  4. Relatórios

  5. Configurações

C) Dashboard

- Cards + gráficos + filtros

D) Lançamentos

- Lista com busca + filtros avançados

- Botão “+ Novo” com modal rápido

- Detalhe do lançamento com:

  - status, histórico, anexos, ações rápidas

E) Pagar/Receber

- Tabs: A Pagar / A Receber

- Lista por vencimento

- Ações: marcar pago, anexar comprovante, editar

F) Relatórios

- DRE (unidade e consolidado) com export

- Fluxo de Caixa

- Comissões (para perfis autorizados)

G) Configurações

- Unidades (CRUD)

- Frentes (CRUD)

- Contas (CRUD)

- Categorias + mapeamento DRE

- Parceiros

- Vendedores e regras de comissão

- Usuários e permissões

- Importar/Exportar

DESIGN SYSTEM (Let’s Cookies) — AJUSTADO PELAS LOGOS ANEXAS

- Estilo: divertido, pop, “cookie shop + coffee”, alto contraste, UI limpa com detalhes marcantes.

- Diretriz: base clara (creme/off-white) + ações em pink + destaques em turquesa (assinatura da marca). Usar o “mel/laranja” para CTAs secundários e tags.

PALETA (tokens)

- Brand Pink (Primary): #E91E63  (botões principais, highlights, estados ativos)

- Brand Teal (Secondary): #00B8C8 (links, ícones, bordas, gráficos)

- Coffee Honey (Accent): #D89B2B  (chips, badges, CTA secundário, detalhes do “coffee”)

- Cream (Surface): #FFF4E6 (cards claros, áreas de conteúdo)

- Off-white (Background): #FFF9F2 (fundo principal)

- Cookie Brown (Text/Strong): #3B2A24 (títulos fortes, números importantes)

- Charcoal (Text Default): #2B2B2B (texto padrão)

- Light Gray (Borders): #E8E2DD (linhas, bordas suaves)

CORES DE ESTADO

- Success: #2E7D32

- Warning: #F9A825

- Danger: #D32F2F

- Info (usar Teal): #00B8C8

TIPOGRAFIA

- Headings: Poppins (ou Nunito, se disponível) — peso 600/700

- Body: Inter (ou Poppins) — peso 400/500

- Números (valores financeiros): usar tabular/monospace se houver opção; senão manter Inter com peso 600

COMPONENTES E UI

- Radius:

  - Botões/Inputs: 14–16

  - Cards: 18

  - Chips/Badges: 999 (pill)

- Shadows:

  - Card: sombra leve (0 6 18 rgba(0,0,0,0.06))

- Botões:

  - Primary (Pink): fundo #E91E63, texto branco, hover escurecer 8–10%

  - Secondary (Teal outline): borda #00B8C8, texto #00B8C8, fundo transparente/creme

  - Tertiary (Honey): fundo #D89B2B, texto branco (ou #3B2A24 se necessário por contraste)

- Inputs:

  - Fundo creme (#FFF4E6) com borda #E8E2DD

  - Focus ring turquesa (#00B8C8) com 20% opacity

- Navegação:

  - Mobile bottom tabs: ativo em Pink, ícone/label em Pink; inativo Charcoal 60%

  - Web sidebar: indicador ativo em Pink + detalhe Teal (linha/borda)

- Gráficos:

  - Série 1: Pink (#E91E63)

  - Série 2: Teal (#00B8C8)

  - Série 3: Honey (#D89B2B)

  - Neutro: Cookie Brown (#3B2A24) para textos/legendas

USO DAS LOGOS

- Login e Topbar: logo horizontal (fundo claro)

- App icon / favicon: logo circular (para PWA iPhone)

- Manter respiro (padding) e não aplicar efeitos na marca

ACESSIBILIDADE

- Garantir contraste AA:

  - Texto padrão em #2B2B2B sobre #FFF9F2

  - Em botões Pink/Teal/Honey usar texto branco quando necessário e ajustar hover para manter contraste

DADOS INICIAIS (seed)

- Criar unidades: Let’s Café, Let’s Boulevard, Fábrica, Distribuição

- Criar frentes: Loja/Cafeteria, Produção, Distribuição

- Criar categorias básicas:

  RECEITAS: Vendas balcão, Vendas delivery, B2B/Atacado, Eventos, Outros

  DEDUÇÕES/TAXAS: Taxas cartão, Taxas delivery, Estornos

  CMV/CUSTOS: Insumos, Embalagens, Frete compra

  DESPESAS: Pessoal, Aluguel, Marketing, Energia/Água/Gás, Manutenção, Logística, Sistemas, Impostos, Contabilidade, Outras

- Criar contas: Caixa, Banco Principal, Cartão

REGRAS IMPORTANTES

- Tudo deve funcionar por filtros de Unidade e Frente

- Consolidado deve somar tudo (com eliminatórias opcionais no futuro; por ora apenas soma)

- Regime Caixa/Competência deve afetar relatórios (usar paid_date para caixa e competence_date para competência)

- Em mobile, fluxo “Pagar + Anexar Comprovante” deve estar a 2 toques do topo

- Não permitir apagar lançamento pago sem permissão de Admin; preferir “cancelar/estornar”

- Anexos: aceitar JPG/PNG/PDF e limitar tamanho (ex.: 10MB) com compressão para imagens quando possível

CRITÉRIOS DE ACEITE (resumo)

- Criar/editar/pagar lançamentos com anexo

- Filtrar por unidade/frente/categoria/status

- Gerar DRE por unidade e consolidado, por período, caixa/competência

- Comissões calculadas por período e regra, com geração de despesa ao pagar

- Permissões por perfil funcionando

- Responsivo e usável no iPhone como PWA

ENTREGA

Gere o app completo com essas telas, modelo de dados, regras e design. Priorize UX simples, rápida, e pronta para operação diária.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://financeirolets.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/cec4c83a-1861-4789-83fe-3c01853f1221).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
