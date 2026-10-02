import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useKaikin, KaikinMessage, KaikinPageContext } from '@/components/kaikin/KaikinProvider';
import { useKaikinHistory } from '@/hooks/useKaikinHistory';
import { errorMessage } from '@/lib/utils';

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/kaikin`;

export function useKaikinStream() {
  const { appendMessage, patchLastAssistant, setLoading, messages, pageContext } = useKaikin();
  const { toast } = useToast();
  const { save } = useKaikinHistory();

  async function send(input: string) {
    const userMsg: KaikinMessage = { role: 'user', content: input };
    appendMessage(userMsg);
    setLoading(true);
    void save(userMsg);
    let answer = '';

    // empty assistant placeholder
    appendMessage({ role: 'assistant', content: '' });

    try {
      const history = [...messages, userMsg].slice(-24); // últimos turnos
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ messages: history, pageContext: pageContext ?? null }),
      });

      if (!resp.ok) {
        if (resp.status === 429) {
          toast({ title: 'Muitas requisições', description: 'Aguarde alguns segundos antes de tentar de novo.', variant: 'destructive' });
        } else if (resp.status === 402) {
          toast({ title: 'Créditos esgotados', description: 'Adicione créditos em Configurações → Workspace → Uso.', variant: 'destructive' });
        } else {
          toast({ title: 'Erro ao falar com o Kaikin', description: `HTTP ${resp.status}`, variant: 'destructive' });
        }
        patchLastAssistant('_Desculpe, não consegui responder agora._');
        return;
      }
      if (!resp.body) throw new Error('stream sem body');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';
      let done = false;

      while (!done) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') {
            done = true;
            break;
          }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              answer += content;
              patchLastAssistant(content);
            }
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }
    } catch (e: unknown) {
      console.error('Kaikin stream error', e);
      toast({ title: 'Erro de conexão', description: errorMessage(e) ?? 'falha desconhecida', variant: 'destructive' });
      patchLastAssistant('_Erro de conexão._');
    } finally {
      if (answer.trim()) void save({ role: 'assistant', content: answer });
      setLoading(false);
    }
  }

  return { send };
}
