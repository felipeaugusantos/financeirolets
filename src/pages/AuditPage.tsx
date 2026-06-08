import { useNavigate } from 'react-router-dom';
import AuditSettings from './settings/AuditSettings';
import { useCurrentUserRoles } from '@/hooks/useUserRoles';

export default function AuditPage() {
  const navigate = useNavigate();
  const { isAdmin, loading } = useCurrentUserRoles();
  if (loading) return null;
  if (!isAdmin) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Acesso restrito a administradores.
      </div>
    );
  }
  return <AuditSettings onBack={() => navigate('/')} />;
}