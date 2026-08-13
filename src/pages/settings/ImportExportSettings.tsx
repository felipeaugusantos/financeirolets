import { useState, useRef } from 'react';
import { ArrowLeft, Upload, Download, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { todayLocalISO } from '@/lib/utils';
import { exportToCsv, csvNumber, csvDate, CsvCell } from '@/lib/exportCsv';

/** Divide uma linha CSV respeitando aspas, aceitando ';' ou ',' como delimitador. */
function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      out.push(cur.trim()); cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out.map(c => c.replace(/^="(.*)"$/, '$1'));
}

/** Detecta o delimitador do arquivo (compatível com CSVs antigos com vírgula). */
function detectDelimiter(headerLine: string): string {
  const semi = (headerLine.match(/;/g) || []).length;
  const comma = (headerLine.match(/,/g) || []).length;
  return semi >= comma && semi > 0 ? ';' : ',';
}

/** Aceita "1234,56", "1.234,56", "1234.56" e "1,234.56". */
function parseAmount(raw: string): number {
  let s = (raw || '').replace(/[^\d,.-]/g, '').trim();
  if (!s) return NaN;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma > -1) {
    // vírgula única: decimal pt-BR (a menos que pareça milhar: ,000 no fim)
    s = /,\d{3}$/.test(s) && s.replace(/[^,]/g, '').length === 1 && s.length > 5
      ? s.replace(',', '')
      : s.replace(',', '.');
  }
  return parseFloat(s);
}

/** Aceita dd/MM/yyyy, dd/MM/yy e yyyy-MM-dd. */
function parseDateFlexible(raw: string): string | null {
  const d = (raw || '').trim();
  if (!d) return null;
  const isValid = (y: number, m: number, day: number) => {
    if (m < 1 || m > 12 || day < 1) return false;
    const dt = new Date(Date.UTC(y, m - 1, day));
    return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === day;
  };
  const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return isValid(+iso[1], +iso[2], +iso[3]) ? d : null;
  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const yy = m[3].length === 2 ? `20${m[3]}` : m[3];
    if (!isValid(+yy, +m[2], +m[1])) return null;
    return `${yy}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

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
      const csvRows: CsvCell[][] = rows.map((r: any) => [
        csvDate(r.competence_date),
        r.type || '',
        r.description || '',
        csvNumber(r.amount),
        csvNumber(r.tax_amount),
        csvNumber(r.net_amount),
        csvDate(r.due_date),
        csvDate(r.payment_date),
        r.status || '',
        r.payment_method || '',
        r.category?.name || '',
        r.account?.name || '',
        r.partner?.name || '',
        r.unit?.name || '',
        r.front?.name || '',
        r.notes || '',
      ]);

      exportToCsv(`lancamentos_${todayLocalISO()}.csv`, headers, csvRows);
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
      const text = (await file.text()).replace(/^\uFEFF/, '');
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) throw new Error('CSV vazio ou sem dados');
      const delimiter = detectDelimiter(lines[0]);

      const headers = splitCsvLine(lines[0], delimiter).map(h => h.toLowerCase());
      const descIdx = headers.findIndex(h => h.includes('descri'));
      const amountIdx = headers.findIndex(h => h.includes('valor bruto') || h.includes('valor') || h.includes('amount'));
      const typeIdx = headers.findIndex(h => h.includes('tipo') || h.includes('type'));
      const dateIdx = headers.findIndex(h => h.includes('data') || h.includes('date') || h.includes('competência'));

      if (descIdx === -1 || amountIdx === -1) {
        throw new Error('CSV deve ter pelo menos colunas "Descrição" e "Valor"');
      }

      let success = 0;
      const errors: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = splitCsvLine(lines[i], delimiter);
        const description = cols[descIdx];
        const amount = parseAmount(cols[amountIdx] || '');

        if (!description || !amount || !isFinite(amount)) {
          errors.push(`Linha ${i + 1}: descrição ou valor inválido`);
          continue;
        }

        const rawType = (cols[typeIdx] || '').toLowerCase();
        const type = rawType.includes('receita') ? 'receita' : 'despesa';
        // Data: nunca substituir silenciosamente por hoje.
        let competence_date: string;
        if (dateIdx === -1) {
          // Arquivo sem coluna de data: usa a data de hoje (comportamento explícito no aviso da tela).
          competence_date = todayLocalISO();
        } else {
          const parsed = parseDateFlexible(cols[dateIdx] || '');
          if (!parsed) {
            errors.push(
              `Linha ${i + 1}: data inválida ou vazia ("${(cols[dateIdx] || '').trim()}"). Use dd/mm/aaaa ou aaaa-mm-dd. Linha não importada.`
            );
            continue;
          }
          competence_date = parsed;
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
              Colunas opcionais: Tipo, Data, Status. Aceita separador <strong>;</strong> (padrão Excel pt-BR)
              ou <strong>,</strong> (arquivos antigos), datas em <strong>dd/mm/aaaa</strong> ou aaaa-mm-dd e
              valores com vírgula ou ponto decimal.
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
