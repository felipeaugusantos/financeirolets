

# Let's Finance — Controle Financeiro Let's Cookies

Sistema financeiro unificado para gerenciar receitas, despesas, contas a pagar/receber, anexos de comprovantes e DRE por unidade e consolidado.

## Fase 1: Fundação (Design System, Auth, Layout)

### Design System Let's Cookies
- Paleta: Pink (#E91E63), Teal (#00B8C8), Honey (#D89B2B), Cream (#FFF4E6), Off-white (#FFF9F2), Cookie Brown (#3B2A24)
- Tipografia: Poppins para headings, Inter para body
- Componentes com border-radius arredondados (14-16px botões, 18px cards, pill badges)
- Logos da marca no login e topbar

### Autenticação
- Login com email/senha + Google (via Lovable Cloud)
- Recuperação de senha
- Tabela de perfis de usuário com vínculo a unidades
- Sistema RBAC com roles: Admin, Financeiro, Gerente de Unidade, Operador, Vendedor
- Tela de login estilizada com branding Let's Cookies

### Layout Principal
- **Web**: Sidebar com navegação (Dashboard, Lançamentos, Pagar/Receber, Relatórios, Configurações)
- **Mobile**: Bottom tabs com ícones, ativo em Pink
- Layout responsivo mobile-first
- Seletor de unidade global no header

## Fase 2: Banco de Dados e Configurações

### Estrutura de Dados (Lovable Cloud)
- Tabelas: units, business_fronts, accounts, categories, dre_lines, partners, transactions, transaction_allocations, attachments, audit_logs, user_roles
- RLS por unidade (Gerente só vê sua unidade)
- Triggers de auditoria automática

### Seed de Dados Iniciais
- Unidades: Let's Café, Let's Boulevard, Fábrica, Distribuição
- Frentes: Loja/Cafeteria, Produção, Distribuição
- Categorias de receita e despesa pré-definidas
- Contas: Caixa, Banco Principal, Cartão
- Linhas do DRE mapeadas às categorias

### Tela de Configurações
- CRUD de Unidades, Frentes, Contas, Categorias
- Mapeamento Categoria → Linha do DRE
- Cadastro de Parceiros (fornecedores/clientes) com chave PIX e dados bancários
- Gestão de Usuários e Permissões

## Fase 3: Lançamentos Financeiros

### Formulário de Lançamento
- Tipo (Receita/Despesa), datas de competência e pagamento
- Seleção de unidade, frente, categoria, subcategoria, conta
- Parceiro, forma de pagamento, status
- Valores: bruto, taxas, líquido (calculado automaticamente)
- Parcelas com rateio automático
- Rateio por unidades/frentes (% ou valor)
- Upload de múltiplos comprovantes (JPG/PNG/PDF, limite 10MB)
- Captura via câmera no mobile

### Lista de Lançamentos
- Busca e filtros avançados (período, unidade, frente, categoria, status, parceiro)
- Botão "+ Novo" com modal rápido
- Visualização de detalhe com histórico, anexos e ações rápidas

## Fase 4: Contas a Pagar e Receber

### Tela Pagar/Receber
- Tabs: A Pagar / A Receber
- Lista ordenada por vencimento com indicadores visuais (vencendo hoje, próximos 7 dias, em atraso)
- Ações rápidas: Marcar como pago/recebido, Anexar comprovante, Duplicar, Agendar

### Fluxo de Pagamento Mobile
- Ao abrir lançamento "a pagar": exibir chave PIX copiável, QR code se disponível
- Botão "Confirmar pagamento" + upload de comprovante em 2 toques
- Registro de auditoria automático

## Fase 5: Dashboard

### Cards Resumo
- Saldo por conta (Caixa/Banco/Cartão)
- Receitas e Despesas do mês
- Resultado parcial (Receitas - Despesas)
- Contas a pagar (próximos 7 dias) e em atraso

### Gráficos
- Fluxo de caixa por semana/mês (linha)
- Despesas por categoria (pizza/barras)
- Resultado por unidade e por frente (barras)
- Cores dos gráficos: Pink, Teal, Honey

### Filtros Globais
- Período, unidade (ou "todas"), frente

## Fase 6: Relatórios e DRE

### DRE
- Por unidade individual ou consolidado do grupo
- Período selecionável (mês, trimestre, intervalo custom)
- Toggle Regime Caixa / Competência
- Estrutura: Receita Bruta → Deduções → Receita Líquida → CMV → Lucro Bruto → Despesas Operacionais → EBITDA → Resultado Financeiro → Lucro/Prejuízo
- Exportação em PDF e CSV

### Fluxo de Caixa
- Entradas, saídas, saldo acumulado por período
- Por unidade e consolidado
- Exportação CSV

## Fase 7: PWA e Polimento

### PWA Instalável
- Manifest, service worker, ícones (logo circular Let's Cookies)
- Instalável no iPhone via "Adicionar à Tela Inicial"
- Suporte offline básico (cache de telas)

### Importação/Exportação
- Importar lançamentos via CSV (modelo baixável)
- Exportar lançamentos filtrados em CSV

---

**Nota**: Vendedores e Comissões ficam para uma fase futura após validar o core financeiro em operação.

