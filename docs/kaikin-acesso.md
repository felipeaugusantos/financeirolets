# Kaikin (assistente de IA): controle de acesso

A função `supabase/functions/kaikin` só consulta dados ou chama a IA depois de `authorizeKaikin`
(`supabase/functions/kaikin/access.ts`).

| Situação | Resposta |
|---|---|
| Preflight (`OPTIONS`) | 200 com CORS, sem exigir login |
| Método diferente de `POST` | 405 |
| Sem `Authorization: Bearer`, cabeçalho malformado, token inválido/expirado ou chave pública (anon) | 401 |
| Usuário válido sem nenhum papel em `user_roles` | 403 |
| Falha ao verificar (Auth ou consulta de papéis fora do ar) | 503 (bloqueia; nunca libera por erro) |
| Usuário autorizado acima da cota (por minuto ou por dia) | 429 com `Retry-After` |
| Falha ao conferir a cota (banco fora do ar) | 503 (bloqueia; nunca libera por erro) |
| Usuário válido com ao menos um papel, dentro da cota | processa; consultas com o token do usuário (o RLS vale) |

## Limite por usuário (cota)
- Padrão em `supabase/functions/kaikin/limits.ts` (`KAIKIN_LIMITS`): **8 perguntas por minuto e 150 por dia** por usuário.
  O dia vira à meia-noite de São Paulo. Ajustar é mudar o arquivo e implantar a função (o SQL não guarda os limites).
- A contagem é feita no banco por `kaikin_consume` (migração `20261029120000`, script `scripts/producao/16-kaikin-limites.sql`),
  de forma atômica, sempre para o usuário do token. A tabela `kaikin_usage` não é acessível pelo app; a função só aceita
  usuário logado. Pedido recusado não gasta a cota do dia.
- A cota é conferida depois do acesso (401/403 não gastam) e antes de qualquer consulta ou chamada à IA.
- Quem chama a função SQL direto só consegue aumentar a própria contagem; os limites reais vêm da função `kaikin`.
- Isto limita **quantidade**; não substitui o teto de gasto do workspace do Lovable AI, que deve continuar configurado.
- Linhas com mais de 3 dias são apagadas de forma eventual pela própria função.

## Validação da entrada
`parseChatInput` (`limits.ts`) roda antes da IA: só aceita mensagens `user`/`assistant` (o cliente não injeta `system` nem `tool`),
com texto, as últimas 24, pergunta de até 4.000 caracteres (413 acima disso), respostas antigas cortadas em 8.000, contexto da tela
descartado se passar de 8.000 caracteres e corpo de até 120.000 caracteres (413). A última mensagem precisa ser do usuário.

## Por que a chave anon não basta
O `verify_jwt = true` do gateway aceita a chave pública, que também é um JWT. O front usa essa chave como
token quando não há sessão (`useKaikinStream.ts`). Por isso a função valida o usuário no Supabase Auth.

## Regra de papéis (decisão a confirmar)
- Vale qualquer papel do enum `app_role` (`KAIKIN_ALLOWED_ROLES`). É o critério de "usuário provisionado" já usado
  no sistema (ex.: leitura da Fábrica) e o que o RLS de `transactions` hoje permite a qualquer autenticado.
- O front mostra o Kaikin a todos os logados; nenhuma regra existente exclui um papel específico.
- Para restringir (ex.: tirar `vendedor`), basta editar `KAIKIN_ALLOWED_ROLES`.
- O administrador desativa o acesso ao assistente removendo todos os papéis do usuário.

## Limitação conhecida
`handle_new_user` dá o papel `operador` a toda conta criada. Se o cadastro livre estiver habilitado no Supabase Auth,
qualquer pessoa que se cadastre passa a ter papel e, portanto, acesso ao assistente (e à leitura que o RLS já permite).
Conferir em Authentication > Providers/Settings se "Allow new users to sign up" está desligado.

## Deploy
Alterar o arquivo não publica a função. Depois do merge, **aplique antes o SQL 16** (`scripts/producao/16-kaikin-limites.sql`) e só então
implante `kaikin`: sem a função `kaikin_consume` a conferência de cota falha e a função responde 503. `crm-discovery` também precisa ser implantada.
