/**
 * Notas de liberação (release notes).
 *
 * Regra padrão do projeto: a cada publicação, adicionar um novo bloco no TOPO
 * desta lista, agrupado pela DATA DE PUBLICAÇÃO. Cada item tem:
 *  - `title` + `detail`: linguagem de cliente (é o que aparece na tela Novidades);
 *  - `tech`: detalhe técnico (só sai no PDF, seção técnica, para a equipe).
 * Atualizar também `APP_VERSION` em `src/lib/appEnv.ts` e o `CHANGELOG.md`.
 */

export type ReleaseArea =
  | 'Conciliação Bancária'
  | 'Relatórios'
  | 'Lançamentos'
  | 'Acessos'
  | 'Geral';

export type ReleaseKind = 'novidade' | 'melhoria' | 'correcao';

export interface ReleaseItem {
  area: ReleaseArea;
  kind: ReleaseKind;
  /** Frase curta em linguagem de cliente. */
  title: string;
  /** O que muda no dia a dia de quem usa. */
  detail: string;
  /** Detalhe técnico — aparece apenas no PDF da equipe. */
  tech?: string;
}

export interface Release {
  version: string;
  /** Data de publicação no formato ISO (YYYY-MM-DD). */
  date: string;
  /** Resumo de uma linha da liberação. */
  summary: string;
  items: ReleaseItem[];
}

export const KIND_LABEL: Record<ReleaseKind, string> = {
  novidade: 'Novidade',
  melhoria: 'Melhoria',
  correcao: 'Correção',
};

export const releases: Release[] = [
  {
    version: '1.2.8',
    date: '2026-10-09',
    summary: 'Totais do DRE seguem a configuração das linhas.',
    items: [
      { area: 'Relatórios', kind: 'melhoria', title: 'Totais do DRE pela configuração das linhas', detail: 'Resultado Bruto, Superávit e Fluxo de Caixa Retido agora seguem a fórmula de cada linha, a mesma no DRE, no DRE Comparativo e no DRE Gerencial. Os valores não mudam: julho continua R$ 33.277,29.', tech: 'src/lib/dreTotals.ts (fórmula > filhos > regra antiga > valor×sinal); fórmulas 1+2, 3+4, 5+5.1+6+7 em dre_lines; suíte T1–T20.' },
      { area: 'Relatórios', kind: 'melhoria', title: 'Aviso de fórmula em círculo', detail: 'Se uma linha do DRE passar a somar a si mesma, o sistema avisa e zera a linha, em vez de travar.' },
    ],
  },
  {
    version: '1.2.7',
    date: '2026-10-09',
    summary: 'DRE respeita os rateios entre unidades em todos os meses.',
    items: [
      { area: 'Relatórios', kind: 'correcao', title: 'Rateio entre unidades respeitado no DRE', detail: 'Em meses com muitos lançamentos, o DRE, o DRE Comparativo e o DRE Gerencial mostravam o lançamento rateado inteiro na unidade principal. Agora cada unidade recebe a sua parte. O total consolidado não muda.', tech: 'fetchAllocationsFor em lotes de 150 + erro visível.' },
      { area: 'Lançamentos', kind: 'correcao', title: 'Filtro por unidade mais estável', detail: 'O filtro por unidade na lista de Lançamentos não falha mais quando a unidade tem muitos lançamentos rateados.', tech: 'id.in só com rateios de outra unidade principal no período; teto de 150.' },
    ],
  },
  {
    version: '1.2.6',
    date: '2026-10-08',
    summary: 'Lista de Lançamentos mostra o rateio por unidade.',
    items: [
      { area: 'Lançamentos', kind: 'correcao', title: 'Filtro por unidade mostra só a parte do rateio', detail: 'Ao filtrar por uma unidade, o lançamento rateado aparece com a parte dessa unidade (ex.: R$ 2.640,32 de um total de R$ 5.280,65), e os totais do topo somam só essa parte.', tech: 'useTransactions: allocIds por unidade + unitShare na lista e em sumAllPages.' },
      { area: 'Lançamentos', kind: 'melhoria', title: 'Divisão por unidade embaixo de cada rateio', detail: 'Todo lançamento rateado mostra embaixo a divisão, como "Café R$ 2.640,32 · Boulevard R$ 2.640,32", mesmo sem filtro.', tech: 'TransactionRow.split carregado de transaction_allocations em lotes de 150.' },
    ],
  },
  {
    version: '1.2.5',
    date: '2026-10-08',
    summary: 'Dashboard por competência, mais detalhes no DRE, estorno marcado, datas do cartão e rateio das regras corrigido.',
    items: [
      { area: 'Relatórios', kind: 'novidade', title: 'Dashboard por competência', detail: 'O Dashboard abre pelo mês de competência, igual ao DRE. Dá para trocar para "por caixa" quando quiser ver o que foi pago.', tech: 'dashboard_summary_comp + dash_*_comp; regime na URL (padrão competência).' },
      { area: 'Relatórios', kind: 'novidade', title: 'Ver os lançamentos de cada linha do DRE', detail: 'Cada linha com valor tem um ícone que abre os lançamentos que formam aquele número.', tech: 'lineItems em useDreReport.' },
      { area: 'Relatórios', kind: 'melhoria', title: 'Lançamentos fora do DRE e sem unidade aparecem listados', detail: 'Os avisos do DRE agora mostram quais lançamentos estão sem linha de DRE ou sem unidade, com link para abrir cada um.', tech: 'outOfDreItems / unallocItems.' },
      { area: 'Relatórios', kind: 'novidade', title: 'Nova linha "Venda Produtos para Lojas Próprias"', detail: 'Linha 1.1.10 criada no DRE. Ligue a categoria em Configurações → Categorias.' },
      { area: 'Lançamentos', kind: 'novidade', title: 'Marcador "É estorno"', detail: 'Um estorno (por exemplo, de salário) abate o valor da mesma linha no DRE e aparece identificado como estorno.', tech: 'transactions.is_reversal; txValue nega o valor.' },
      { area: 'Conciliação Bancária', kind: 'novidade', title: 'Cartão: data do lançamento e competência', detail: 'Na importação do cartão você informa a data do lançamento (pagamento da fatura) e o mês de competência em que o valor vale no DRE. A data da compra fica guardada.', tech: 'card_statement_entries.launch_date / competence_date; RPC create_transaction_from_card_entry.' },
      { area: 'Conciliação Bancária', kind: 'correcao', title: 'Rateio das regras respeitado ao criar lançamento', detail: 'Ao criar um lançamento a partir do extrato, o rateio entre unidades definido na regra é aplicado e mostrado na tela. Se escolher uma unidade, tudo vai para ela.', tech: 'confirmCreate mantém ruleAllocations quando unit_id vazio.' },
    ],
  },
  {
    version: '1.2.4',
    date: '2026-10-07',
    summary: 'Dashboard mais rápido e confiável, nova tela de pré-lançamento do cartão e salvamento seguro de lançamentos.',
    items: [
      { area: 'Relatórios', kind: 'melhoria', title: 'Dashboard mais rápido e confiável',
        detail: 'Os números do Dashboard agora vêm calculados de uma vez e batem com os relatórios. Se algo falhar, o sistema avisa em vez de mostrar zeros.',
        tech: 'Função dashboard_summary (SQL 11a–11g) substitui as consultas paginadas do hook useDashboard; erro PGRST202 orienta aplicar a migração 20261008120000.' },
      { area: 'Relatórios', kind: 'novidade', title: 'Dashboard com filtros na URL e detalhe dos cartões',
        detail: 'Período, unidade e frente ficam no endereço da página (dá para compartilhar o link). Clicar num cartão abre os lançamentos que o compõem.',
        tech: 'useSearchParams em Dashboard.tsx; drill-down para /lancamentos com filtro regime=caixa|dashboard.' },
      { area: 'Relatórios', kind: 'melhoria', title: 'Resultado, variação colorida e botão Atualizar',
        detail: 'Novo cartão Resultado com margem %, variações verdes/vermelhas, eixo do gráfico compacto e horário da última atualização com botão Atualizar.' },
      { area: 'Conciliação Bancária', kind: 'novidade', title: 'Nova tela de pré-lançamento do cartão',
        detail: 'Confira as linhas do cartão antes de lançar, com cabeçalho e rodapé fixos e a lista rolando no meio. Botão Lançar cria os lançamentos conciliados.',
        tech: 'Funções create_transaction_from_entries / create_transaction_from_card_entry (SQL 07/08).' },
      { area: 'Conciliação Bancária', kind: 'melhoria', title: 'Marcar e desmarcar todas ao lançar linhas do extrato',
        detail: 'Na janela Lançar linhas do extrato há caixa no cabeçalho e botões Marcar todas / Desmarcar todas (linhas com possível duplicidade ficam de fora).' },
      { area: 'Conciliação Bancária', kind: 'melhoria', title: 'Desvincular só exclui o que o extrato criou',
        detail: 'Ao desvincular e excluir, apenas lançamentos criados a partir do extrato são removidos; lançamentos que já existiam são preservados, e meses fechados são respeitados.',
        tech: 'Função unlink_statement_entries (SQL 10).' },
      { area: 'Lançamentos', kind: 'correcao', title: 'Salvar e excluir lançamentos sem deixar pela metade',
        detail: 'Criar, editar e excluir lançamentos (com rateio e parcelas) agora acontece tudo ou nada, evitando lançamentos incompletos.',
        tech: 'Funções create_transactions_with_allocations, update_transaction_with_allocations, delete_transaction_with_children (SQL 09).' },
    ],
  },
  {
    version: '1.2.3',
    date: '2026-10-07',
    summary: 'Ajustes na conciliação bancária: desvincular exclui o lançamento, busca por valor e revisão editável.',
    items: [
      { area: 'Conciliação Bancária', kind: 'melhoria', title: 'Desvincular exclui o lançamento',
        detail: 'Ao desvincular, o lançamento ligado é excluído (ou você escolhe só desvincular). Em mês fechado nada é apagado.' },
      { area: 'Conciliação Bancária', kind: 'melhoria', title: 'Filtros lembrados',
        detail: 'Conta, período, status, visão e busca voltam como estavam ao reabrir a tela.' },
      { area: 'Conciliação Bancária', kind: 'melhoria', title: 'Lançar automaticamente revisado',
        detail: 'Traz as linhas selecionadas, mostra possíveis duplicidades desmarcadas, colunas editáveis e texto completo.' },
      { area: 'Conciliação Bancária', kind: 'correcao', title: 'Total da seleção corrigido',
        detail: 'O total ao lado de Criar lançamento soma só as linhas do extrato marcadas e zera ao trocar de conta ou período.' },
      { area: 'Conciliação Bancária', kind: 'novidade', title: 'Percentual conciliado e busca por valor',
        detail: 'Barra de % conciliado e busca no extrato por descrição ou valor.' },
    ],
  },
  {
    version: '1.2.2',
    date: '2026-09-24',
    summary: 'Divisão padrão por categoria, 50 regras de conciliação e fluxo de caixa por unidade.',
    items: [
      { area: 'Conciliação Bancária', kind: 'novidade', title: 'Divisão padrão por categoria',
        detail: 'Em Regras de Conciliação, a aba "Divisão por categoria" define como uma despesa é dividida entre as unidades quando nenhuma unidade é escolhida.',
        tech: 'Tabela category_split_rules (categoria + conta opcional); aplicada em useOfxImport só sem unidade e sem rateio.' },
      { area: 'Conciliação Bancária', kind: 'novidade', title: 'Nova regra simples',
        detail: 'Botão para criar uma regra em poucos passos: texto, categoria e unidade ou divisão.' },
      { area: 'Conciliação Bancária', kind: 'melhoria', title: '50 regras de conciliação',
        detail: 'Entraram regras para Receita Federal, Hapvida, CPFL e água por conta, Stone, Pix, contabilidade, jurídico e outras.',
        tech: 'Upsert por id de 50 regras (37 atualizadas, 13 novas).' },
      { area: 'Conciliação Bancária', kind: 'melhoria', title: 'Lançar pelas regras restrito',
        detail: 'Só Administrador e Financeiro veem o botão. Tarifas iguais em dias próximos não são tratadas como repetidas.' },
      { area: 'Relatórios', kind: 'novidade', title: 'Fluxo de Caixa por Unidade',
        detail: 'Unidades lado a lado e evolução mês a mês, realizado e previsto, com rateios aplicados.' },
      { area: 'Lançamentos', kind: 'melhoria', title: 'Importação CSV com coluna Unidade',
        detail: 'Uma unidade vai direto; duas ou mais dividem o valor igualmente.' },
    ],
  },
  {
    version: '1.2.1',
    date: '2026-09-24',
    summary: 'Ajustes pedidos pelo cliente na conciliação bancária.',
    items: [
      { area: 'Conciliação Bancária', kind: 'melhoria', title: 'Data no fim do histórico é ignorada',
        detail: 'Históricos como "... 04/09" agora casam com o lançamento mesmo com a data colada pelo banco.',
        tech: 'stripDateSuffix em ofxMatch.ts no vínculo por descrição.' },
      { area: 'Conciliação Bancária', kind: 'melhoria', title: 'Sem sugestão de novas regras',
        detail: 'O quadro "Nomes repetidos sem regra" foi ocultado.',
        tech: 'SuggestedRulesPanel desativado em OfxImportSettings.' },
      { area: 'Conciliação Bancária', kind: 'melhoria', title: 'Lançar pelas regras com conferência',
        detail: 'Tarifas, antecipações, telefone, contabilidade e similares vêm marcados; o restante (ex.: Pix por nome) vem desmarcado para conferir.',
        tech: 'isSafeRule em AutoPostDialog.' },
    ],
  },
  {
    version: '1.2.0',
    date: '2026-09-20',
    summary:
      'Regras de conciliação avançadas com rateio e simulação, lançamento em lote pelas regras, conciliação de cartão e assistente com histórico.',
    items: [
      {
        area: 'Conciliação Bancária',
        kind: 'novidade',
        title: 'Regras mais espertas',
        detail:
          'Uma regra pode valer só para uma conta, ignorar textos específicos, valer apenas dentro de uma faixa de valor, usar a unidade da própria conta do extrato e já dividir o valor entre unidades ou frentes.',
        tech:
          'Colunas account_id, exclude_pattern, min_amount, max_amount, use_statement_unit e allocations em ofx_import_rules; accounts.default_unit_id.',
      },
      {
        area: 'Conciliação Bancária',
        kind: 'novidade',
        title: 'Simulação antes de conciliar',
        detail:
          'Uma aba mostra qual regra cairia em cada linha do extrato, com o rateio sugerido, antes de gravar qualquer coisa.',
        tech: 'RuleSimulationPanel.tsx sobre as linhas pendentes.',
      },
      {
        area: 'Conciliação Bancária',
        kind: 'novidade',
        title: 'Lançar pelas regras',
        detail:
          'Um botão junta as linhas já classificadas, abre uma conferência item a item e grava os lançamentos de uma vez, com trava contra duplicidade.',
        tech: 'AutoPostDialog.tsx; trava por descrição + valor + 5 dias na mesma conta.',
      },
      {
        area: 'Conciliação Bancária',
        kind: 'melhoria',
        title: 'Nomes repetidos sem regra',
        detail:
          'Um quadro aponta os nomes que se repetem nas pendências, com quantidade e total, e oferece criar a regra na hora.',
        tech: 'SuggestedRulesPanel.tsx.',
      },
      {
        area: 'Conciliação Bancária',
        kind: 'novidade',
        title: 'Conciliação de cartão',
        detail:
          'Importação da fatura em Excel ou CSV, sem repetir linhas já importadas, com escolha de unidade, frente, categoria e forma de pagamento.',
        tech: 'Rota /conciliacao/cartao; tabela card_statement_entries com row_hash único.',
      },
      {
        area: 'Geral',
        kind: 'melhoria',
        title: 'Assistente com histórico',
        detail:
          'O Kaikin guarda as conversas de cada usuário e responde com base nos dados reais do sistema.',
        tech: 'Tabela kaikin_messages com acesso restrito ao próprio usuário; hook useKaikinHistory.',
      },
      {
        area: 'Acessos',
        kind: 'melhoria',
        title: 'Conciliação só para Admin e Financeiro',
        detail:
          'Consultar continua liberado para todos, mas incluir, alterar e excluir dados de conciliação e regras passa a ser exclusivo dos perfis Admin e Financeiro.',
        tech: 'Políticas de escrita com has_role(admin|financeiro) em bank_statement_entries, card_statement_entries e ofx_import_rules.',
      },
    ],
  },
  {
    version: '1.1.0',
    date: '2026-08-31',
    summary:
      'Conciliação bancária muito mais automática, DRE gerencial com margens e um canal oficial de novidades.',
    items: [
      {
        area: 'Geral',
        kind: 'novidade',
        title: 'Tela de Novidades',
        detail:
          'Agora existe um espaço no sistema que mostra tudo o que mudou em cada liberação, em linguagem simples. Também é possível baixar o documento em PDF.',
        tech:
          'Rota /novidades, dados em src/data/releases.ts, PDF gerado por src/lib/releaseNotesPdf.ts (jsPDF, texto vetorial, inclui seção técnica).',
      },
      {
        area: 'Conciliação Bancária',
        kind: 'novidade',
        title: 'Vínculo automático quando data, descrição e valor batem',
        detail:
          'Ao importar o extrato, as linhas idênticas a um lançamento já existente são vinculadas sozinhas — sem conciliar por conta própria. Você só confere.',
        tech:
          'matchByDescription/pairDuplicates em src/lib/ofxMatch.ts exigem igualdade estrita de data, valor e descrição normalizada; pareamento 1:1 reserva um lançamento por linha duplicada.',
      },
      {
        area: 'Conciliação Bancária',
        kind: 'novidade',
        title: 'Aviso de similaridade',
        detail:
          'Quando só parte das informações coincide (por exemplo, valor e descrição, mas data diferente), a linha ganha um ícone de similaridade e fica aguardando sua decisão.',
        tech: 'Badge "similar" derivada do resultado de match sem igualdade total; nunca entra em pickAutoLinkable.',
      },
      {
        area: 'Conciliação Bancária',
        kind: 'novidade',
        title: 'Criação de lançamentos em lote e agrupada',
        detail:
          'Selecione várias linhas do extrato e crie tudo de uma vez com conta, unidade, frente, categoria e parceiro em comum — ou junte as linhas em um único lançamento com o valor total.',
        tech: 'src/components/ofx/BulkCreateDialog.tsx + createGrouped em src/hooks/useOfxImport.ts (soma valores, usa a data mais recente e vincula todas as linhas).',
      },
      {
        area: 'Conciliação Bancária',
        kind: 'novidade',
        title: 'Visão em painéis (clássica)',
        detail:
          'Extrato de um lado, lançamentos pendentes do outro, com ordenação por data e valor e painel de detalhes embaixo.',
        tech: 'src/components/ofx/ClassicReconciliation.tsx, alternância Lista/Painéis em OfxImportSettings.tsx.',
      },
      {
        area: 'Conciliação Bancária',
        kind: 'novidade',
        title: 'Regras de Conciliação como menu próprio',
        detail:
          'As regras por texto do extrato saíram da tela de conciliação e ganharam menu próprio, com cadastro, edição, exclusão e uma aba de simulação para testar antes de aplicar.',
        tech: 'src/pages/ReconciliationRules.tsx (rota /conciliacao/regras) e src/components/ofx/RuleSimulationPanel.tsx (dry-run sobre arquivo OFX).',
      },
      {
        area: 'Conciliação Bancária',
        kind: 'melhoria',
        title: 'Reprocessar arquivo e revalidar importados',
        detail:
          'Dá para reaplicar as regras novas em um arquivo já importado, sem recomeçar, e revalidar os registros antigos com as regras atuais. Suas decisões manuais são preservadas.',
        tech: 'Funções de reprocessamento/revalidação em useOfxImport.ts; decisões com decided_by/decided_at não são sobrescritas.',
      },
      {
        area: 'Conciliação Bancária',
        kind: 'melhoria',
        title: 'Desfazer conciliação',
        detail:
          'É possível excluir o vínculo de uma linha ou de várias de uma vez, voltando o registro para pendente sem apagar o lançamento.',
        tech: 'unlinkMany em useOfxImport.ts: status volta a "pendente" e transaction_id é limpo.',
      },
      {
        area: 'Conciliação Bancária',
        kind: 'melhoria',
        title: 'Alerta de lançamento já existente e conferência de duplicados',
        detail:
          'Linhas que já têm lançamento equivalente aparecem sinalizadas e ficam fora da criação em lote. Um painel mostra como o sistema distribuiu linhas idênticas entre os lançamentos.',
        tech: 'Janela de ±35 dias com texto normalizado; src/components/ofx/DuplicatePairingPanel.tsx e suíte src/test/ofxPairing.test.ts (15 cenários).',
      },
      {
        area: 'Relatórios',
        kind: 'novidade',
        title: 'DRE Gerencial com margens e EBITDA',
        detail:
          'Nova visão com cartões de margem (bruta, operacional, líquida) e EBITDA, além da tabela hierárquica — sem mexer no DRE que você já usa.',
        tech: 'src/hooks/useDreGerencial.ts (motor de fórmulas por linha) + src/components/reports/DreGerencial.tsx; camada paralela usando dre_lines.formula/view_scope.',
      },
      {
        area: 'Relatórios',
        kind: 'melhoria',
        title: 'Pró-labore depois do resultado líquido',
        detail:
          'A linha de Honorários da Diretoria passou a aparecer após o resultado líquido, sem afetar o resultado operacional.',
        tech: 'Grupo 5.1 excluído dos subtotais operacionais em useDreReport.ts e mantido no caixa retido.',
      },
      {
        area: 'Acessos',
        kind: 'melhoria',
        title: 'Usuários de homologação',
        detail: 'Criados acessos de teste para validação do sistema em ambiente separado da produção.',
        tech: 'Edge function create-test-user + inserção manual em profiles/user_roles (perfil admin).',
      },
    ],
  },
  {
    version: '1.0.1',
    date: '2026-08-27',
    summary: 'Totais de lançamentos corrigidos e primeiro relatório do período na conciliação.',
    items: [
      {
        area: 'Lançamentos',
        kind: 'correcao',
        title: 'Totais consideram todos os lançamentos do filtro',
        detail:
          'Receitas, despesas e saldo passam a somar todos os lançamentos do período filtrado, e não apenas os primeiros exibidos. Cancelados ficam fora dos totais.',
        tech: 'Agregação no banco em vez de soma no cliente (limite de 1.000 linhas); ordenação com desempate por id.',
      },
      {
        area: 'Lançamentos',
        kind: 'melhoria',
        title: 'Aviso de recorte da lista',
        detail: 'A tela avisa quando você está vendo apenas parte dos lançamentos do período.',
      },
      {
        area: 'Conciliação Bancária',
        kind: 'novidade',
        title: 'Relatório do período',
        detail:
          'Resumo de importadas, vinculadas, criadas, ignoradas e taxa de cobertura, com exportação das pendências em CSV e PDF.',
        tech: 'src/components/ofx/OfxPeriodReport.tsx.',
      },
      {
        area: 'Geral',
        kind: 'melhoria',
        title: 'Identificação do ambiente de homologação',
        detail: 'Faixa no topo indicando quando você está no ambiente de testes.',
        tech: 'detectEnv/IS_HOMOLOG em src/lib/appEnv.ts.',
      },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-08-01',
    summary: 'Versão base do Let\u2019s Finance.',
    items: [
      {
        area: 'Geral',
        kind: 'novidade',
        title: 'Sistema em operação',
        detail:
          'Dashboard, Lançamentos, Contas a Pagar/Receber, DRE, Fluxo de Caixa, Reconciliação, Conferência de lançamentos, Conciliação Bancária (OFX) e assistente Kaikin.',
      },
    ],
  },
];

export const latestRelease = releases[0];

export function formatReleaseDate(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
