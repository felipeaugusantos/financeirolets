import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';

export default function Accounts() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-card-foreground">Contas a Pagar / Receber</h1>
        <p className="text-sm text-muted-foreground">Gerencie vencimentos e pagamentos</p>
      </div>

      <Tabs defaultValue="pagar" className="w-full">
        <TabsList className="w-full grid grid-cols-2 rounded-xl bg-muted">
          <TabsTrigger value="pagar" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            A Pagar
          </TabsTrigger>
          <TabsTrigger value="receber" className="rounded-lg data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground">
            A Receber
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pagar" className="mt-4">
          <Card className="shadow-card rounded-2xl border-border">
            <CardContent className="py-16 text-center">
              <p className="text-muted-foreground">Nenhuma conta a pagar.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="receber" className="mt-4">
          <Card className="shadow-card rounded-2xl border-border">
            <CardContent className="py-16 text-center">
              <p className="text-muted-foreground">Nenhuma conta a receber.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
