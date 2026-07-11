import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';

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
 *
 * Implementado com @radix-ui/react-alert-dialog (não uma div solta) de propósito:
 * quando chamado de dentro de outro Dialog Radix (ex: detalhe de uma tarefa),
 * o Dialog pai desativa pointer-events do resto da árvore enquanto aberto — um
 * overlay customizado fora do sistema de camadas do Radix fica visível mas
 * não recebe cliques. O AlertDialog do Radix se registra nesse mesmo sistema
 * de camadas, então funciona corretamente aninhado.
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

  if (!pending) return null;
  const { title, description, confirmText, cancelText, destructive } = pending.options;

  return (
    <AlertDialog open onOpenChange={(open) => { if (!open) close(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              destructive ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
            }`}
          >
            <AlertTriangle size={17} />
          </div>
          <div className="min-w-0">
            <AlertDialogTitle>{title || 'Confirmar ação'}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => close(false)}>{cancelText || 'Cancelar'}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => close(true)}
            className={destructive ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
          >
            {confirmText || 'Confirmar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
