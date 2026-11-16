import { useEffect, useState } from 'react';
import { Armchair, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

// Faixa no topo da conversa quando o Bot de Lounges parou ou pediu a equipe:
// • pausado (pedido de estorno, M19): o bot não responde até alguém reativar aqui;
// • atendimento_equipe (pagamento por fora M16, dúvida com lounge pago M18).

type Estado = { pausado: boolean; pausado_motivo: string | null; pausado_em: string | null; atendimento_equipe: boolean };

const quando = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

export function BotLoungesAviso({ telefone }: { telefone: string }) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let vivo = true;
    setEstado(null);
    (supabase as any).from('lagun_bot_lounges_conversas')
      .select('pausado, pausado_motivo, pausado_em, atendimento_equipe').eq('telefone', telefone).maybeSingle()
      .then(({ data }: { data: Estado | null }) => { if (vivo) setEstado(data ?? null); });
    return () => { vivo = false; };
  }, [telefone]);

  if (!estado || (!estado.pausado && !estado.atendimento_equipe)) return null;

  async function atualizar(patch: Partial<Estado>, ok: string) {
    setSalvando(true);
    const { error } = await (supabase as any).from('lagun_bot_lounges_conversas').update(patch).eq('telefone', telefone);
    setSalvando(false);
    if (error) { toast.error('Não deu para atualizar: ' + error.message); return; }
    setEstado((e) => (e ? { ...e, ...patch } : e));
    toast.success(ok);
  }

  const pausado = estado.pausado;
  return (
    <div className="flex items-center gap-3 border-b border-amber-300/60 bg-amber-50 px-4 py-2.5 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <Armchair className="h-4 w-4 shrink-0" />
      <p className="flex-1 text-xs leading-snug">
        {pausado
          ? <><b>Bot de lounges pausado</b>{estado.pausado_motivo === 'estorno' ? ' · estorno pedido' : ''}{estado.pausado_em ? ` em ${quando(estado.pausado_em)}` : ''}. Ele não responde essa pessoa até você reativar.</>
          : <><b>Bot de lounges pediu a equipe</b> nessa conversa. Se houver Pix aberto, ele fica travado até marcar como resolvido.</>}
      </p>
      <Button
        size="sm" variant="outline" disabled={salvando} className="h-7 shrink-0 bg-white text-xs dark:bg-transparent"
        onClick={() => pausado
          ? atualizar({ pausado: false, pausado_motivo: null, pausado_em: null, atendimento_equipe: false }, 'Bot de lounges reativado')
          : atualizar({ atendimento_equipe: false }, 'Marcado como resolvido')}
      >
        {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : pausado ? 'Reativar bot' : 'Resolvido'}
      </Button>
    </div>
  );
}
