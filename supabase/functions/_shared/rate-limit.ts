/**
 * Limite de pedidos por chave (normalmente o id do usuário), em janela fixa, na memória da instância.
 *
 * É um freio contra laço/abuso, não uma cota exata: cada instância da função tem o seu contador, então o
 * limite efetivo pode chegar a (limite × instâncias ativas). Para cota exata e compartilhada, ver `kaikin_consume`
 * (banco), usada no assistente. Falhar aqui nunca bloqueia: o limitador só conta.
 */
export interface RateLimiter {
  check(key: string, now?: number): { allowed: boolean; retryAfter: number };
}

export function createRateLimiter(opts: { max: number; windowMs: number; maxKeys?: number }): RateLimiter {
  const { max, windowMs, maxKeys = 5000 } = opts;
  const hits = new Map<string, { start: number; count: number }>();
  return {
    check(key, now = Date.now()) {
      const cur = hits.get(key);
      if (!cur || now - cur.start >= windowMs) {
        if (hits.size >= maxKeys) {
          for (const [k, v] of hits) if (now - v.start >= windowMs) hits.delete(k);
          if (hits.size >= maxKeys) hits.clear(); // memória limitada: melhor perder contagem do que crescer sem fim
        }
        hits.set(key, { start: now, count: 1 });
        return { allowed: true, retryAfter: 0 };
      }
      if (cur.count >= max) return { allowed: false, retryAfter: Math.max(1, Math.ceil((cur.start + windowMs - now) / 1000)) };
      cur.count += 1;
      return { allowed: true, retryAfter: 0 };
    },
  };
}

export function tooManyRequests(retryAfter: number, cors: Record<string, string>, message = 'Muitos pedidos em pouco tempo. Aguarde e tente novamente.'): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 429,
    headers: { ...cors, 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) },
  });
}
