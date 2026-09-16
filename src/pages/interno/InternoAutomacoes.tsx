import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Bot, Copy, Instagram, KeyRound, Loader2, MoreVertical, Plus, RefreshCw, Search, Trash2, Zap, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import {
  OBJECTIVE_LABELS, TEMPLATES, TRIGGER_LABELS, compileForEngine, fromEngine, fmtDateTime, fmtNumber,
  type Automation, type Objective, type Stat, type Template, type TriggerType,
} from '@/lib/igAutomations';

const db = supabase as any;

// Cor por gatilho (mesma paleta dos ícones do painel).
const TRIGGER_STYLE: Record<TriggerType, string> = {
  comment_feed: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  comment_live: 'bg-red-500/15 text-red-600 dark:text-red-400',
  dm: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  story_reply: 'bg-pink-500/15 text-pink-600 dark:text-pink-400',
  story_mention: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
};
export const TriggerPill = ({ t }: { t: TriggerType }) => (
  <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-semibold ${TRIGGER_STYLE[t]}`}>{TRIGGER_LABELS[t]}</span>
);
const STATUS = {
  active: { label: 'Ativa', cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  paused: { label: 'Pausada', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  draft: { label: 'Rascunho', cls: 'bg-muted text-muted-foreground' },
} as const;
const dash = (n: number) => (n ? fmtNumber(n) : '—');

interface Connection { ig_user_id: string | null; username: string | null; profile_pic_url: string | null; token_expires_at: string | null; connected: boolean }

/** Métricas por automação a partir das tabelas do motor (volumes pequenos, agrega no cliente). */
export async function loadStats(ids: string[]): Promise<Record<string, Stat>> {
  const empty = (): Stat => ({ triggers: 0, public_replies: 0, dms: 0, failed: 0, links: 0, clicks: 0, clicked_people: 0 });
  const out: Record<string, Stat> = {};
  if (!ids.length) return out;
  ids.forEach((id) => { out[id] = empty(); });
  const [ev, q, links] = await Promise.all([
    db.from('ig_events').select('automation_id').in('automation_id', ids).limit(5000),
    db.from('ig_queue').select('automation_id, send_type, status').in('automation_id', ids).limit(5000),
    db.from('ig_links').select('automation_id, igsid, clicks').in('automation_id', ids).limit(5000),
  ]);
  for (const r of ev.data ?? []) out[r.automation_id].triggers++;
  for (const r of q.data ?? []) {
    const s = out[r.automation_id];
    if (r.status === 'failed') s.failed++;
    if (r.status !== 'sent') continue;
    if (r.send_type === 'public_reply') s.public_replies++; else s.dms++;
  }
  const people: Record<string, Set<string>> = {};
  for (const r of links.data ?? []) {
    const s = out[r.automation_id]; s.links++; s.clicks += r.clicks || 0;
    if (r.clicks > 0) (people[r.automation_id] ??= new Set()).add(r.igsid);
  }
  for (const id of ids) out[id].clicked_people = people[id]?.size ?? 0;
  return out;
}

export function TemplatesDialog({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (t?: Template) => void }) {
  const [query, setQuery] = useState('');
  const [objective, setObjective] = useState<Objective | ''>('');
  const [trigger, setTrigger] = useState<TriggerType | ''>('');
  const list = useMemo(() => TEMPLATES.filter((t) =>
    (!objective || t.objective === objective) && (!trigger || t.triggers.includes(trigger)) &&
    (!query || `${t.name} ${t.description}`.toLowerCase().includes(query.toLowerCase()))), [query, objective, trigger]);
  const Side = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
    <button onClick={onClick} className={`rounded-lg px-3 py-1.5 text-left text-sm ${active ? 'bg-[#E8C766]/15 font-semibold text-foreground' : 'text-muted-foreground hover:bg-muted'}`}>{label}</button>
  );
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl h-[88vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b flex-row items-center justify-between space-y-0">
          <DialogTitle>Modelos de automação</DialogTitle>
          <Button variant="outline" size="sm" onClick={() => onPick(undefined)} className="mr-8"><Plus size={14} className="mr-1" /> Começar do zero</Button>
        </DialogHeader>
        <div className="px-6 pt-4">
          <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar modelo…" className="pl-9" /></div>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[200px_1fr] gap-5 px-6 py-4">
          <aside className="flex flex-col gap-0.5 overflow-y-auto pr-1">
            <Side label="Todos os modelos" active={!objective && !trigger} onClick={() => { setObjective(''); setTrigger(''); }} />
            <p className="mt-3 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Objetivo</p>
            {(Object.keys(OBJECTIVE_LABELS) as Objective[]).map((o) => <Side key={o} label={OBJECTIVE_LABELS[o]} active={objective === o} onClick={() => setObjective(objective === o ? '' : o)} />)}
            <p className="mt-3 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Gatilho</p>
            {(Object.keys(TRIGGER_LABELS) as TriggerType[]).map((x) => <Side key={x} label={TRIGGER_LABELS[x]} active={trigger === x} onClick={() => setTrigger(trigger === x ? '' : x)} />)}
          </aside>
          <div className="min-h-0 overflow-y-auto pr-1">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {list.map((t) => (
                <button key={t.key} onClick={() => onPick(t)} className="flex min-h-[190px] flex-col rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-[#E8C766] hover:shadow-sm">
                  <span className="mb-2 w-fit rounded-full bg-[#E8C766]/15 px-2 py-0.5 text-[11px] font-semibold text-foreground">{OBJECTIVE_LABELS[t.objective]}</span>
                  <strong className="text-[15px] leading-snug">{t.name}</strong>
                  <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
                  <div className="mt-auto pt-3 flex flex-wrap gap-1">{t.triggers.map((x) => <TriggerPill key={x} t={x} />)}</div>
                  {t.keywords?.length ? <p className="mt-2 text-[11px] text-muted-foreground">Palavras-chave: {t.keywords.join(', ')}</p> : null}
                  {t.popular && <span className="mt-2 w-fit rounded bg-[#E8C766] px-1.5 py-0.5 text-[10px] font-bold uppercase text-black">Popular</span>}
                </button>
              ))}
              {!list.length && <p className="col-span-3 py-16 text-center text-sm text-muted-foreground">Nenhum modelo encontrado.</p>}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConnectionCard({ onChanged }: { onChanged: () => void }) {
  const { isAdmin } = useAuth();
  const [conn, setConn] = useState<Connection | null | undefined>(undefined);
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [busy, setBusy] = useState<'' | 'token' | 'backfill'>('');
  const base = import.meta.env.VITE_SUPABASE_URL;

  const load = useCallback(async () => {
    const { data } = await db.rpc('ig_connection_status');
    setConn((data?.[0] as Connection) ?? null);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const call = async (body: Record<string, unknown>) => {
    const session = (await supabase.auth.getSession()).data.session;
    const r = await fetch(`${base}/functions/v1/ig-oauth`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok || j.error) throw new Error(j.error || 'Falha');
    return j;
  };
  const saveToken = async () => {
    setBusy('token');
    try { const j = await call({ action: 'set_token', token: token.trim() }); toast.success(`Instagram @${j.username} conectado. Preenchendo perfis das DMs em segundo plano…`); setToken(''); setShowToken(false); await load(); onChanged(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível salvar o token.'); }
    finally { setBusy(''); }
  };
  const backfill = async () => {
    setBusy('backfill');
    try { const j = await call({ action: 'backfill' }); toast.success(`Perfis atualizados: ${j.atualizados} de ${j.contatos} contatos.`); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Falha ao atualizar perfis.'); }
    finally { setBusy(''); }
  };

  if (conn === undefined) return null;
  const expira = conn?.token_expires_at ? new Date(conn.token_expires_at) : null;
  const diasRestantes = expira ? Math.round((expira.getTime() - Date.now()) / 86400000) : null;
  return (
    <div className={`rounded-xl border p-4 flex flex-wrap items-center gap-4 ${conn?.connected ? 'border-border bg-card' : 'border-sky-500/40 bg-sky-500/5'}`}>
      {conn?.profile_pic_url ? <img src={conn.profile_pic_url} alt="" className="h-11 w-11 rounded-full object-cover" /> : <div className="h-11 w-11 rounded-full bg-[#E4405F]/15 flex items-center justify-center text-[#E4405F]"><Instagram size={20} /></div>}
      <div className="min-w-0 flex-1">
        {conn?.connected ? (
          <>
            <p className="font-semibold">@{conn.username} conectado (Instagram Login)</p>
            <p className="text-xs text-muted-foreground">Tudo disponível: comentários, DMs e nome/@/foto de quem escreve · token renovado toda semana, válido por mais {diasRestantes} dias</p>
          </>
        ) : (
          <>
            {/* Sem o token do Instagram Login o motor cai no System User do app
                Lagun — suficiente para comentário → DM, mas sem perfil de terceiros. */}
            <p className="font-semibold">Rodando com o token do app Lagun (System User)</p>
            <p className="text-xs text-muted-foreground">As automações disparam normalmente. O que falta é só o <strong>nome, @ e foto</strong> de quem manda DM (aparece o número no Chat) — conecte pelo Instagram Login para completar.</p>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant={conn?.connected ? 'outline' : 'default'} size="sm">
          <a href={`${base}/functions/v1/ig-oauth`}><Instagram size={14} className="mr-1.5" />{conn?.connected ? 'Reconectar' : 'Conectar Instagram'}</a>
        </Button>
        {isAdmin && <Button variant="outline" size="sm" onClick={() => setShowToken((v) => !v)}><KeyRound size={14} className="mr-1.5" /> Colar token</Button>}
        {conn?.connected && <Button variant="ghost" size="sm" onClick={backfill} disabled={busy === 'backfill'} title="Preenche @, nome e foto das DMs antigas no Chat">{busy === 'backfill' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}<span className="ml-1.5">Atualizar perfis das DMs</span></Button>}
      </div>
      {showToken && (
        <div className="w-full flex flex-col sm:flex-row gap-2 pt-2 border-t border-border">
          <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Cole aqui o token (começa com IGAA…) gerado em Meta → Instagram → API setup with Instagram login" className="font-mono text-xs" />
          <Button size="sm" onClick={saveToken} disabled={busy === 'token' || !token.trim()}>{busy === 'token' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}<span className="ml-1.5">Salvar</span></Button>
        </div>
      )}
    </div>
  );
}

export default function InternoAutomacoes() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<Automation[]>([]);
  const [stats, setStats] = useState<Record<string, Stat>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [modal, setModal] = useState(params.get('novo') === '1');
  const [menu, setMenu] = useState('');
  const [filtro, setFiltro] = useState<'all' | Automation['status']>('all');
  const [busca, setBusca] = useState('');

  useEffect(() => {
    if (params.get('conectado') === '1') { toast.success('Instagram conectado! Os perfis das DMs estão sendo preenchidos.'); setParams({}); }
    const erro = params.get('erro');
    if (erro) { toast.error(`Falha ao conectar o Instagram: ${erro}`); setParams({}); }
  }, [params, setParams]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await db.from('ig_automations').select('*').order('updated_at', { ascending: false });
    if (error) { toast.error(error.message); setLoading(false); return; }
    const list: Automation[] = (data || []).map((r: any) => ({ ...r, definition: r.definition?.trigger ? r.definition : fromEngine(r) }));
    setRows(list);
    setStats(await loadStats(list.map((a) => a.id)));
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!menu) return; const f = () => setMenu(''); window.addEventListener('click', f); return () => window.removeEventListener('click', f); }, [menu]);

  const { data: authData } = { data: null } as any; // (created_by opcional)
  void authData;

  const create = async (template?: Template) => {
    const definition = template ? { ...template.build(), objective: template.objective } : undefined;
    const name = template?.name || 'Nova automação';
    const compiled = definition ? compileForEngine({ name, status: 'draft', definition }).payload : { name, status: 'draft', active: false, definition: {} };
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await db.from('ig_automations').insert({ ...compiled, description: template?.description || null, template_key: template?.key || null, created_by: user?.id ?? null }).select().single();
    if (error) { toast.error(error.message); return; }
    setModal(false); setParams({}); navigate(`/interno/automacoes/${data.id}`);
  };
  const duplicate = async (a: Automation) => {
    const compiled = compileForEngine({ name: `${a.name} (cópia)`, status: 'draft', definition: a.definition }).payload;
    const { data, error } = await db.from('ig_automations').insert({ ...compiled, description: a.description || null, template_key: a.template_key || null }).select().single();
    if (error) { toast.error(error.message); return; }
    toast.success('Rascunho duplicado.'); navigate(`/interno/automacoes/${data.id}`);
  };
  const toggle = async (a: Automation) => {
    const status = a.status === 'active' ? 'paused' : 'active';
    setBusy(a.id);
    const { error } = await db.from('ig_automations').update({ status, active: status === 'active', updated_at: new Date().toISOString() }).eq('id', a.id);
    if (error) toast.error(error.message); else { toast.success(status === 'active' ? 'Automação ativada.' : 'Automação pausada.'); await load(); }
    setBusy('');
  };
  const remove = async (a: Automation) => {
    if (!window.confirm(`Excluir "${a.name}"?${a.status === 'active' ? ' Ela está ativa e vai parar de responder na hora.' : ''}`)) return;
    setBusy(a.id);
    const { error } = await db.from('ig_automations').delete().eq('id', a.id);
    if (error) toast.error(error.message); else { toast.success('Automação excluída.'); await load(); }
    setBusy('');
  };

  const total = rows.reduce((acc, a) => { const s = stats[a.id]; return { triggers: acc.triggers + (s?.triggers || 0), dms: acc.dms + (s?.dms || 0), clicks: acc.clicks + (s?.clicks || 0) }; }, { triggers: 0, dms: 0, clicks: 0 });
  const ativas = rows.filter((r) => r.status === 'active').length;
  const conta = (st: Automation['status']) => rows.filter((r) => r.status === st).length;
  const lista = rows.filter((a) => (filtro === 'all' || a.status === filtro) && (!busca || `${a.name} ${a.description || ''} ${(a.definition?.trigger?.keywords || []).join(' ')}`.toLowerCase().includes(busca.toLowerCase())));
  const Pill = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button onClick={onClick} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${on ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`}>{children}</button>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Automações do Instagram</h2>
          <p className="text-sm text-muted-foreground">Respostas automáticas a comentários, directs e stories do @lagunvix — no estilo ManyChat, rodando aqui dentro.</p>
        </div>
        <Button onClick={() => setModal(true)} className="bg-[#E8C766] text-black hover:bg-[#d9b854]"><Plus size={16} className="mr-1.5" /> Nova automação</Button>
      </div>

      <ConnectionCard onChanged={load} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[['Ativas', String(ativas), `${rows.length} no total`], ['Disparos', dash(total.triggers), 'comentários e directs captados'], ['DMs enviadas', dash(total.dms), total.triggers ? `${Math.round((total.dms / total.triggers) * 100)}% dos disparos` : 'aguardando disparos'], ['Cliques no link', dash(total.clicks), total.dms ? `CTR de ${Math.round((total.clicks / total.dms) * 100)}%` : 'links rastreados']].map(([l, v, sub]) => (
          <div key={l} className="rounded-xl border border-border bg-card p-4"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{l}</p><p className="mt-1 text-2xl font-bold">{v}</p><p className="text-xs text-muted-foreground">{sub}</p></div>
        ))}
      </div>

      {loading ? <div className="flex justify-center py-16"><Loader2 className="animate-spin text-muted-foreground" /></div> : !rows.length ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <Bot className="mx-auto mb-3 text-muted-foreground" size={36} />
          <p className="font-semibold">Nenhuma automação ainda</p>
          <p className="text-sm text-muted-foreground mt-1">Escolha um modelo pronto ou comece do zero. Em minutos o Instagram responde sozinho.</p>
          <Button variant="outline" className="mt-4" onClick={() => setModal(true)}><Plus size={14} className="mr-1.5" /> Escolher um modelo</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-0.5 rounded-full border border-border bg-card p-1">
              <Pill on={filtro === 'all'} onClick={() => setFiltro('all')}>Todas · {rows.length}</Pill>
              <Pill on={filtro === 'active'} onClick={() => setFiltro('active')}>Ativas · {conta('active')}</Pill>
              <Pill on={filtro === 'draft'} onClick={() => setFiltro('draft')}>Rascunhos · {conta('draft')}</Pill>
              <Pill on={filtro === 'paused'} onClick={() => setFiltro('paused')}>Pausadas · {conta('paused')}</Pill>
            </div>
            <div className="relative w-72"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar automação ou palavra-chave" className="pl-9 h-9" /></div>
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="overflow-x-auto"><div className="min-w-[860px]">
              <div className="grid grid-cols-[2.2fr_1.4fr_.7fr_.7fr_.7fr_1fr_150px] items-center gap-4 border-b border-border px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><span>Automação</span><span>Gatilho</span><span>Disparos</span><span>DMs</span><span>Cliques</span><span>Atualizada</span><span /></div>
              {lista.map((a) => { const st = STATUS[a.status]; const d = a.definition; const s = stats[a.id]; const kws = d?.trigger?.keywords || []; return (
                <div key={a.id} role="button" tabIndex={0} onClick={() => navigate(`/interno/automacoes/${a.id}`)} onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/interno/automacoes/${a.id}`); }} className="grid cursor-pointer grid-cols-[2.2fr_1.4fr_.7fr_.7fr_.7fr_1fr_150px] items-center gap-4 border-b border-border px-5 py-4 transition-colors last:border-0 hover:bg-muted/40">
                  <div className="flex min-w-0 items-center gap-3"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${a.status === 'active' ? 'bg-[#E8C766]/20 text-[#b8952f]' : 'bg-muted text-muted-foreground'}`}><Zap size={16} /></span><div className="min-w-0"><div className="flex items-center gap-2"><span className="truncate text-sm font-semibold">{a.name}</span><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${st.cls}`}>{st.label}</span></div><div className="mt-0.5 truncate text-xs text-muted-foreground">{a.description || `${d?.nodes?.length || 0} etapas · ${d?.trigger?.match === 'exact' ? 'correspondência exata' : d?.trigger?.match === 'any' ? 'qualquer mensagem' : 'contém a palavra'}`}</div></div></div>
                  <div className="flex min-w-0 flex-col gap-1"><span className="truncate text-xs font-medium">{(d?.trigger?.types || []).map((x) => TRIGGER_LABELS[x]).join(' · ') || '—'}</span>{kws.length > 0 && <div className="flex flex-wrap gap-1">{kws.slice(0, 3).map((k) => <span key={k} className="rounded-full bg-[#E8C766]/15 px-2 py-0.5 text-[10px] font-medium">{k}</span>)}{kws.length > 3 && <span className="text-[10px] text-muted-foreground">+{kws.length - 3}</span>}</div>}</div>
                  <div className="text-base font-bold">{dash(s?.triggers || 0)}</div>
                  <div className="text-base font-bold">{dash(s?.dms || 0)}</div>
                  <div className="text-base font-bold">{dash(s?.clicks || 0)}</div>
                  <div className="text-xs text-muted-foreground">{fmtDateTime(a.updated_at)}</div>
                  <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                    <Button variant="outline" size="sm" onClick={() => navigate(`/interno/automacoes/${a.id}`)}>Editar</Button>
                    <Switch checked={a.status === 'active'} disabled={busy === a.id} onCheckedChange={() => void toggle(a)} aria-label={a.status === 'active' ? 'Pausar' : 'Ativar'} />
                    <div className="relative"><button onClick={() => setMenu(menu === a.id ? '' : a.id)} aria-label="Mais" className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-muted"><MoreVertical size={15} /></button>{menu === a.id && <div className="absolute right-0 top-9 z-20 w-40 rounded-lg border border-border bg-card p-1 shadow-lg"><button onClick={() => { setMenu(''); void duplicate(a); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted"><Copy size={14} /> Duplicar</button><button onClick={() => { setMenu(''); void remove(a); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-600 hover:bg-red-500/10"><Trash2 size={14} /> Excluir</button></div>}</div>
                  </div>
                </div>); })}
              {!lista.length && <p className="px-5 py-12 text-center text-sm text-muted-foreground">Nenhuma automação com esse filtro.</p>}
            </div></div>
          </div>
        </div>
      )}
      <TemplatesDialog open={modal} onClose={() => { setModal(false); setParams({}); }} onPick={(t) => void create(t)} />
      <X className="hidden" />
    </div>
  );
}
