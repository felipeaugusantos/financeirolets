import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ArrowRight, Search } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MANUAL } from '@/data/manual';

export default function Manual() {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const roles = useMemo(() => MANUAL.map(r => ({
    ...r,
    sections: term ? r.sections.filter(s => (s.title + ' ' + s.steps.join(' ')).toLowerCase().includes(term)) : r.sections,
  })), [term]);

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-2 text-primary"><BookOpen className="h-6 w-6" /></div>
        <div>
          <h1 className="text-2xl font-heading font-bold">Manual de uso</h1>
          <p className="text-sm text-muted-foreground">Passo a passo por função, para consultar sem sair do sistema.</p>
        </div>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar no manual (ex.: estorno, OFX, romaneio)" className="pl-9 rounded-xl" />
      </div>
      <Tabs defaultValue={MANUAL[0].id}>
        <TabsList className="w-full grid grid-cols-3">
          {roles.map(r => <TabsTrigger key={r.id} value={r.id} className="text-xs sm:text-sm">{r.label} ({r.sections.length})</TabsTrigger>)}
        </TabsList>
        {roles.map(r => (
          <TabsContent key={r.id} value={r.id} className="space-y-3">
            <p className="text-sm text-muted-foreground">{r.description}</p>
            {r.sections.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Nada encontrado para "{q}" nesta função.</p>
            ) : (
              <Accordion type="multiple" defaultValue={term ? r.sections.map(s => s.title) : []} className="rounded-2xl border bg-card px-4">
                {r.sections.map(s => (
                  <AccordionItem key={s.title} value={s.title}>
                    <AccordionTrigger className="font-heading">{s.title}</AccordionTrigger>
                    <AccordionContent>
                      <ol className="list-decimal space-y-1.5 pl-5 text-sm">
                        {s.steps.map((st, i) => <li key={i}>{st}</li>)}
                      </ol>
                      {s.link && (
                        <Button asChild variant="outline" size="sm" className="mt-3 rounded-xl">
                          <Link to={s.link}>Abrir tela <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
                        </Button>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
