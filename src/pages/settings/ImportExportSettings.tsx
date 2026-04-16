import { useState, useRef } from 'react';
import { ArrowLeft, Upload, Download, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export default function ImportExportSettings({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; errors: string[] } | null>(null);

  const handleExportCSV = async () => {
    try {
      const { data: rows, error } = await supabase
        .from('transactions')
        .select(`*, category:categories(name), account:accounts(name), partner:partners(name), unit:units(name), front:business_fronts(name)`)
        .order('competence_date', { ascending: false });

      if (error) throw error;
      if (!rows || rows.length === 0) {
        toast({ title: 'Nenhum lançamento para exportar' });
        return;
      }

      const headers = ['Data Competência', 'Tipo', 'Descrição', 'Valor Bruto', 'Impostos', 'Valor Líquido', 'Vencimento', 'Pagamento', 'Status', 'Forma Pgto', 'Categoria', 'Conta', 'Parceiro', 'Unidade', 'Frente', 'Observações'];
      const csvRows = rows.map((r: any) => [
        r.competence_date, r.type, `"${(r.description || '').replace(/"/g, '""')}"`,
        r.amount, r.tax_amount, r.net_amount, r.due_date || '', r.payment_date || '',
        r.status, r.payment_method || '', r.category?.name || '', r.account?.name || '',
        r.partner?.name || '', r.unit?.name || '', r.front?.name || '',
        `"${(r.notes || '').replace(/"/g, '""')}"`,
      ].join(','));

      const csv = [headers.join(','), ...csvRows].join('\n');
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lancamentos_${new Date().toISOString().substring(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'CSV exportado com sucesso' });
    } catch (err: any) {
      toast({ title: 'Erro ao exportar', description: err.message, variant: 'destructive' });
    }
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setImporting(true);
    setImportResult(null);

    try {
      const text = await file.text();
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) throw new Error('CSV vazio ou sem dados');

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const descIdx = headers.findIndex(h => h.includes('descri'));
      const amountIdx = headers.findIndex(h => h.includes('valor') || h.includes('amount'));
      const typeIdx = headers.findIndex(h => h.includes('tipo') || h.includes('type'));
      const dateIdx = headers.findIndex(h => h.includes('data') || h.includes('date') || h.includes('competência'));

      if (descIdx === -1 || amountIdx === -1) {
        throw new Error('CSV deve ter pelo menos colunas "Descrição" e "Valor"');
      }

      let success = 0;
      const errors: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].match(/(".*?"|[^,]*)/g)?.map(c => c.replace(/^"|"$/g, '').trim()) || [];
        const description = cols[descIdx];
        const amount = parseFloat(cols[amountIdx]?.replace(',', '.') || '0');

        if (!description || !amount) {
          errors.push(`Linha ${i + 1}: descrição ou valor inválido`);
          continue;
        }

        const rawType = (cols[typeIdx] || '').toLowerCase();
        const type = rawType.includes('receita') ? 'receita' : 'despesa';
        let competence_date = new Date().toISOString().substring(0, 10);
        if (dateIdx !== -1 && cols[dateIdx]) {
          const d = cols[dateIdx];
          // Try DD/MM/YYYY or YYYY-MM-DD
          if (d.includes('/')) {
            const [dd, mm, yy] = d.split('/');
            competence_date = `${yy.length === 2 ? '20' + yy : yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
          } else if (d.match(/^\d{4}-\d{2}-\d{2}$/)) {
            competence_date = d;
          }
        }

        const { error } = await supabase.from('transactions').insert({
          type: type as any,
          description,
          amount,
          tax_amount: 0,
          net_amount: amount,
          competence_date,
          status: 'pendente' as any,
          created_by: user.id,
        });

        if (error) {
          errors.push(`Linha ${i + 1}: ${error.message}`);
        } else {
          success++;
        }
      }

      setImportResult({ success, errors });
      toast({ title: `Importação concluída: ${success} lançamentos criados` });
    } catch (err: any) {
      toast({ title: 'Erro na importação', description: err.message, variant: 'destructive' });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 -ml-2">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>

      <h2 className="font-heading text-xl font-bold text-card-foreground">Importar / Exportar</h2>

      <div className="grid sm:grid-cols-2 gap-4">
        <Card className="shadow-card rounded-2xl border-border">
          <CardHeader className="flex flex-row items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Upload className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-sm font-heading">Importar CSV</CardTitle>
              <p className="text-xs text-muted-foreground">Importe lançamentos de um arquivo CSV</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              O CSV deve ter ao menos as colunas: <strong>Descrição</strong> e <strong>Valor</strong>. 
              Colunas opcionais: Tipo, Data, Status.
            </p>
            <input ref={fileRef} type="file" accept=".csv,text/csv,.txt" className="hidden" onChange={handleImportCSV} />
            <Button
              variant="outline"
              className="w-full gap-2 rounded-xl"
              onClick={() => {
                setTimeout(() => fileRef.current?.click(), 100);
              }}
              disabled={importing}
            >
              <FileSpreadsheet className="h-4 w-4" />
              {importing ? 'Importando...' : 'Selecionar arquivo CSV'}
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-card rounded-2xl border-border">
          <CardHeader className="flex flex-row items-center gap-3">
            <div className="p-2 rounded-xl bg-secondary/10">
              <Download className="h-5 w-5 text-secondary" />
            </div>
            <div>
              <CardTitle className="text-sm font-heading">Exportar CSV</CardTitle>
              <p className="text-xs text-muted-foreground">Exporte todos os lançamentos</p>
            </div>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full gap-2 rounded-xl" onClick={handleExportCSV}>
              <Download className="h-4 w-4" />
              Exportar Lançamentos
            </Button>
          </CardContent>
        </Card>
      </div>

      {importResult && (
        <Alert variant={importResult.errors.length > 0 ? 'destructive' : 'default'}>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <p className="font-medium">{importResult.success} lançamentos importados com sucesso.</p>
            {importResult.errors.length > 0 && (
              <div className="mt-2 space-y-1">
                <p className="text-xs font-medium">{importResult.errors.length} erros:</p>
                {importResult.errors.slice(0, 10).map((e, i) => (
                  <p key={i} className="text-xs">{e}</p>
                ))}
                {importResult.errors.length > 10 && (
                  <p className="text-xs">... e mais {importResult.errors.length - 10}</p>
                )}
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
