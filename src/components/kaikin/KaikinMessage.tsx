import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { KaikinMessage as Msg } from './KaikinProvider';
import { Sparkles } from 'lucide-react';

export function KaikinMessage({ message }: { message: Msg }) {
  const isUser = message.role === 'user';
  return (
    <div className={cn('flex gap-2', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-primary-foreground">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
      )}
      <div
        className={cn(
          'rounded-2xl px-3 py-2 text-sm max-w-[85%] break-words',
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-sm'
            : 'bg-muted text-foreground rounded-bl-sm'
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : message.content ? (
          <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-li:my-0 prose-headings:font-heading">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        ) : (
          <span className="inline-flex gap-1 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" />
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:120ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:240ms]" />
          </span>
        )}
      </div>
    </div>
  );
}
