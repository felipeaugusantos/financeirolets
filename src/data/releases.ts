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
