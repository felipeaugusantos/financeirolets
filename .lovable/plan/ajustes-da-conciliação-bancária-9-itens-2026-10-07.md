# Ajustes da Conciliação Bancária (9 itens)

Somente melhorias de tela e rotina. Nenhum lançamento existente é alterado por esta entrega; as ações novas só agem quando o usuário clicar.

## 1. Desvincular exclui o lançamento
- Ao desvincular uma linha do extrato, abrir confirmação: "Desvincular e excluir o lançamento" (padrão) ou "Só desvincular".
- A exclusão leva junto rateio e anexos numa única operação; em mês fechado o banco recusa e nada é apagado (mensagem clara).
- Lançamentos pagos: apenas Admin/Financeiro podem excluir (regra atual mantida); demais perfis só desvinculam.

## 2. Manter filtros ao sair da tela
- Conta, período, status, aba e busca ficam salvos no navegador e voltam ao reabrir a conciliação.

## 3. Lançar automaticamente traz todos os selecionados
- Se houver linhas marcadas na tabela, o diálogo abre com exatamente essas linhas; sem seleção, usa as classificadas por regra.
- Linhas com possível duplicidade aparecem na lista (com aviso e desmarcadas), em vez de sumirem.

## 4. Colunas editáveis no Lançar automaticamente
- Categoria, Unidade, Frente e Forma de pagamento viram seletores por linha; o lançamento usa o valor editado.

## 5. Bug do total no "+ Criar lançamento"
- Total e botão passam a usar a mesma seleção (linhas do extrato).
- Seleção é limpa ao trocar conta, período ou aba.
- Botão desabilitado e total zerado quando nada está selecionado.

## 6. Texto completo no Lançar automaticamente
- Descrição e regra quebram linha em vez de cortar; diálogo mais largo.

## 7. Regra Kaique - Pró-labore
- Alterar a regra "KAIQUE MORESCA MARTIN" de Salários para "Pro Labore Sócios".
- É configuração de regra (não muda lançamentos já feitos); só vale para as próximas conciliações.

## 8. Percentual conciliado
- Barra "X% conciliado (n de N linhas)" no topo da conciliação e nos painéis, respeitando conta e período.

## 9. Pesquisa por valor e descrição no Extrato Bancário
- Busca aceita texto ou valor ("150", "150,00", "-150", "1.234,56"), em ambas as visões.

## Detalhes técnicos
- Item 1 usa `delete_transaction_with_children`; se a função não existir no banco (PGRST202), aplicar a migração 09 (estrutura apenas) antes, ou cair para "só desvincular" com aviso.
- Item 2: `localStorage` com chave por usuário.
- Arquivos: `OfxImportSettings.tsx`, `ClassicReconciliation.tsx`, `AutoPostDialog.tsx`, `BulkCreateDialog.tsx`, `useOfxImport.ts`; parser de valor em `src/lib/` com testes.
- Item 7: um único UPDATE em `ofx_import_rules` (id 50233803...).
- Ao final: versão 1.2.3 em releases/CHANGELOG, typecheck e testes.
