import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import OfxRulesPanel, { OptionList } from '@/components/ofx/OfxRulesPanel';
import RuleSimulationPanel from '@/components/ofx/RuleSimulationPanel';
import type { OfxRule } from '@/lib/ofxMatch';
import { Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CategorySplitsPanel from '@/components/rules/CategorySplitsPanel';
import SimpleRuleDialog from '@/components/rules/SimpleRuleDialog';
import { useCurrentUserRoles } from '@/hooks/useUserRoles';

/** Conciliação Bancária → Regras de Conciliação. */
export default function ReconciliationRules() {
  const [rules, setRules] = useState<OfxRule[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string; default_unit_id?: string | null }[]>([]);
  const [simpleOpen, setSimpleOpen] = useState(false);
  const { isAdmin, isFinanceiro } = useCurrentUserRoles();
  const canEdit = isAdmin || isFinanceiro;
  const [options, setOptions] = useState<OptionList>({ categories: [], units: [], fronts: [], partners: [] });

  const reloadRules = useCallback(async () => {
    // Traz também as inativas: a tela permite ligar/desligar sem excluir.
    const { data } = await (supabase as any)
      .from('ofx_import_rules')
      .select('*')
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
        supabase.from('accounts').select('id, name, default_unit_id').eq('active', true).order('name'),
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
      <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="font-heading text-2xl font-bold text-card-foreground">Regras de Conciliação</h1>
        <p className="text-sm text-muted-foreground">
          Regras por texto do extrato que sugerem categoria, unidade, frente e parceiro na conciliação.
        </p>
      </div>
        {canEdit && (
          <Button className="gap-2 rounded-xl" onClick={() => setSimpleOpen(true)}>
            <Wand2 className="h-4 w-4" /> Nova regra simples
          </Button>
        )}
      </div>

      <SimpleRuleDialog
        open={simpleOpen} onOpenChange={setSimpleOpen}
        categories={options.categories} units={options.units} accounts={accounts}
        onSaved={reloadRules}
      />

      <Tabs defaultValue="regras" className="space-y-4">
        <TabsList>
          <TabsTrigger value="regras">Regras</TabsTrigger>
          <TabsTrigger value="divisoes">Divisão por categoria</TabsTrigger>
          <TabsTrigger value="simulacao">Simulação</TabsTrigger>
        </TabsList>
        <TabsContent value="regras">
          <OfxRulesPanel rules={rules} options={options} accounts={accounts} onChanged={reloadRules} />
        </TabsContent>
        <TabsContent value="divisoes">
          <CategorySplitsPanel categories={options.categories} units={options.units} accounts={accounts} canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="simulacao">
          <RuleSimulationPanel rules={rules.filter(r => r.active !== false)} options={options} accounts={accounts} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
