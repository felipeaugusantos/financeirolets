import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import OfxRulesPanel, { OptionList } from '@/components/ofx/OfxRulesPanel';
import RuleSimulationPanel from '@/components/ofx/RuleSimulationPanel';
import type { OfxRule } from '@/lib/ofxMatch';

/** Conciliação Bancária → Regras de Conciliação. */
export default function ReconciliationRules() {
  const [rules, setRules] = useState<OfxRule[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [options, setOptions] = useState<OptionList>({ categories: [], units: [], fronts: [], partners: [] });

  const reloadRules = useCallback(async () => {
    const { data } = await (supabase as any)
      .from('ofx_import_rules')
      .select('*')
      .eq('active', true)
      .order('priority');
    setRules((data ?? []) as OfxRule[]);
  }, []);

  useEffect(() => {
    reloadRules();
    (async () => {
      const [cat, uni, fro, par, acc] = await Promise.all([
        supabase.from('categories').select('id, name, type').eq('active', true).order('name'),
        supabase.from('units').select('id, name').eq('active', true).order('name'),
        supabase.from('business_fronts').select('id, name').eq('active', true).order('name'),
        supabase.from('partners').select('id, name').eq('active', true).order('name'),
        supabase.from('accounts').select('id, name').eq('active', true).order('name'),
      ]);
      setOptions({
        categories: (cat.data ?? []) as any,
        units: (uni.data ?? []) as any,
        fronts: (fro.data ?? []) as any,
        partners: (par.data ?? []) as any,
      });
      setAccounts((acc.data ?? []) as any);
    })();
  }, [reloadRules]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-2xl font-bold text-card-foreground">Regras de Conciliação</h1>
        <p className="text-sm text-muted-foreground">
          Regras por texto do extrato que sugerem categoria, unidade, frente e parceiro na conciliação.
        </p>
      </div>

      <Tabs defaultValue="regras" className="space-y-4">
        <TabsList>
          <TabsTrigger value="regras">Regras</TabsTrigger>
          <TabsTrigger value="simulacao">Simulação</TabsTrigger>
        </TabsList>
        <TabsContent value="regras">
          <OfxRulesPanel rules={rules} options={options} onChanged={reloadRules} />
        </TabsContent>
        <TabsContent value="simulacao">
          <RuleSimulationPanel rules={rules} options={options} accounts={accounts} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
