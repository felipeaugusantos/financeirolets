import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { KaikinMessage } from '@/components/kaikin/KaikinProvider';

const MAX_HISTORY = 200;

export function useKaikinHistory() {
  const load = useCallback(async (): Promise<KaikinMessage[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data, error } = await supabase
      .from('kaikin_messages')
      .select('role, content')
      .order('created_at', { ascending: true })
      .limit(MAX_HISTORY);
    if (error) {
      console.error('Kaikin history load', error);
      return [];
    }
    return (data ?? []).map((m) => ({ role: m.role as KaikinMessage['role'], content: m.content }));
  }, []);

  const save = useCallback(async (message: KaikinMessage) => {
    const content = message.content?.trim();
    if (!content) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from('kaikin_messages')
      .insert({ user_id: user.id, role: message.role, content });
    if (error) console.error('Kaikin history save', error);
  }, []);

  const clear = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('kaikin_messages').delete().eq('user_id', user.id);
    if (error) console.error('Kaikin history clear', error);
  }, []);

  return { load, save, clear };
}
