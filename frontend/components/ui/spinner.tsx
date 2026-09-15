import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin', className)} aria-hidden />;
}

export function FullPageSpinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center py-16">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        {label}
      </span>
    </div>
  );
}
