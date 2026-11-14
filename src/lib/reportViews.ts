export const reportViews = [
  { key: 'dre', title: 'DRE' },
  { key: 'dre-gerencial', title: 'DRE Gerencial' },
  { key: 'dre-comparativo', title: 'DRE Comparativo' },
  { key: 'cashflow', title: 'Fluxo de Caixa' },
  { key: 'cashflow-unidade', title: 'Fluxo de Caixa por Unidade' },
  { key: 'reconciliacao', title: 'Reconciliação' },
] as const;

export const reportUrl = (key: string) => `/relatorios?r=${key}`;
