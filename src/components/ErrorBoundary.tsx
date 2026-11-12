import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { reportFailureTicket } from '@/lib/helpdesk';
import { isChunkLoadError, reloadOnceForChunkError } from '@/lib/errorReport';

interface Props {
  children: ReactNode;
  /** Quando muda (ex.: a rota), o erro é limpo e a tela tenta renderizar de novo. */
  resetKey?: string;
  /** true: ocupa a tela toda (barreira externa); false: só a área de conteúdo. */
  fullScreen?: boolean;
}
interface State { error: Error | null }

/** Impede que um erro de render derrube o app inteiro; abre chamado automático (1 por erro/dia, nunca interrompe). */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
    if (isChunkLoadError(error)) {
      reloadOnceForChunkError();
      return;
    }
    void reportFailureTicket(
      'Erro inesperado na tela',
      error.message || error.name,
      (info.componentStack ?? '').split('\n').slice(0, 12).join('\n'),
    );
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const chunk = isChunkLoadError(error);
    return (
      <div
        role="alert"
        className={`flex flex-col items-center justify-center gap-3 p-8 text-center ${this.props.fullScreen ? 'min-h-screen bg-background' : 'min-h-[50vh]'}`}
      >
        <h2 className="text-lg font-semibold">{chunk ? 'Nova versão disponível' : 'Algo deu errado nesta tela'}</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          {chunk
            ? 'O sistema foi atualizado. Recarregue a página para continuar.'
            : 'Seus dados não foram alterados. Um chamado automático foi aberto para a equipe de suporte.'}
        </p>
        <div className="flex gap-2">
          <Button onClick={() => window.location.reload()}>Recarregar</Button>
          {!chunk && (
            <Button variant="outline" onClick={() => { window.location.href = '/'; }}>Ir para o início</Button>
          )}
        </div>
      </div>
    );
  }
}
