// Declarações mínimas do runtime Deno, só para o typecheck das edge functions no CI (sem instalar Deno).
declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): unknown;
};
