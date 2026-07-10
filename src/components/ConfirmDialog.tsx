import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface ConfirmOptions {
  title?: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

type Pending = { options: ConfirmOptions; resolve: (ok: boolean) => void } | null;

let setPendingExternal: ((p: Pending) => void) | null = null;

/**
 * Substitui o window.confirm nativo por um modal com a identidade do sistema.
 * Uso: if (await confirmDialog({ description: '...', destructive: true })) { ... }
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!setPendingExternal) {
      // Host não montado (fallback improvável) — não bloqueia a ação
      resolve(window.confirm(options.description));
      return;
    }
    setPendingExternal({ options, resolve });
  });
}

export function ConfirmDialogHost() {
  const [pending, setPending] = useState<Pending>(null);

  useEffect(() => {
    setPendingExternal = setPending;
    return () => { setPendingExternal = null; };
  }, []);

  const close = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter') close(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending]);

  if (!pending) return null;
  const { title, description, confirmText, cancelText, destructive } = pending.options;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150"
        onClick={() => close(false)}
      />
      <div className="relative w-full max-w-sm rounded-md border border-border bg-popover p-5 shadow-xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              destructive
                ? 'bg-destructive/10 text-destructive'
                : 'bg-primary/10 text-primary'
            }`}
          >
            <AlertTriangle size={17} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">
              {title || 'Confirmar ação'}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => close(false)}>
            {cancelText || 'Cancelar'}
          </Button>
          <Button
            size="sm"
            variant={destructive ? 'destructive' : 'default'}
            onClick={() => close(true)}
          >
            {confirmText || 'Confirmar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
