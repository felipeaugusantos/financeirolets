import { useState } from 'react';
import { useSupabaseCrud } from '@/hooks/useSupabaseCrud';
import type { Tables } from '@/integrations/supabase/types';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import Transactions from './Transactions';

export default function AccountingTransactions() {
  const [categoryName, setCategoryName] = useState('Depreciação');
  const { data: categories, loading } = useSupabaseCrud<Tables<'categories'>>('categories', 'name');
  const category = categories.find(c => c.name === categoryName && c.active);

  return (
    <div className="space-y-4">
      <Tabs value={categoryName} onValueChange={setCategoryName}>
        <TabsList aria-label="Categoria contábil">
          <TabsTrigger value="Depreciação">Depreciação</TabsTrigger>
          <TabsTrigger value="CSLL">CSLL</TabsTrigger>
        </TabsList>
      </Tabs>
      {loading ? <p className="text-sm text-muted-foreground">Carregando...</p> : category ? (
        <Transactions key={category.id} accountingCategory={category} />
      ) : (
        <Alert variant="destructive"><AlertDescription>Categoria indisponível: {categoryName}.</AlertDescription></Alert>
      )}
    </div>
  );
}