export type ManualSection = { title: string; steps: string[]; link?: string };
export type ManualRole = { id: string; label: string; description: string; sections: ManualSection[] };

export const MANUAL: ManualRole[] = [
  {
    id: 'operador',
    label: 'Operador de loja',
    description: 'Rotina diária da loja: lançar despesas, receitas e anexar comprovantes.',
    sections: [
      { title: 'Entrar no sistema', steps: ['Acesse o endereço do Let\'s Finance e informe seu e-mail e senha.', 'Marque "Lembrar e-mail" no seu aparelho.', 'Esqueceu a senha? Use "Esqueci minha senha" na tela de login.'] },
      { title: 'Lançar uma despesa ou receita', steps: ['Abra Lançamentos e toque em "Novo".', 'Escolha o tipo, valor, data, categoria e unidade.', 'Se o fornecedor ou categoria não existir, use "+ Adicionar" no próprio campo.', 'Salve. O lançamento aparece na lista na hora.'], link: '/lancamentos' },
      { title: 'Anexar comprovante', steps: ['No lançamento, use o campo de anexos.', 'Aceita foto (JPG/PNG) ou PDF.', 'Confira se o anexo aparece antes de salvar.'] },
      { title: 'Lançamento pago errado', steps: ['Lançamentos pagos não podem ser excluídos.', 'Peça ao financeiro um estorno ou cancelamento.', 'Tudo fica registrado no histórico.'] },
      { title: 'Pedir ajuda', steps: ['Toque em "Abrir chamado" no menu lateral.', 'Descreva o problema e anexe até 3 imagens.', 'Acompanhe a resposta em Chamados.'], link: '/chamados' },
    ],
  },
  {
    id: 'financeiro',
    label: 'Financeiro',
    description: 'Contas, conciliação bancária e de cartão, DRE e fechamento do mês.',
    sections: [
      { title: 'Contas a pagar e a receber', steps: ['Use os cards de resumo para ver vencidos e próximos vencimentos.', 'Na baixa, confira PIX/banco e anexe o comprovante.', 'Pagamentos atualizam a previsão de caixa automaticamente.'] },
      { title: 'Importar extrato (OFX)', steps: ['Abra Conciliação e escolha a conta bancária.', 'Importe o arquivo OFX do banco.', 'Linhas com regra são classificadas sozinhas; repasses iFood são reconhecidos automaticamente.'], link: '/conciliacao' },
      { title: 'Conciliar', steps: ['Acompanhe a barra de progresso no topo.', 'Marque 1 linha do extrato e 1 lançamento pendente e clique em Vincular.', 'Sem lançamento? Use "Criar lançamento", com rateio se precisar.', 'Marque "Salvar como regra" para automatizar os próximos meses.', 'Transferências entre contas próprias: confirme no painel de transferências (ficam fora do DRE).'] },
      { title: 'Conciliação de cartão', steps: ['Importe a fatura e confira data do lançamento e competência.', 'A competência define o mês do DRE.'] },
      { title: 'DRE e fechamento', steps: ['O DRE abre com o último filtro usado.', 'Confira o card de batimento de saldo e os avisos de lançamentos sem unidade.', 'Clique numa linha para ver os lançamentos que a compõem.', 'Exporte em PDF para arquivo.'], link: '/relatorios' },
    ],
  },
  {
    id: 'gerente',
    label: 'Gerente',
    description: 'Acompanhamento da unidade, comercial (CRM) e Fábrica & Operações.',
    sections: [
      { title: 'Dashboard', steps: ['Veja receitas, despesas e resultado por unidade.', 'Use o filtro de competência (ou caixa).', 'Clique numa categoria do gráfico para ver os lançamentos.', 'Acompanhe a previsão de caixa de 7, 15 e 30 dias.'], link: '/' },
      { title: 'CRM', steps: ['Cadastre empresas (busca por CNPJ ou localização).', 'Registre oportunidades e gere a proposta em PDF.', 'Oportunidade ganha: use "Enviar à fábrica" para criar o pedido.'], link: '/crm' },
      { title: 'Fábrica & Operações', steps: ['Pedidos: acompanhe Pendente → Produzir → Enviado → Faturar.', 'Sugestão de produção calcula as fornadas pelas fichas técnicas.', 'Gere o "Romaneio do dia" em PDF para as entregas.', 'Registre fornadas produzidas, perdas e custo real.'], link: '/fabrica/pedidos' },
      { title: 'iFood', steps: ['Importe a planilha da loja configurada.', 'Confira os indicadores de rentabilidade.', 'Use "Lançar" no repasse semanal para levar ao financeiro.'] },
    ],
  },
];
