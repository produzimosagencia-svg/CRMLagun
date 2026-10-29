import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Pause, Play, RefreshCw, Send, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Progresso dos disparos em fila (whatsapp_disparo_jobs), no topo do Status
 * dos Disparos. Atualiza a cada 3 s pela RPC whatsapp_disparo_resumo, que junta
 * a fila com o status que a Meta devolve pelo webhook: o número anda contato a
 * contato e as falhas da Meta aparecem com o motivo, mesmo com a aba fechada
 * durante o envio. Disparos das últimas 48 h.
 */

type Motivo = { motivo: string; code: string | null; n: number; conta: string | null };
type Resumo = {
  job: { id: string; template_name: string; total: number; status: string; motivo_pausa: string | null; created_at: string; concluido_em: string | null };
  pendentes: number; aceitos: number; entregues: number; lidos: number; falhas: number; motivos: Motivo[];
};

const ROTULO: Record<string, { texto: string; cls: string }> = {
  na_fila: { texto: 'Na fila', cls: 'bg-white/5 text-[#D8D2C7]' },
  enviando: { texto: 'Enviando', cls: 'bg-[#FFE14D]/15 text-[#FFE14D]' },
  pausado: { texto: 'Pausado', cls: 'bg-[#FB923C]/15 text-[#FB923C]' },
  concluido: { texto: 'Concluído', cls: 'bg-emerald-500/10 text-emerald-400' },
  cancelado: { texto: 'Cancelado', cls: 'bg-white/5 text-[#8F8A7C]' },
};

export const acordarWorker = () =>
  supabase.functions.invoke('whatsapp-disparo-worker', { body: { source: 'tela' } }).catch(() => null);

function Cartao({ r, onMudou }: { r: Resumo; onMudou: () => void }) {
  const [agindo, setAgindo] = useState(false);
  const { job } = r;
  const processados = job.total - r.pendentes;
  const pct = job.total ? Math.round((processados / job.total) * 100) : 0;
  const ativo = job.status === 'na_fila' || job.status === 'enviando';
  const rotulo = ROTULO[job.status] ?? ROTULO.na_fila;

  async function controlar(acao: 'pausar' | 'retomar' | 'cancelar') {
    setAgindo(true);
    await (supabase as any).rpc('whatsapp_controlar_disparo', { p_job: job.id, p_acao: acao });
    if (acao === 'retomar') await acordarWorker();
    setAgindo(false);
    onMudou();
  }

  const numeros = [
    { rotulo: 'Na fila', valor: r.pendentes, cls: 'text-white' },
    { rotulo: 'Aceitos pela Meta', valor: r.aceitos, cls: 'text-[#FFE14D]' },
    { rotulo: 'Entregues', valor: r.entregues, cls: 'text-emerald-400' },
    { rotulo: 'Lidos', valor: r.lidos, cls: 'text-blue-400' },
    { rotulo: 'Falhas', valor: r.falhas, cls: 'text-red-400' },
  ];

  return (
    <section className={`rounded-xl border p-4 ${job.status === 'pausado' ? 'border-[#FB923C]/40 bg-[#FB923C]/[0.04]' : 'border-[#2A2822] bg-[#1A1916]'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {ativo ? <RefreshCw size={15} className="animate-spin text-[#FFE14D]" /> : job.status === 'concluido' ? <CheckCircle2 size={15} className="text-emerald-400" /> : <Send size={15} className="text-[#8F8A7C]" />}
            <p className="truncate text-sm font-semibold text-white">{job.template_name}</p>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${rotulo.cls}`}>{rotulo.texto}</span>
          </div>
          <p className="mt-0.5 text-xs text-[#8F8A7C]">
            {new Date(job.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · {processados.toLocaleString('pt-BR')} de {job.total.toLocaleString('pt-BR')} processados
          </p>
        </div>
        <div className="flex gap-2">
          {ativo && <button disabled={agindo} onClick={() => void controlar('pausar')} className="flex items-center gap-1 rounded-lg border border-[#2A2822] px-2.5 py-1.5 text-xs font-semibold text-[#D8D2C7] disabled:opacity-50"><Pause size={12} /> Pausar</button>}
          {job.status === 'pausado' && <button disabled={agindo} onClick={() => void controlar('retomar')} className="flex items-center gap-1 rounded-lg bg-[#FFE14D] px-2.5 py-1.5 text-xs font-bold text-[#17160f] disabled:opacity-50"><Play size={12} /> Retomar</button>}
          {(ativo || job.status === 'pausado') && <button disabled={agindo} onClick={() => void controlar('cancelar')} className="flex items-center gap-1 rounded-lg border border-[#2A2822] px-2.5 py-1.5 text-xs font-semibold text-[#8F8A7C] disabled:opacity-50"><X size={12} /> Cancelar</button>}
        </div>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/5">
        <div className="h-full rounded-full bg-[#FFE14D] transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>

      {job.status === 'pausado' && job.motivo_pausa && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-[#FB923C]/10 p-3 text-xs text-[#FED7AA]">
          <AlertTriangle size={14} className="mt-0.5 flex-none text-[#FB923C]" />
          <p>{job.motivo_pausa} {job.motivo_pausa.includes('Retome') || job.motivo_pausa.includes('retome') ? '' : 'Depois de resolver, toque em Retomar: quem falhou por esse motivo volta para a fila.'}</p>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {numeros.map((n) => (
          <div key={n.rotulo} className="rounded-lg bg-white/[0.03] px-3 py-2">
            <p className={`text-lg font-bold tabular-nums ${n.cls}`}>{n.valor.toLocaleString('pt-BR')}</p>
            <p className="text-[11px] text-[#8F8A7C]">{n.rotulo}</p>
          </div>
        ))}
      </div>

      {r.motivos.length > 0 && (
        <div className="mt-3 space-y-1">
          {r.motivos.map((m) => (
            <p key={`${m.code}-${m.motivo}`} className="flex items-center justify-between gap-3 text-xs">
              <span className="min-w-0 truncate text-[#D8D2C7]">{m.conta ?? m.motivo}{m.code ? <span className="text-[#8F8A7C]"> · código {m.code}</span> : null}</span>
              <span className="flex-none tabular-nums text-red-400">{m.n.toLocaleString('pt-BR')}</span>
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

export function DisparoProgresso({ versao = 0 }: { versao?: number }) {
  const [resumos, setResumos] = useState<Resumo[]>([]);

  const carregar = useCallback(async () => {
    const desde = new Date(Date.now() - 48 * 3600_000).toISOString();
    const { data: jobs } = await (supabase as any).from('whatsapp_disparo_jobs').select('id, status')
      .gte('created_at', desde).order('created_at', { ascending: false }).limit(5);
    const lista = await Promise.all(((jobs ?? []) as { id: string }[]).map(async (j) =>
      ((await (supabase as any).rpc('whatsapp_disparo_resumo', { p_job: j.id })).data ?? null) as Resumo | null));
    setResumos(lista.filter((x): x is Resumo => !!x?.job));
  }, []);

  useEffect(() => {
    void carregar();
    const t = setInterval(() => void carregar(), 3000);
    return () => clearInterval(t);
  }, [carregar, versao]);

  // Enquanto houver disparo ativo, a tela também acorda o worker (além do cron).
  const ativo = resumos.some((r) => r.job.status === 'na_fila' || r.job.status === 'enviando');
  useEffect(() => {
    if (!ativo) return;
    const t = setInterval(() => void acordarWorker(), 20_000);
    return () => clearInterval(t);
  }, [ativo]);

  if (!resumos.length) return null;
  return <div className="space-y-3">{resumos.map((r) => <Cartao key={r.job.id} r={r} onMudou={() => void carregar()} />)}</div>;
}
