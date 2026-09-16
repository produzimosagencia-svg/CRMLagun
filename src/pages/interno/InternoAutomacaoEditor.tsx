import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Bot, Check, Clock, GitBranch, Link2, Loader2, MessageCircle, MessageSquareText, Pencil, Plus, Power, Sparkles, Tag, Target, Trash2, X, Zap, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { NODE_LABELS, TRIGGER_LABELS, compileForEngine, emptyDefinition, fromEngine, uid, fmtNumber, type Automation, type Definition, type FlowNode, type Stat, type TriggerType } from '@/lib/igAutomations';
import { loadStats } from './InternoAutomacoes';

const db = supabase as any;
const LAGUN_IG_ID = '17841436376156784';
type Media = { id: string; caption?: string; thumbnail_url?: string; media_url?: string; timestamp: string; permalink?: string; media_type?: string };
type LinkRow = { slug: string; igsid: string; clicks: number; last_click_at: string | null; created_at: string; username?: string | null };

const NODE_ICON: Record<FlowNode['type'], LucideIcon> = { dm: MessageCircle, public_reply: MessageSquareText, link: Link2, delay: Clock, reminder: Clock, ask: Sparkles, condition: GitBranch, tag: Tag };
const NODE_COLOR: Record<FlowNode['type'], string> = { dm: '#7C3AED', public_reply: '#16A34A', link: '#2563EB', delay: '#B45309', reminder: '#B45309', ask: '#C026D3', condition: '#374151', tag: '#6B7280' };
const NODE_HINT: Record<FlowNode['type'], string> = {
  dm: 'Mensagem enviada no direct de quem interagiu. Pode ter um botão de resposta rápida.',
  public_reply: 'Responde ao comentário na própria publicação. Uma variação é sorteada por vez.',
  link: 'Cada pessoa recebe um link curto próprio (lagunvitoria.com.br/l/…) — é assim que sabemos quem clicou.',
  delay: 'Espera antes de seguir. (Ainda não executado pelo motor.)',
  reminder: 'Mensagem enviada depois de um tempo para quem recebeu o link.',
  ask: 'Faz uma pergunta e guarda a resposta. (Ainda não executado pelo motor.)',
  condition: 'Só entrega o link se a condição for verdadeira.',
  tag: 'Marca o contato com uma etiqueta. (Ainda não executado pelo motor.)',
};
const newNode = (type: FlowNode['type']): FlowNode => ({
  dm: { id: uid(), type: 'dm', text: '' }, public_reply: { id: uid(), type: 'public_reply', variants: [''] },
  link: { id: uid(), type: 'link', text: '', label: 'Abrir', url: 'https://' }, delay: { id: uid(), type: 'delay', minutes: 60 },
  reminder: { id: uid(), type: 'reminder', minutes: 120, text: '' }, ask: { id: uid(), type: 'ask', question: '', save_as: 'whatsapp', confirm: '' },
  condition: { id: uid(), type: 'condition', check: 'follows_you', yes_text: '', no_text: '' }, tag: { id: uid(), type: 'tag', tag: '' },
} as Record<FlowNode['type'], FlowNode>)[type];
const summary = (n: FlowNode) => n.type === 'dm' ? n.text : n.type === 'public_reply' ? n.variants.filter(Boolean).join(' / ') : n.type === 'link' ? n.text : n.type === 'delay' ? `Aguardar ${n.minutes} min` : n.type === 'reminder' ? `Após ${n.minutes} min: ${n.text}` : n.type === 'ask' ? n.question : n.type === 'condition' ? ({ follows_you: 'Só se a pessoa seguir a conta', is_customer: 'Só se já comprou', has_whatsapp: 'Só se tem WhatsApp salvo' }[n.check]) : `#${n.tag}`;
const legendaMidia = (m?: Media) => m ? `${m.media_type === 'VIDEO' || m.media_type === 'REELS' ? 'Reels' : 'Post'} · "${(m.caption || 'sem legenda').split('\n')[0].slice(0, 42)}${(m.caption || '').length > 42 ? '…' : ''}"` : 'Todas as publicações';

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="flex flex-col gap-1.5"><span className="text-xs font-semibold">{label}</span>{children}</label>;
const Eyebrow = ({ children }: { children: React.ReactNode }) => <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</div>;
const badgeCls = (s: Automation['status']) => s === 'active' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : s === 'paused' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : 'bg-muted text-muted-foreground';

async function callInstagram(action: string, params: Record<string, string> = {}) {
  const session = (await supabase.auth.getSession()).data.session;
  if (!session) throw new Error('Sessão expirada.');
  const query = new URLSearchParams({ action, ...params });
  const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram-api?${query}`, { headers: { Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error?.message || j.error || 'Falha ao consultar o Instagram.');
  return j;
}

export default function InternoAutomacaoEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [auto, setAuto] = useState<Automation | null>(null);
  const [def, setDef] = useState<Definition>(emptyDefinition());
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string | 'trigger'>('trigger');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [media, setMedia] = useState<Media[]>([]);
  const [keyword, setKeyword] = useState('');
  const [menuAdd, setMenuAdd] = useState(false);
  const [editandoNome, setEditandoNome] = useState(false);
  const [stats, setStats] = useState<Stat | null>(null);
  const [links, setLinks] = useState<LinkRow[]>([]);

  useEffect(() => {
    void (async () => {
      const { data } = await db.from('ig_automations').select('*').eq('id', id).maybeSingle();
      if (!data) { navigate('/interno/automacoes'); return; }
      const d: Definition = data.definition?.trigger ? data.definition : fromEngine(data);
      setAuto({ ...data, definition: d }); setName(data.name); setDef(d);
      setSelected(d.nodes.length ? d.nodes[d.nodes.length - 1].id : 'trigger');
      setStats((await loadStats([data.id]))[data.id] ?? null);
      const { data: l } = await db.from('ig_links').select('slug, igsid, clicks, last_click_at, created_at').eq('automation_id', data.id).order('created_at', { ascending: false }).limit(20);
      const igsids = [...new Set((l ?? []).map((x: any) => x.igsid))];
      const { data: contacts } = igsids.length ? await db.from('ig_contacts').select('igsid, username').in('igsid', igsids) : { data: [] };
      const byId = new Map((contacts ?? []).map((c: any) => [c.igsid, c.username]));
      setLinks((l ?? []).map((x: any) => ({ ...x, username: byId.get(x.igsid) ?? null })));
    })();
  }, [id, navigate]);
  useEffect(() => { callInstagram('media', { ig_id: LAGUN_IG_ID, limit: '24' }).then((m) => setMedia(m.data || [])).catch(() => undefined); }, []);
  useEffect(() => { if (!menuAdd) return; const f = () => setMenuAdd(false); window.addEventListener('click', f); return () => window.removeEventListener('click', f); }, [menuAdd]);

  const update = useCallback((patch: Partial<Definition>) => { setDef((d) => ({ ...d, ...patch })); setDirty(true); }, []);
  const updateNode = (nid: string, patch: Partial<FlowNode>) => { setDef((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === nid ? ({ ...n, ...patch } as FlowNode) : n)) })); setDirty(true); };
  const addNode = (type: FlowNode['type']) => { const n = newNode(type); setDef((d) => ({ ...d, nodes: [...d.nodes, n] })); setSelected(n.id); setDirty(true); setMenuAdd(false); };
  const removeNode = (nid: string) => { setDef((d) => ({ ...d, nodes: d.nodes.filter((n) => n.id !== nid) })); setSelected('trigger'); setDirty(true); };
  const compiled = useMemo(() => compileForEngine({ name, status: auto?.status || 'draft', definition: def }), [name, def, auto?.status]);

  const save = async (status?: Automation['status']) => {
    if (!auto) return;
    if (!name.trim()) { toast.error('Dê um nome à automação.'); return; }
    if (!def.trigger.types.length) { toast.error('Escolha pelo menos um gatilho.'); return; }
    if (def.trigger.match !== 'any' && !def.trigger.keywords.length) { toast.error('Adicione ao menos uma palavra-chave ou marque “Qualquer”.'); return; }
    const nextStatus = status || auto.status;
    const normalizar = (u: string) => { const v = (u || '').trim(); if (!v || v === 'https://' || v === 'http://') return ''; return /^https?:\/\//i.test(v) ? v : `https://${v}`; };
    const nodes = def.nodes.map((n) => (n.type === 'link' ? { ...n, url: normalizar(n.url) } : n));
    const linkVazio = nodes.find((n) => n.type === 'link' && !/^https?:\/\/[^\s/]+\.[^\s/]+/i.test(n.url));
    if (nextStatus === 'active' && linkVazio) { toast.error('Preencha a URL da etapa “DM com link” antes de publicar.'); setSelected(linkVazio.id); return; }
    const defNorm = { ...def, nodes };
    setSaving(true);
    try {
      const { payload } = compileForEngine({ name: name.trim(), status: nextStatus, definition: defNorm });
      const { error } = await db.from('ig_automations').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', auto.id);
      if (error) throw error;
      setDef(defNorm); setAuto({ ...auto, name: name.trim(), status: nextStatus, active: nextStatus === 'active', definition: defNorm, updated_at: new Date().toISOString() }); setDirty(false);
      toast.success(nextStatus === 'active' ? 'Automação publicada e ativa! ⚡' : nextStatus === 'paused' && auto.status === 'active' ? 'Automação pausada.' : 'Automação salva.');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível salvar.'); } finally { setSaving(false); }
  };

  if (!auto) return <div className="grid min-h-[60vh] place-items-center"><Loader2 className="animate-spin text-muted-foreground" /></div>;

  const sel = def.nodes.find((n) => n.id === selected); const selIdx = sel ? def.nodes.indexOf(sel) : -1;
  const link = def.nodes.find((n) => n.type === 'link') as Extract<FlowNode, { type: 'link' }> | undefined;
  const midia = media.find((m) => m.id === def.trigger.media_id);
  const ctr = stats?.dms ? Math.round(((stats.clicks || 0) / stats.dms) * 100) : 0;
  const metricaEtapa = (n: FlowNode) => !stats ? '' : n.type === 'public_reply' ? fmtNumber(stats.public_replies) : n.type === 'link' ? `${fmtNumber(stats.clicks || 0)} cliques` : n.type === 'dm' ? fmtNumber(stats.dms) : '';
  const sugestao = !def.trigger.keywords.length && def.trigger.match !== 'any' ? 'Sem palavra-chave a automação não dispara. Adicione “link”, “quero” ou a palavra do seu post.' : link && !def.nodes.some((n) => n.type === 'reminder') ? 'Um lembrete algumas horas depois costuma subir a conversão de quem recebeu o link.' : 'Publique e comente a palavra-chave no post para testar o fluxo de ponta a ponta.';
  const INPUT = 'h-10';

  return (
    <div className="-m-4 lg:-m-6 flex h-[calc(100vh-48px)] min-h-[600px] flex-col overflow-hidden bg-background">
      {/* Barra superior */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 lg:px-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/interno/automacoes')} aria-label="Voltar"><ArrowLeft size={16} /></Button>
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-2">
            {editandoNome ? <input autoFocus value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} onBlur={() => setEditandoNome(false)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setEditandoNome(false); }} className="min-w-[240px] bg-transparent text-lg font-semibold outline-none" placeholder="Nome da automação" /> : <button onClick={() => setEditandoNome(true)} className="flex items-center gap-2 text-left"><span className="truncate text-lg font-semibold">{name || 'Nome da automação'}</span><Pencil size={13} className="shrink-0 text-muted-foreground" /></button>}
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badgeCls(auto.status)}`}>{auto.status === 'active' ? 'Ao vivo' : auto.status === 'paused' ? 'Pausada' : 'Rascunho'}</span>
          </div>
          <div className="truncate text-xs text-muted-foreground">{def.trigger.types.map((x) => TRIGGER_LABELS[x]).join(' · ') || 'Sem gatilho'} · {legendaMidia(midia)} · {dirty ? 'alterações não salvas' : 'salvo'}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {midia?.permalink && <Button asChild variant="ghost" size="sm"><a href={midia.permalink} target="_blank" rel="noreferrer">Testar no Instagram ↗</a></Button>}
          {auto.status === 'active' ? <Button variant="outline" size="sm" onClick={() => void save('paused')} disabled={saving}><Power size={14} className="mr-1.5" />Pausar</Button> : <Button size="sm" onClick={() => void save('active')} disabled={saving} className="bg-[#E8C766] text-black hover:bg-[#d9b854]"><Zap size={14} className="mr-1.5" />Publicar</Button>}
          <Button size="sm" variant="secondary" onClick={() => void save()} disabled={saving}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}<span className="ml-1.5">Salvar</span></Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[280px_1fr] xl:grid-cols-[280px_1fr_380px]">
        {/* Etapas + regras */}
        <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto border-r border-border bg-card px-4 py-4">
          <div className="flex items-baseline justify-between"><span className="text-sm font-bold">Etapas</span><span className="text-xs text-muted-foreground">gatilho + {def.nodes.length}</span></div>
          <div className="relative flex flex-col">
            <button onClick={() => setSelected('trigger')} className={`flex items-center gap-3 rounded-lg px-2 py-2 text-left ${selected === 'trigger' ? 'bg-muted' : 'hover:bg-muted/50'}`}><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-500 text-white"><Zap size={12} /></span><div className="min-w-0 flex-1"><Eyebrow>Gatilho</Eyebrow><div className="truncate text-sm font-semibold">{def.trigger.types.map((x) => TRIGGER_LABELS[x]).join(' · ') || 'Escolher gatilho'}</div></div>{stats && <span className="text-xs font-semibold text-emerald-600">{fmtNumber(stats.triggers)}</span>}</button>
            {def.nodes.map((n, i) => <button key={n.id} onClick={() => setSelected(n.id)} className={`flex items-center gap-3 rounded-lg px-2 py-2 text-left ${selected === n.id ? 'bg-muted' : 'hover:bg-muted/50'}`}><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: NODE_COLOR[n.type] }}>{i + 1}</span><div className="min-w-0 flex-1"><Eyebrow>Etapa {i + 1}</Eyebrow><div className="truncate text-sm font-semibold">{NODE_LABELS[n.type]}</div></div><span className="text-xs text-muted-foreground">{metricaEtapa(n)}</span></button>)}
            <div className="relative"><button onClick={(e) => { e.stopPropagation(); setMenuAdd((o) => !o); }} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-[#b8952f] hover:bg-muted/50"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-dashed border-[#E8C766]"><Plus size={12} /></span><span className="text-sm font-semibold">Adicionar etapa</span></button>{menuAdd && <MenuEtapas onAdd={addNode} className="left-8 top-10" />}</div>
          </div>
          <div className="h-px bg-border" />
          <div className="flex flex-col gap-3">
            <span className="text-sm font-bold">Regras</span>
            <label className="flex items-center gap-3 text-xs"><Switch checked={Boolean(def.trigger.once_per_24h)} onCheckedChange={(v) => update({ trigger: { ...def.trigger, once_per_24h: v } })} />Responder cada pessoa 1× a cada 24h</label>
            <label className={`flex items-center gap-3 text-xs ${!link ? 'opacity-50' : ''}`}><Switch checked={Boolean(link) && link!.track !== false} disabled={!link} onCheckedChange={() => link && updateNode(link.id, { track: link.track === false })} /><span>Rastrear cliques com link curto por pessoa{!link && <span className="block text-[11px] text-muted-foreground">precisa de uma etapa “DM com link”</span>}</span></label>
          </div>
          {compiled.unsupported.length > 0 && <div className="rounded-lg bg-amber-500/10 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">Etapas de <strong>{[...new Set(compiled.unsupported)].join(', ')}</strong> ficam salvas, mas o motor ainda não as executa.</div>}
          <div className="mt-auto flex gap-2.5 rounded-lg bg-muted px-3 py-2.5 text-xs text-muted-foreground"><Sparkles size={14} className="shrink-0 text-[#b8952f]" /><span><strong className="text-foreground">Sugestão:</strong> {sugestao}</span></div>
        </aside>

        {/* Canvas */}
        <div className="relative min-h-0 overflow-auto bg-muted/30 [background-image:radial-gradient(hsl(var(--border))_1px,transparent_1px)] [background-size:22px_22px]">
          <div className="flex min-h-full flex-col items-center px-6 pb-24 pt-10">
            <button onClick={() => setSelected('trigger')} className="w-[340px] rounded-xl border-2 bg-card px-4 py-3.5 text-left shadow-sm" style={{ borderColor: selected === 'trigger' ? '#E8C766' : '#22C55E' }}>
              <div className="flex items-center gap-2.5"><span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-500 text-white"><Zap size={13} /></span><div><Eyebrow>Quando</Eyebrow><div className="text-sm font-semibold leading-tight">{def.trigger.types.length ? def.trigger.types.map((x) => TRIGGER_LABELS[x]).join(' · ') : 'Escolha um gatilho'}</div></div></div>
              <div className="mt-3 flex items-center gap-2.5 rounded-lg bg-muted px-2.5 py-2">{midia ? <img src={midia.thumbnail_url || midia.media_url} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" /> : <span className="h-9 w-9 shrink-0 rounded-md bg-gradient-to-br from-pink-500 to-violet-600" />}<div className="min-w-0"><div className="truncate text-xs font-medium">{legendaMidia(midia)}</div><div className="truncate text-[11px] text-muted-foreground">{def.trigger.match === 'any' ? 'qualquer mensagem' : <>{def.trigger.match === 'exact' ? 'igual a' : 'contém'}: {def.trigger.keywords.length ? def.trigger.keywords.join(', ') : <span className="text-amber-600">sem palavra-chave</span>}</>}</div></div></div>
            </button>
            {def.nodes.map((n, i) => { const Icon = NODE_ICON[n.type]; const texto = summary(n); const on = selected === n.id; return (
              <div key={n.id} className="flex flex-col items-center">
                <div className="flex h-12 items-center"><svg width="24" height="48" viewBox="0 0 24 48"><path d="M12 2 L12 42" fill="none" stroke="#E8C766" strokeWidth="2" strokeDasharray="5 4" /><path d="M6 36 L12 42 L18 36" fill="none" stroke="#E8C766" strokeWidth="2" strokeLinecap="round" /></svg></div>
                <button onClick={() => setSelected(n.id)} className="w-[340px] rounded-xl border-2 bg-card px-4 py-3.5 text-left shadow-sm" style={{ borderColor: on ? '#E8C766' : 'transparent' }}>
                  <div className="flex items-center gap-2.5"><span className="grid h-7 w-7 place-items-center rounded-full text-white" style={{ background: NODE_COLOR[n.type] }}><Icon size={13} /></span><div className="flex-1"><Eyebrow>Etapa {i + 1}</Eyebrow><div className="text-sm font-semibold leading-tight">{NODE_LABELS[n.type]}</div></div>{n.type === 'link' && n.track !== false && <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-semibold text-blue-600"><Target size={10} />rastreado</span>}</div>
                  {n.type === 'public_reply' ? <div className="mt-3 flex flex-col gap-1.5">{n.variants.filter(Boolean).length ? n.variants.filter(Boolean).map((v, j) => <div key={j} className="rounded-lg bg-muted px-3 py-2 text-xs">{v}</div>) : <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700">Clique para escrever a resposta</div>}</div>
                    : n.type === 'link' || n.type === 'dm' ? <div className="mt-3 flex flex-col gap-2 rounded-[14px_14px_14px_4px] bg-[#7C3AED] px-3 py-2.5 text-xs text-white">{texto ? <span>{texto}</span> : <span className="text-white/70">Clique para escrever a mensagem</span>}{n.type === 'link' && <span className="rounded-md bg-white px-3 py-1.5 text-center text-[11px] font-semibold text-[#3B1BB5]">{n.label || 'Abrir'} ↗</span>}{n.type === 'dm' && n.buttons?.filter((b) => b.label).map((b, j) => <span key={j} className="rounded-md bg-white px-3 py-1.5 text-center text-[11px] font-semibold text-[#3B1BB5]">{b.label}</span>)}</div>
                    : <div className={`mt-3 rounded-lg px-3 py-2 text-xs ${texto ? 'bg-muted' : 'bg-amber-500/10 text-amber-700'}`}>{texto || 'Clique para configurar'}</div>}
                  {n.type === 'link' && stats ? <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground"><span><strong className="text-foreground">{fmtNumber(stats.clicks || 0)}</strong> cliques · <strong className="text-foreground">{fmtNumber(stats.clicked_people || 0)}</strong> pessoas</span><span className="font-semibold text-blue-600">CTR {ctr}%</span></div> : null}
                </button>
              </div>); })}
            <div className="flex h-10 items-center"><svg width="24" height="40" viewBox="0 0 24 40"><path d="M12 2 L12 36" fill="none" stroke="hsl(var(--border))" strokeWidth="2" strokeDasharray="5 4" /></svg></div>
            <div className="relative"><button onClick={(e) => { e.stopPropagation(); setMenuAdd((o) => !o); }} className="flex h-10 items-center gap-2 rounded-full border-2 border-dashed border-[#E8C766] bg-card px-4 text-xs font-semibold text-[#b8952f] hover:bg-muted"><Plus size={14} />Adicionar etapa</button>{menuAdd && <MenuEtapas onAdd={addNode} className="left-1/2 top-12 -translate-x-1/2" />}</div>
          </div>
        </div>

        {/* Inspector */}
        <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto border-t border-border bg-card px-5 py-4 lg:col-span-2 xl:col-span-1 xl:border-l xl:border-t-0">
          {selected === 'trigger' || !sel ? (<>
            <div><Eyebrow>Gatilho</Eyebrow><div className="text-base font-bold">Quando isso acontecer</div><div className="text-xs text-muted-foreground">A automação dispara quando alguém interagir com o @lagunvix desta forma.</div></div>
            <div className="grid grid-cols-2 gap-2">{(Object.keys(TRIGGER_LABELS) as TriggerType[]).map((x) => { const on = def.trigger.types.includes(x); return <button key={x} onClick={() => update({ trigger: { ...def.trigger, types: on ? def.trigger.types.filter((y) => y !== x) : [...def.trigger.types, x] } })} className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-xs ${on ? 'border-[#E8C766] bg-[#E8C766]/10 font-semibold' : 'border-border hover:bg-muted'}`}>{on && <Check size={13} />}{TRIGGER_LABELS[x]}</button>; })}</div>
            <div className="flex flex-col gap-2">
              <div className="text-sm font-bold">Palavras-chave</div>
              <div className="flex gap-1 rounded-full bg-muted p-1 text-xs font-semibold">{([['contains', 'Contém'], ['exact', 'Exata'], ['any', 'Qualquer']] as const).map(([v, l]) => <button key={v} onClick={() => update({ trigger: { ...def.trigger, match: v } })} className={`flex-1 rounded-full py-1.5 ${def.trigger.match === v ? 'bg-foreground text-background' : 'text-muted-foreground'}`}>{l}</button>)}</div>
              <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-border px-3 py-2">{def.trigger.keywords.map((k) => <span key={k} className="inline-flex items-center gap-1 rounded-full bg-[#E8C766]/15 px-2.5 py-1 text-xs font-medium">{k}<button onClick={() => update({ trigger: { ...def.trigger, keywords: def.trigger.keywords.filter((x) => x !== k) } })} aria-label="Remover"><X size={11} /></button></span>)}<input value={keyword} onChange={(e) => setKeyword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); const k = keyword.trim().toLowerCase(); if (k && !def.trigger.keywords.includes(k)) update({ trigger: { ...def.trigger, keywords: [...def.trigger.keywords, k] } }); setKeyword(''); } }} placeholder="Digite e Enter" className="min-w-[100px] flex-1 bg-transparent text-xs outline-none" disabled={def.trigger.match === 'any'} /></div>
            </div>
            {def.trigger.types.some((x) => x === 'comment_feed') && <div className="flex flex-col gap-2"><div className="flex items-baseline justify-between"><span className="text-sm font-bold">Publicação</span>{def.trigger.media_id && <button onClick={() => update({ trigger: { ...def.trigger, media_id: null } })} className="text-xs font-semibold text-[#b8952f]">Todas</button>}</div><div className="grid grid-cols-4 gap-2"><button onClick={() => update({ trigger: { ...def.trigger, media_id: null } })} className={`grid aspect-square place-items-center rounded-lg border text-center text-[11px] font-semibold ${!def.trigger.media_id ? 'border-2 border-[#E8C766] bg-[#E8C766]/10' : 'border-border'}`}>Todas</button>{media.map((m) => <button key={m.id} onClick={() => update({ trigger: { ...def.trigger, media_id: m.id } })} className={`relative aspect-square overflow-hidden rounded-lg border-2 ${def.trigger.media_id === m.id ? 'border-[#E8C766]' : 'border-transparent'}`}><img src={m.thumbnail_url || m.media_url} alt="" className="h-full w-full object-cover" />{def.trigger.media_id === m.id && <span className="absolute inset-0 grid place-items-center bg-[#E8C766]/50 text-black"><Check size={16} /></span>}</button>)}</div>{!media.length && <p className="text-xs text-muted-foreground">As publicações aparecem aqui quando o Instagram responder.</p>}</div>}
          </>) : (<>
            <div className="flex items-start justify-between"><div><Eyebrow>Etapa {selIdx + 1} de {def.nodes.length}</Eyebrow><div className="text-base font-bold">{NODE_LABELS[sel.type]}</div><div className="text-xs text-muted-foreground">{NODE_HINT[sel.type]}</div></div><Button variant="ghost" size="icon" onClick={() => removeNode(sel.id)} aria-label="Remover etapa" className="text-muted-foreground hover:text-red-600"><Trash2 size={15} /></Button></div>
            {sel.type === 'dm' && <><Field label="Mensagem"><Textarea value={sel.text} onChange={(e) => updateNode(sel.id, { text: e.target.value })} placeholder="Oi! Aqui está o que você pediu 👇" /></Field><div className="flex flex-col gap-2"><span className="text-xs font-semibold">Botão de resposta rápida (opcional)</span>{(sel.buttons || []).map((b, i) => <div key={i} className="flex gap-2"><Input value={b.label} onChange={(e) => updateNode(sel.id, { buttons: (sel.buttons || []).map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} placeholder="Texto do botão" maxLength={20} className={INPUT} /><Button variant="ghost" size="icon" onClick={() => updateNode(sel.id, { buttons: (sel.buttons || []).filter((_, j) => j !== i) })} aria-label="Remover botão"><X size={14} /></Button></div>)}{(sel.buttons || []).length < 1 && <Button variant="outline" size="sm" className="self-start" onClick={() => updateNode(sel.id, { buttons: [{ label: '' }] })}><Plus size={13} className="mr-1" />Botão</Button>}<p className="text-[11px] text-muted-foreground">Ao tocar no botão a pessoa abre a janela de 24h e recebe a etapa “DM com link”.</p></div></>}
            {sel.type === 'public_reply' && <div className="flex flex-col gap-2"><div className="flex items-baseline justify-between"><span className="text-sm font-bold">Variações</span>{stats && <span className="text-xs text-muted-foreground">{fmtNumber(stats.public_replies)} enviadas</span>}</div>{sel.variants.map((v, i) => <div key={i} className="flex items-center gap-2"><Input value={v} onChange={(e) => updateNode(sel.id, { variants: sel.variants.map((x, j) => (j === i ? e.target.value : x)) })} placeholder="Te mandei no direct! 🦩" className={INPUT} />{sel.variants.length > 1 && <Button variant="ghost" size="icon" onClick={() => updateNode(sel.id, { variants: sel.variants.filter((_, j) => j !== i) })} aria-label="Remover variação"><X size={14} /></Button>}</div>)}<Button variant="outline" size="sm" className="self-start" onClick={() => updateNode(sel.id, { variants: [...sel.variants, ''] })}><Plus size={13} className="mr-1" />Variação</Button><p className="rounded-lg bg-muted px-3 py-2 text-[11px] text-muted-foreground">Variar a resposta evita que o Instagram trate seus comentários como spam.</p></div>}
            {sel.type === 'link' && <>
              <Field label="Mensagem"><Textarea value={sel.text} onChange={(e) => updateNode(sel.id, { text: e.target.value })} placeholder="Oi! Aqui está o link que você pediu 👇" /></Field>
              <div className="grid grid-cols-2 gap-2"><Field label="Texto do botão"><Input value={sel.label} onChange={(e) => updateNode(sel.id, { label: e.target.value })} maxLength={20} className={INPUT} /></Field><Field label="Destino"><Input value={sel.url} onChange={(e) => updateNode(sel.id, { url: e.target.value })} placeholder="https://" className={`${INPUT} text-xs`} /></Field></div>
              <label className="flex items-center gap-3 rounded-lg bg-blue-500/10 px-3 py-2.5 text-xs"><Switch checked={sel.track !== false} onCheckedChange={() => updateNode(sel.id, { track: sel.track === false })} /><span><strong>Rastrear cliques</strong><span className="block text-[11px] text-muted-foreground">Gera um lagunvitoria.com.br/l/xxxx por pessoa e registra quem clicou</span></span></label>
              <div className="grid grid-cols-3 gap-2">{[['Enviadas', fmtNumber(stats?.dms || 0)], ['Cliques', fmtNumber(stats?.clicks || 0)], ['Pessoas', fmtNumber(stats?.clicked_people || 0)]].map(([l, v]) => <div key={l} className="rounded-lg bg-muted p-3"><div className="text-[11px] text-muted-foreground">{l}</div><div className="mt-1 text-lg font-bold">{v}</div></div>)}</div>
              {links.length > 0 && <div className="flex flex-col gap-1"><span className="text-xs font-semibold">Últimos links enviados</span>{links.slice(0, 10).map((l) => <div key={l.slug} className="flex items-center justify-between rounded-md bg-muted px-2.5 py-1.5 text-[11px]"><span className="truncate">{l.username ? `@${l.username}` : l.igsid}</span><span className={`ml-2 shrink-0 font-semibold ${l.clicks ? 'text-emerald-600' : 'text-muted-foreground'}`}>{l.clicks ? `${l.clicks} clique${l.clicks > 1 ? 's' : ''}` : 'sem clique'}</span></div>)}</div>}
            </>}
            {(sel.type === 'delay' || sel.type === 'reminder') && <Field label="Aguardar (minutos)"><Input type="number" min={1} value={sel.minutes} onChange={(e) => updateNode(sel.id, { minutes: Number(e.target.value) })} className={INPUT} /></Field>}
            {sel.type === 'reminder' && <Field label="Mensagem do lembrete"><Textarea value={sel.text} onChange={(e) => updateNode(sel.id, { text: e.target.value })} placeholder="Ainda dá tempo! 🔥" /></Field>}
            {sel.type === 'ask' && <><Field label="Pergunta"><Textarea value={sel.question} onChange={(e) => updateNode(sel.id, { question: e.target.value })} placeholder="Qual é o seu WhatsApp?" /></Field><Field label="Salvar resposta como"><select value={sel.save_as} onChange={(e) => updateNode(sel.id, { save_as: e.target.value as any })} className="h-10 rounded-md border border-border bg-background px-3 text-sm"><option value="whatsapp">WhatsApp</option><option value="email">E-mail</option><option value="name">Nome</option><option value="custom">Campo livre</option></select></Field><Field label="Confirmação"><Input value={sel.confirm || ''} onChange={(e) => updateNode(sel.id, { confirm: e.target.value })} placeholder="Anotado! 🦩" className={INPUT} /></Field></>}
            {sel.type === 'condition' && <><Field label="Verificar"><select value={sel.check} onChange={(e) => updateNode(sel.id, { check: e.target.value as any })} className="h-10 rounded-md border border-border bg-background px-3 text-sm"><option value="follows_you">A pessoa segue o @lagunvix?</option><option value="is_customer">Já comprou ingresso?</option><option value="has_whatsapp">Tem WhatsApp salvo?</option></select></Field>{sel.check === 'follows_you' ? <><p className="rounded-lg bg-emerald-500/10 px-3 py-2.5 text-[11px] text-emerald-700 dark:text-emerald-400">O link só é entregue depois que a pessoa segue a conta. Quem não segue recebe a mensagem abaixo com um botão; a Meta é consultada de novo a cada toque.</p><Field label="Se não segue, responder"><Textarea value={sel.no_text || ''} onChange={(e) => updateNode(sel.id, { no_text: e.target.value })} placeholder="Para receber o link, segue a gente primeiro 🙏 Depois toca no botão abaixo." /></Field><Field label="Texto do botão"><Input value={sel.button_label || ''} onChange={(e) => updateNode(sel.id, { button_label: e.target.value })} placeholder="Já sigo ✅" maxLength={20} className={INPUT} /></Field></> : <><Field label="Se sim, responder"><Textarea value={sel.yes_text || ''} onChange={(e) => updateNode(sel.id, { yes_text: e.target.value })} /></Field><Field label="Se não, responder"><Textarea value={sel.no_text || ''} onChange={(e) => updateNode(sel.id, { no_text: e.target.value })} /></Field></>}</>}
            {sel.type === 'tag' && <Field label="Etiqueta"><Input value={sel.tag} onChange={(e) => updateNode(sel.id, { tag: e.target.value })} placeholder="novo-contato" className={INPUT} /></Field>}
          </>)}
        </aside>
      </div>
      <Bot className="hidden" />
    </div>
  );
}

function MenuEtapas({ onAdd, className }: { onAdd: (t: FlowNode['type']) => void; className: string }) {
  return (
    <div onClick={(e) => e.stopPropagation()} className={`absolute z-20 w-56 rounded-lg border border-border bg-card p-1.5 shadow-lg ${className}`}>
      {(Object.keys(NODE_LABELS) as FlowNode['type'][]).map((t) => { const Icon = NODE_ICON[t]; return <button key={t} onClick={() => onAdd(t)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted"><span className="grid h-6 w-6 place-items-center rounded-full text-white" style={{ background: NODE_COLOR[t] }}><Icon size={12} /></span>{NODE_LABELS[t]}</button>; })}
    </div>
  );
}
