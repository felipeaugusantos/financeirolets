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
| Usuário válido com ao menos um papel | processa; consultas com o token do usuário (o RLS vale) |

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
Alterar o arquivo não publica a função. Depois do merge, `kaikin` e `crm-discovery` precisam ser implantadas.
