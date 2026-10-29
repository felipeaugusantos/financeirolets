# Troca do `xlsx` (SheetJS) 0.18.5 por uma versão corrigida

## Por que trocar
`xlsx@0.18.5` (a última do npm) tem dois avisos oficiais de severidade alta:

| Aviso | Problema | Corrigido em |
|---|---|---|
| CVE-2023-30533 (GHSA-4r6h-8v6p-xvw6, CVSS 7.8) | Poluição de protótipo ao ler arquivo preparado | 0.19.3 |
| CVE-2024-22363 (GHSA-5pgg-2g8v-p4x9, CVSS 7.5) | ReDoS | 0.20.2 |

As correções **não estão no npm** (o pacote parou em 0.18.5; confirmado com `npm view xlsx`). Só são distribuídas em
`cdn.sheetjs.com`. A meta é **0.20.2 ou superior**; use a mais recente listada no CDN (os metadados de um espelho de
terceiros indicam que a 0.20.3 existe, mas isso não foi conferido no CDN oficial).

Quem usa: só leitura de `.xlsx`, `.xls` e `.csv` enviados pelo usuário, em `CardReconciliation.tsx` e
`IfoodSheetImport.tsx` (`XLSX.read` + `sheet_to_json`). A escrita aparece só em testes.

## O que já está pronto
`src/test/xlsxContract.test.ts` descreve o contrato que a produção usa e roda igual antes e depois da troca:
- matriz idêntica em `.xlsx` e `.xls`, abas, células vazias e linhas curtas;
- datas (`cellDates`) nos fusos UTC, São Paulo, Nova York e Tóquio;
- CSV: acentos (UTF-8 com BOM e Windows-1252), ponto decimal, aspas, linhas vazias;
- sanidade contra poluição de protótipo (não reproduz o exploit do CVE);
- um "portão de versão": `it.fails` que exige versão >= 0.20.2.

Os defeitos já conhecidos do 0.18.5 estão como `it.fails` (passam enquanto o defeito existir e **quebram quando a nova
versão o corrigir**; nesse caso troque `it.fails` por `it`). Veja a seção "Defeitos conhecidos".

## Procedimento (precisa de acesso ao `cdn.sheetjs.com`)
Não foi possível executar na sessão do Claude: o domínio está fora da rede permitida. Rode em uma máquina com acesso ou
peça para liberar o domínio no ambiente.

1. Escolha a versão no CDN (>= 0.20.2). Exemplo: `V=0.20.3`.
2. `bun add xlsx@https://cdn.sheetjs.com/xlsx-$V/xlsx-$V.tgz`
   O nome do pacote continua `xlsx`; nenhum `import` precisa mudar.
3. Confirme que `package.json` aponta para a URL e que `bun.lock` registra o hash de integridade (`sha512-...`) do tarball.
4. Valide com o gerenciador oficial:
   `bun install --frozen-lockfile`, `bun run lint --max-warnings 16`, `bunx tsc -p tsconfig.app.json --noEmit`,
   `bun run test`, `bun run build`, `bun audit` (o `xlsx` deve sair da lista).
5. Rode o contrato em mais de um fuso: `TZ=UTC bunx vitest run src/test/xlsxContract.test.ts` e
   `TZ=America/Sao_Paulo bunx vitest run src/test/xlsxContract.test.ts`.
   Qualquer `it.fails` que passe a falhar é um defeito corrigido: converta em `it`.
   Qualquer teste normal que quebre é uma mudança de comportamento: investigue antes de mesclar.
6. Teste à mão, no app: um `.xlsx`, um `.xls` e um `.csv` reais de fatura de cartão, e a planilha do iFood.

## Riscos da troca
- **Dependência por URL.** O lock deixa de apontar para o registro. Confira o hash e fixe a versão exata.
- **Instalação no Lovable.** Na sessão do Claude, o endereço de registro privado de um pacote do lock
  (`jspdf-autotable`, em `bun.lock`) devolveu 403; um tarball do CDN pode ter problema parecido em algum ambiente.
  Valide o Publish no Lovable antes de depender da troca. Se houver bloqueio, a alternativa é versionar o tarball no
  repositório (`vendor/xlsx-<versão>.tgz` e `"xlsx": "file:vendor/..."`).
- **CI.** Os runners do GitHub costumam alcançar o CDN, mas confirme na primeira execução.
- **Mudança de comportamento.** Pode corrigir os defeitos abaixo (bom) e alterar outros detalhes de leitura (revisar).
- **Reversão.** `bun add xlsx@0.18.5`.

## Defeitos conhecidos do 0.18.5 (independentes da troca)
Verificados de ponta a ponta no código de produção atual (leitura + `parseCardSheets`):
1. **CSV com vírgula decimal** (formato brasileiro, separado por `;`): `1234,56` chega como `123456` (100 vezes maior).
2. **Data `dd/mm/aaaa` ambígua em CSV** (dia <= 12): `05/09/2026` é lida como mm/dd (9 de maio).
3. **CSV em UTF-8 sem BOM**: acentos corrompidos (`DescriÃ§Ã£o`) e o cabeçalho "Descrição" não é reconhecido.
4. **`.xls` em America/Sao_Paulo**: a data volta 23:59:32 do dia anterior (um dia a menos).

Em `.xlsx` as células já têm tipo, então 1 e 2 em princípio não se aplicam (não testado com arquivos reais de banco).
A nova versão pode ou não corrigir esses defeitos.
Corrigir de forma independente da versão exige ler CSV como texto com decodificação explícita e sem inferência de
números e datas; fica fora desta troca.

## Alternativas avaliadas
- **Espelho de terceiros no npm** (`@e965/xlsx`): mantido por uma pessoa, sem publicação desde julho de 2024 e sem como
  conferir a integridade contra o CDN oficial. Não recomendado para ler arquivos financeiros.
- **Outra biblioteca** (por exemplo `exceljs`): remove a dependência do CDN, mas exige reescrever as duas leituras e
  rever o comportamento de CSV, datas e `.xls`.
