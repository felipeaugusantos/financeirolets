# Subir a versão 1.1.0 de homologação para produção

Comparei o app de homologação com o de produção. As diferenças são só de código e
de estrutura de banco — nenhum lançamento, conta ou usuário de teste será copiado.

## O que vem junto (versão 1.1.0)

- **Conciliação Bancária (OFX)**: menu com Bancos, Conciliar e Regras; vínculo
  automático estrito, pareamento de linhas repetidas, desvincular, reprocessar
  arquivo, criação por linha / em lote / agrupada, rateio por unidade e frente,
  forma de pagamento sugerida, painéis de transferências internas, padrões
  recorrentes, regra rápida e saldo de fechamento, relatório do período.
- **Conciliação de Cartão** (`/conciliacao/cartao`): importa planilha, evita
  linhas repetidas e cria lançamentos.
- **Relatórios**: DRE Gerencial com margens e EBITDA, pró-labore depois do
  resultado, aviso de lançamentos fora do DRE separando itens patrimoniais.
- **Rateio**: bloqueio de rateio que não fecha, divisão entre parcelas, frente
  de negócio no rateio assistido, bloco "Rateio que não fecha" na Conferência.
- **Geral**: tela Novidades (`/novidades`) com PDF, changelog e versão 1.1.0,
  ordenação por data e valor nos pendentes.

São 20 arquivos novos e 21 alterados. Nada em `client.ts`, `.env` ou `config.toml`.

## Banco de dados

Uma migração única, aplicando só o que ainda não existe em produção:

1. Pró-labore reposicionado depois do resultado (5.1 / 5.1.01 / 5.1.02).
2. `dre_lines`: colunas `line_type`, `formula`, `view_scope` (padrão `gerencial`)
   e índice.
3. `categories`: coluna `dre_line_contabil_id` e índice.
4. Linhas contábeis, inclusive **C12 — Movimentações patrimoniais e financeiras**
   com C12.01 Entradas e C12.02 Saídas, e vínculo automático das categorias.
5. Índice único de identificação de conta no OFX (`ofx_bankid`, `ofx_acctid`).
6. Tabela `card_statement_entries` com permissões, regras de acesso e trigger de
   data de atualização.

Nenhum lançamento é criado, alterado ou apagado.

## Preciso de duas confirmações suas antes de mexer no banco

1. **Backup**: confirme que existe backup atual da base de produção.
2. **Plano de contas contábil**: o DRE Gerencial em homologação usa uma estrutura
   contábil (linhas C1, C6, C8, C12...) que **não existe em produção** — lá só há
   a estrutura gerencial. O seu passo 1 pede apenas a C12. Como seguir?
   - (a) Eu recrio em produção a estrutura contábil completa equivalente à de
     homologação (recomendado — sem ela o DRE Gerencial abre vazio); ou
   - (b) Crio só a C12 agora e o DRE Gerencial fica incompleto até você me
     enviar a lista das linhas contábeis usada em homologação.

## Conferência antes de publicar

- DRE e DRE Comparativo do último mês fechado comparados antes × depois
  (consolidado = soma das unidades + "Sem unidade"), diferença esperada R$ 0,00.
- Contagem de lançamentos igual antes e depois.
- Build e suíte de testes.
- Publicação e registro da versão 1.1.0 em `releases.ts`, `CHANGELOG.md` e
  `APP_VERSION`.
