import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Search, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';

export default function Transactions() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-card-foreground">Lançamentos</h1>
          <p className="text-sm text-muted-foreground">Receitas e despesas</p>
        </div>
        <Button className="rounded-xl gap-2">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Novo</span>
        </Button>
      </div>

      {/* Search and filters */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar lançamentos..." className="pl-10 bg-card border-border rounded-xl" />
        </div>
        <Button variant="outline" size="icon" className="rounded-xl border-secondary text-secondary">
          <Filter className="h-4 w-4" />
        </Button>
      </div>

      {/* Empty state */}
      <Card className="shadow-card rounded-2xl border-border">
        <CardContent className="py-16 text-center">
          <p className="text-muted-foreground">Nenhum lançamento cadastrado.</p>
          <p className="text-sm text-muted-foreground mt-1">Clique em "+ Novo" para começar.</p>
        </CardContent>
      </Card>
    </div>
  );
}
