import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Mail, Lock, Eye, EyeOff, Loader2, ArrowLeft, AlertTriangle } from 'lucide-react';
import { errorMessage } from '@/lib/utils';
import { APP_VERSION } from '@/lib/appEnv';

const REMEMBER_KEY = 'letsfinance:remembered-email';

export default function Login() {
  const saved = typeof window !== 'undefined' ? localStorage.getItem(REMEMBER_KEY) : null;
  const [email, setEmail] = useState(saved ?? '');
  const [remember, setRemember] = useState(!!saved);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [isForgot, setIsForgot] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isForgot) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast({ title: 'Email enviado!', description: 'Verifique sua caixa de entrada.' });
        setIsForgot(false);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (remember) localStorage.setItem(REMEMBER_KEY, email);
        else localStorage.removeItem(REMEMBER_KEY);
        navigate('/');
      }
    } catch (err: unknown) {
      toast({ title: 'Erro', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const checkCaps = (e: React.KeyboardEvent<HTMLInputElement>) =>
    setCapsLock(e.getModifierState?.('CapsLock') ?? false);

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4">
      <div aria-hidden className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-secondary/15 blur-3xl" />

      <div className="relative w-full max-w-sm">
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
          <div className="h-1.5 bg-gradient-to-r from-primary via-accent to-secondary" />
          <div className="space-y-6 p-6 sm:p-8">
            <div className="flex flex-col items-center gap-2 text-center">
              <img src="/logo-horizontal.png" alt="Let's Cookies" className="h-14 object-contain" />
              <h1 className="font-heading text-xl font-bold text-card-foreground">
                {isForgot ? 'Recuperar senha' : 'Bem-vindo ao Let\'s Finance'}
              </h1>
              <p className="text-sm text-muted-foreground">
                {isForgot
                  ? 'Informe seu e-mail para receber o link de redefinição.'
                  : 'Entre com seu e-mail e senha para continuar.'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <fieldset disabled={loading} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="email" type="email" autoComplete="email" placeholder="seu@email.com"
                      value={email} onChange={(e) => setEmail(e.target.value)}
                      className="h-11 pl-10" required />
                  </div>
                </div>

                {!isForgot && (
                  <div className="space-y-2">
                    <Label htmlFor="password">Senha</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password"
                        placeholder="••••••••" value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyUp={checkCaps} onKeyDown={checkCaps} onBlur={() => setCapsLock(false)}
                        className="h-11 pl-10 pr-10" required minLength={6} />
                      <button type="button" onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {capsLock && (
                      <p className="flex items-center gap-1.5 text-xs font-medium text-accent">
                        <AlertTriangle className="h-3.5 w-3.5" /> Caps Lock está ativado
                      </p>
                    )}
                  </div>
                )}

                {!isForgot && (
                  <div className="flex items-center justify-between text-sm">
                    <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
                      <Checkbox checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
                      Lembrar meu e-mail
                    </label>
                    <button type="button" onClick={() => setIsForgot(true)}
                      className="font-medium text-secondary hover:underline">
                      Esqueci a senha
                    </button>
                  </div>
                )}

                <Button type="submit" className="h-11 w-full rounded-xl text-base">
                  {loading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Aguarde...</>)
                    : isForgot ? 'Enviar link de recuperação' : 'Entrar'}
                </Button>

                {isForgot && (
                  <button type="button" onClick={() => setIsForgot(false)}
                    className="mx-auto flex items-center gap-1.5 text-sm font-medium text-secondary hover:underline">
                    <ArrowLeft className="h-4 w-4" /> Voltar ao login
                  </button>
                )}
              </fieldset>
            </form>
          </div>
        </div>

        <div className="mt-6 space-y-1 text-center text-xs text-muted-foreground">
          <p>Problemas no acesso? Fale com o administrador ou suporte.</p>
          <p>Let's Finance · v{APP_VERSION}</p>
        </div>
      </div>
    </div>
  );
}
