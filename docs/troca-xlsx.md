# `xlsx` (SheetJS): troca da versão vulnerável

**Situação: concluída.** `xlsx@0.18.5` (npm) foi trocado por `xlsx@0.20.3` (CDN oficial do SheetJS).

## Por que
`xlsx@0.18.5`, a última versão do npm, tinha dois avisos oficiais de severidade alta:

| Aviso | Problema | Corrigido em |
|---|---|---|
| CVE-2023-30533 (GHSA-4r6h-8v6p-xvw6, CVSS 7.8) | Poluição de protótipo ao ler arquivo preparado | 0.19.3 |
| CVE-2024-22363 (GHSA-5pgg-2g8v-p4x9, CVSS 7.5) | ReDoS | 0.20.2 |

As correções **não existem no npm** (o pacote parou em 0.18.5; confirmado com `npm view xlsx`). Só são distribuídas em
`cdn.sheetjs.com`. A lista oficial do CDN (`https://cdn.sheetjs.com/xlsx.lst`) tem como mais recente a **0.20.3**, e o
`CHANGELOG.md` do pacote confirma as duas correções (v0.19.3 e v0.20.2).

Quem usa: só leitura de `.xlsx`, `.xls` e `.csv` enviados pelo usuário, em `CardReconciliation.tsx` e
`IfoodSheetImport.tsx` (`XLSX.read` + `sheet_to_json`). A escrita aparece só em testes.

## O que mudou
- `package.json`: `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"` (versão exata). O nome do pacote continua
  `xlsx`: nenhum `import` mudou.
- `bun.lock`: registra o hash de integridade `sha512-oLDq3jw7AcLq…3AJA==`. O hash foi calculado de forma independente a partir
  do tarball baixado (2.409.319 bytes; sha256 `8dc73fc3…99fe8`) e coincide com o do lock.
- 8 pacotes que o 0.18.5 puxava (`adler-32`, `cfb`, `codepage`, `crc-32`, `frac`, `ssf`, `wmf`, `word`) saíram: a 0.20.3 não
  tem dependências, não tem scripts de instalação e é Apache-2.0.
- `bun audit` não lista mais o `xlsx`.

## Comparação de comportamento (0.18.5 x 0.20.3)
| Caso | Resultado |
|---|---|
| Matriz `.xlsx`/`.xls`, abas, células vazias, linhas curtas | igual |
| Data como número de série + formato (como o Excel grava), dia local em UTC, São Paulo, Nova York e Tóquio, `.xlsx` e `.xls`, inclusive 31/12 e 01/01 | **igual** (mesmo arquivo lido pelas duas versões) |
| Data como célula do tipo data (gravada pelo próprio SheetJS) | `.xlsx` igual; `.xls` em São Paulo **corrigido** (antes voltava 23:59:32 do dia anterior) |
| CSV (acentos, vírgula decimal, `dd/mm/aaaa` ambígua) | **igual: os defeitos abaixo continuam** |

A v0.20.0 anuncia "interpretação UTC de datas (potencialmente quebrador)". Nos casos testados isso não alterou o dia local
que o app usa (`getFullYear/getMonth/getDate`), mas não foi testado com arquivos reais de fatura.

## Defeitos de leitura de CSV (0.18.5 e 0.20.3; independentes da troca)
Verificados de ponta a ponta no código de produção (leitura + `parseCardSheets`):
1. **Vírgula decimal brasileira** (CSV com `;`): `1234,56` chega como `123456` (100 vezes maior).
2. **`dd/mm/aaaa` ambígua** (dia <= 12): `05/09/2026` é lida como mm/dd (9 de maio). `05/03` vira 3 de maio de 2001.
3. **CSV em UTF-8 sem BOM**: acentos corrompidos (`DescriÃ§Ã£o`) e o cabeçalho "Descrição" não é reconhecido.

Com BOM ou Windows-1252 (padrão do Excel no Brasil) os acentos funcionam. Em `.xlsx` as células já têm tipo, então 1 e 2 em
princípio não se aplicam (não testado com arquivos reais de banco). Corrigir exige ler CSV como texto, com decodificação
explícita e sem inferência de números e datas; é uma mudança de comportamento da importação, fora desta troca.
Os três estão como `it.fails` em `src/test/xlsxContract.test.ts`: quebram quando uma versão futura corrigir.

## Testes
`src/test/xlsxContract.test.ts` (31 testes) descreve o contrato que a produção usa e é a barreira para qualquer troca futura:
matriz em `.xlsx`/`.xls`, abas, datas em 4 fusos (célula de data e número de série), CSV, sanidade contra poluição de
protótipo (não reproduz o exploit do CVE), versão >= 0.20.2 e procedência (URL do CDN com versão exata e hash no lock).
Rode também com fusos diferentes: `TZ=America/Sao_Paulo bunx vitest run src/test/xlsxContract.test.ts`.

## Riscos e pontos de atenção
- **Dependência por URL.** O lock deixou de apontar para o registro npm. A versão é exata e o hash fica no `bun.lock`.
- **CI e Lovable.** A instalação passa a buscar o tarball em `cdn.sheetjs.com`. Na sessão do Claude o endereço de registro
  privado de outro pacote do lock (`jspdf-autotable`) devolveu 403; confirme na primeira execução do CI e no Publish do
  Lovable. Se algum ambiente bloquear o CDN, a alternativa é versionar o tarball no repositório
  (`vendor/xlsx-0.20.3.tgz` e `"xlsx": "file:vendor/xlsx-0.20.3.tgz"`).
- **Atualizações futuras.** O Dependabot e o `bun update` não acompanham o CDN. Consulte `https://cdn.sheetjs.com/xlsx.lst` e
  os avisos do SheetJS de tempos em tempos.

## Como atualizar para uma versão futura
1. Veja a versão mais recente em `https://cdn.sheetjs.com/xlsx.lst` e leia o `CHANGELOG.md` do pacote.
2. `bun add xlsx@https://cdn.sheetjs.com/xlsx-<versão>/xlsx-<versão>.tgz`
3. Confira o hash no `bun.lock` (por exemplo, `sha512` do tarball baixado) e rode `bun install --frozen-lockfile`.
4. Rode lint, `tsc`, `bun run test` (com `TZ=UTC` e `TZ=America/Sao_Paulo` no contrato) e `bun run build`.
5. Qualquer `it.fails` que passe a falhar é um defeito corrigido: converta em `it`. Teste normal que quebre é mudança de
   comportamento: investigue antes de mesclar.

Reversão: `bun add xlsx@0.18.5` (volta à versão vulnerável; só em emergência).

## Alternativas descartadas
- **Espelho de terceiros no npm** (`@e965/xlsx`): mantido por uma pessoa, sem publicação desde julho de 2024 e sem como
  conferir a integridade contra o CDN oficial. Não recomendado para ler arquivos financeiros.
- **Outra biblioteca** (por exemplo `exceljs`): remove a dependência do CDN, mas exige reescrever as duas leituras e rever o
  comportamento de CSV, datas e `.xls`.
