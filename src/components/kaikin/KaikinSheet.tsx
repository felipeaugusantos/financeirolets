import { useEffect, useRef, useState, KeyboardEvent } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, RotateCcw } from 'lucide-react';
import { useKaikin } from './KaikinProvider';
import { useKaikinStream } from '@/hooks/useKaikinStream';
import { useKaikinHistory } from '@/hooks/useKaikinHistory';
import { KaikinMessage } from './KaikinMessage';
import kaikinAvatar from '@/assets/kaikin-avatar.png.asset.json';

const RECON_SUGGESTIONS = [
  'Por que o Dashboard e o DRE divergem neste período?',
  'Explique os itens "pagos fora da competência".',
  'Quais lançamentos vencidos eu deveria atacar primeiro?',
  'O que significa "DRE Caixa" versus "DRE Competência"?',
];

const GENERIC_SUGGESTIONS = [
  'O que é DRE Caixa vs Competência?',
  'Como o sistema trata transações canceladas?',
  'Como funciona o rateio entre unidades?',
];

export function KaikinSheet() {
  const { isOpen, close, messages, pageContext, loading, resetMessages, replaceMessages } = useKaikin();
  const { send } = useKaikinStream();
  const { load, clear } = useKaikinHistory();
  const [input, setInput] = useState('');
  const hydrated = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || hydrated.current) return;
    hydrated.current = true;
    load().then((saved) => {
      if (saved.length) replaceMessages(saved);
    });
  }, [isOpen, load, replaceMessages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  function handleReset() {
    resetMessages();
    void clear();
  }

  const suggestions = pageContext?.scope === 'reconciliacao' ? RECON_SUGGESTIONS : GENERIC_SUGGESTIONS;
  const subtitle = pageContext?.scope === 'reconciliacao'
    ? `Vendo: Reconciliação ${pageContext?.period?.from ?? ''} → ${pageContext?.period?.to ?? ''}`
    : 'Pergunte sobre auditoria, DRE ou reconciliação';

  async function handleSend(text?: string) {
    const value = (text ?? input).trim();
    if (!value || loading) return;
    setInput('');
    await send(value);
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={(v) => !v && close()}>
      <SheetContent side="right" className="w-full sm:max-w-[440px] p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full overflow-hidden ring-1 ring-border bg-muted shrink-0">
              <img
                src={kaikinAvatar.url}
                alt="Kaikin"
                className="h-full w-full object-cover scale-[1.6]"
                style={{ objectPosition: '55% 22%' }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-base font-heading">Kaikin</SheetTitle>
              <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>
            </div>
            {messages.length > 0 && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleReset} title="Limpar conversa">
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </SheetHeader>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4 py-8">
              <div className="h-20 w-20 rounded-full overflow-hidden ring-2 ring-primary/40 shadow-elevated bg-muted">
                <img
                  src={kaikinAvatar.url}
                  alt="Kaikin"
                  className="h-full w-full object-cover scale-[1.6]"
                  style={{ objectPosition: '55% 22%' }}
                />
              </div>
              <div>
                <p className="font-heading font-semibold text-card-foreground">Oi, sou o Kaikin 👋</p>
                <p className="text-xs text-muted-foreground mt-1">Posso te ajudar a entender e resolver divergências do fechamento.</p>
              </div>
              <div className="w-full space-y-2 mt-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSend(s)}
                    className="w-full text-left text-xs rounded-xl border border-border bg-card hover:bg-accent transition-colors px-3 py-2 text-card-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => <KaikinMessage key={i} message={m} />)
          )}
        </div>

        <div className="border-t border-border p-3 bg-card">
          <div className="flex gap-2 items-end">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder="Pergunte ao Kaikin..."
              rows={1}
              className="resize-none min-h-[40px] max-h-32 text-sm"
              disabled={loading}
            />
            <Button
              size="icon"
              onClick={() => handleSend()}
              disabled={loading || !input.trim()}
              className="h-10 w-10 shrink-0 bg-gradient-to-br from-primary to-secondary text-primary-foreground"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 px-1">Kaikin responde com base nos dados do seu workspace. Sempre confirme antes de agir.</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
