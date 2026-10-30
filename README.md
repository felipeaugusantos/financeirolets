# Let's Finance

Controle financeiro multiunidades: receitas e despesas, contas a pagar e a receber, anexos de comprovantes, DRE por unidade e comissões, com assistente de IA integrado.

## Stack

- TypeScript, React e Vite, com componentes Radix/shadcn
- Supabase (banco de dados, autenticação e edge functions)
- Testes com Vitest

## Assistente de IA (kaikin)

Edge function com controle de acesso: exige usuário autenticado com papel autorizado, aplica cota por usuário e bloqueia o acesso se a verificação falhar. As consultas ao banco seguem as políticas de RLS com o token do próprio usuário.

## Rodar localmente

```bash
npm install
npm run dev
```

## Testes

```bash
npm test
```
