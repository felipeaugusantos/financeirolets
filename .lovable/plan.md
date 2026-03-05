

# Plano: Corrigir warnings e testar Configurações

## Problema identificado
- Warning de `forwardRef` no componente `ProtectedRoute` e `Login` — React Router tenta passar ref a function components sem `forwardRef`.

## Correção necessária
- Verificar `App.tsx` e envolver os componentes de rota com `forwardRef` ou ajustar a forma como são passados ao `Route element`.

## Teste das Configurações (após login)
Após o usuário fazer login no preview:
1. Navegar para Configurações
2. Abrir "Unidades" → clicar "Novo" → criar unidade de teste
3. Verificar persistência (recarregar página)
4. Abrir "Categorias" → editar uma categoria existente
5. Verificar se edição persiste
6. Reportar resultados

## Notas sobre RLS
- Todas as tabelas de configuração têm políticas `RESTRICTIVE` — somente usuários com role `admin` ou `financeiro` podem criar/editar. Usuários com role `operador` (padrão no signup) **não conseguirão** criar/editar registros.
- Será necessário promover o usuário logado para `admin` via migration SQL antes de testar operações de escrita.

## Ação requerida
1. Criar migration para atribuir role `admin` aos usuários Kaique e Diogo (após criarem conta)
2. Corrigir warning de `forwardRef` em `App.tsx`
3. Executar teste automatizado completo

