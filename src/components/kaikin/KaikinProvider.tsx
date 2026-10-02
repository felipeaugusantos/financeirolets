import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';

export type KaikinRole = 'user' | 'assistant';
export interface KaikinMessage {
  role: KaikinRole;
  content: string;
}

export interface KaikinPageContext {
  scope?: string;
  period?: { from?: string; to?: string };
  [key: string]: unknown;
}

interface KaikinCtx {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  messages: KaikinMessage[];
  replaceMessages: (m: KaikinMessage[]) => void;
  appendMessage: (m: KaikinMessage) => void;
  patchLastAssistant: (chunk: string) => void;
  resetMessages: () => void;
  pageContext: KaikinPageContext | null;
  setPageContext: (ctx: KaikinPageContext | null) => void;
  loading: boolean;
  setLoading: (v: boolean) => void;
}

const Ctx = createContext<KaikinCtx | null>(null);

export function KaikinProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<KaikinMessage[]>([]);
  const [pageContext, setPageContext] = useState<KaikinPageContext | null>(null);
  const [loading, setLoading] = useState(false);

  const appendMessage = useCallback((m: KaikinMessage) => {
    setMessages((prev) => [...prev, m]);
  }, []);

  const patchLastAssistant = useCallback((chunk: string) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === 'assistant') {
        return prev.map((m, i) =>
          i === prev.length - 1 ? { ...m, content: m.content + chunk } : m
        );
      }
      return [...prev, { role: 'assistant', content: chunk }];
    });
  }, []);

  const value = useMemo<KaikinCtx>(
    () => ({
      isOpen,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      toggle: () => setIsOpen((v) => !v),
      messages,
      replaceMessages: setMessages,
      appendMessage,
      patchLastAssistant,
      resetMessages: () => setMessages([]),
      pageContext,
      setPageContext,
      loading,
      setLoading,
    }),
    [isOpen, messages, pageContext, loading, appendMessage, patchLastAssistant]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useKaikin() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useKaikin precisa estar dentro de <KaikinProvider>');
  return v;
}
