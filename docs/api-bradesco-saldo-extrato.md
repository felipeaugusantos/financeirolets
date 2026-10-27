# API de Saldo e Extrato do Bradesco (Manual v2.2.2)

## O que o manual define
- GET `/v1/fornecimento-saldos-contas/saldos` e GET `/v1/fornecimento-extratos-contas/extratos`
  (sandbox `openapisandbox.prebanco.com.br`, produção `openapi.bradesco.com.br`).
- Só conta corrente e poupança de correntista PJ. Contas ligadas à instituição "11-02" não são processadas.
- Saldo: `agencia` (4, sem dígito), `conta` (até 7, sem dígito), `tipoOperacao` (1 = só conta corrente; 2 = unificado com Invest Fácil).
- Extrato: `agencia`, `conta`, `dataInicio`/`dataFim` (ddmmaaaa), `tipo` (cc/cp), `tipoOperacao` opcional.
  Até 5.000 transações por consulta, até 10 anos de histórico, recomendado de 1 em 1 ano.
- Resposta do extrato: `extratoUltimosLancamentos` (D-1 e D0), `extratoLancamentosFuturos`, `extratoPorPeriodo` (D-2 para trás).
- `codigoRetorno`: 00 sucesso, 01 sucesso com mais dados, 04 sem autorização, 08 erro de negócio, 24 falha na infraestrutura.

## O que o manual NÃO define
- **Autenticação** (credenciais, certificado, token). Sem isso não há coleta automática. Precisamos da documentação do portal
  de desenvolvedores do Bradesco e das credenciais do sandbox.
- Identificador único do lançamento: `numeroDocumento` se repete (ex.: vários com 0000001).

## Como o sistema usa hoje
- Conciliação bancária > **Importar da API Bradesco**: cola o JSON do sandbox/Postman, mostra o que será gravado e importa.
- Só entram lançamentos fechados (D-1 e histórico). D0 e futuros ficam de fora (podem mudar até o fechamento).
- Identificador (`fitid`): `BRADAPI:<tipo><conta><dígito>:<aaaammdd>:<documento>:<código>:<centavos>:<ordem>`.
- Duplicidade: mesma linha da API não entra duas vezes; linha que já veio por OFX (mesmo dia e valor, uma a uma) também não, e
  o OFX importado depois não repete o que a API já trouxe.
- Conta: se a conta do sistema tem ACCTID do OFX e a resposta é de outra conta, a importação é bloqueada.
- Saldo: registrado por conta e dia em `bank_balance_snapshots` (SQL 15); o saldo final do extrato também.

## A validar no sandbox
1. Se o FITID do OFX do Bradesco coincide com algum campo da API (hoje a proteção é por data + valor).
2. Qual linha do saldo representa o "disponível" (usamos "+ CTA CORRENTE" e "= TOTAL DE RECURSOS", por nome).
3. Se linhas do D0 mantêm o mesmo `numeroDocumento` depois de fechadas (hoje não importamos D0).
4. Contas poupança (tipo `cp`): data e sinal dos lançamentos.
