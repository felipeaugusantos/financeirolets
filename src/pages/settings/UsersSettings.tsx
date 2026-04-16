import { useState } from 'react';
import { ArrowLeft, Shield, Building2, Users as UsersIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useUserRoles, ROLE_LABELS, ROLE_OPTIONS, type AppRole, type UserWithRoles } from '@/hooks/useUserRoles';
import { useSupabaseCrud } from '@/hooks/useSupabaseCrud';

interface Props {
  onBack: () => void;
}

export default function UsersSettings({ onBack }: Props) {
  const { users, loading, setRoles, setUnits } = useUserRoles();
  const { data: units } = useSupabaseCrud<{ id: string; name: string; active: boolean }>('units', 'name');
  const [editing, setEditing] = useState<UserWithRoles | null>(null);
  const [draftRoles, setDraftRoles] = useState<AppRole[]>([]);
  const [draftUnits, setDraftUnits] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const openEdit = (u: UserWithRoles) => {
    setEditing(u);
    setDraftRoles(u.roles);
    setDraftUnits(u.unit_ids);
  };

  const toggleRole = (r: AppRole) => {
    setDraftRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  };
  const toggleUnit = (id: string) => {
    setDraftUnits((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    await setRoles(editing.id, draftRoles);
    await setUnits(editing.id, draftUnits);
    setSaving(false);
    setEditing(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack} className="rounded-xl">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="font-heading text-2xl font-bold text-card-foreground flex items-center gap-2">
            <UsersIcon className="h-6 w-6 text-accent" />
            Usuários e Permissões
          </h1>
          <p className="text-sm text-muted-foreground">Atribua perfis e vincule unidades aos usuários</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : users.length === 0 ? (
        <Card className="shadow-card rounded-2xl border-border">
          <CardContent className="py-16 text-center text-muted-foreground">
            Nenhum usuário encontrado.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <Card key={u.id} className="shadow-card rounded-xl border-border">
              <CardContent className="p-4 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-card-foreground truncate">{u.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {u.roles.length === 0 && (
                      <Badge variant="outline" className="text-[10px]">Sem perfil</Badge>
                    )}
                    {u.roles.map((r) => (
                      <Badge key={r} variant="secondary" className="text-[10px] gap-1">
                        <Shield className="h-3 w-3" />
                        {ROLE_LABELS[r]}
                      </Badge>
                    ))}
                    {u.unit_ids.length > 0 && (
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <Building2 className="h-3 w-3" />
                        {u.unit_ids.length} unidade(s)
                      </Badge>
                    )}
                  </div>
                </div>
                <Button variant="outline" size="sm" className="rounded-xl shrink-0" onClick={() => openEdit(u)}>
                  Editar
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">{editing?.full_name}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-3">
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4" /> Perfis
                </Label>
                <div className="space-y-2 border border-border rounded-xl p-3 bg-muted/30">
                  {ROLE_OPTIONS.map((r) => (
                    <div key={r.value} className="flex items-center gap-2">
                      <Checkbox
                        id={`role-${r.value}`}
                        checked={draftRoles.includes(r.value)}
                        onCheckedChange={() => toggleRole(r.value)}
                      />
                      <Label htmlFor={`role-${r.value}`} className="text-sm cursor-pointer">
                        {r.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium flex items-center gap-2 mb-2">
                  <Building2 className="h-4 w-4" /> Unidades vinculadas
                </Label>
                <div className="space-y-2 border border-border rounded-xl p-3 bg-muted/30 max-h-48 overflow-y-auto">
                  {units.filter((u) => u.active).length === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhuma unidade cadastrada.</p>
                  )}
                  {units.filter((u) => u.active).map((u) => (
                    <div key={u.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`unit-${u.id}`}
                        checked={draftUnits.includes(u.id)}
                        onCheckedChange={() => toggleUnit(u.id)}
                      />
                      <Label htmlFor={`unit-${u.id}`} className="text-sm cursor-pointer">
                        {u.name}
                      </Label>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Vazio = acesso a todas (conforme perfil).
                </p>
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button className="rounded-xl" onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
