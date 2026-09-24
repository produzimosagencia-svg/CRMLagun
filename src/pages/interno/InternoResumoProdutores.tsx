import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CalendarClock, CheckCheck, Eye, KeyRound, Loader2, MessageSquareText, RefreshCw, Send, Users,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { callWhatsappApi } from '@/lib/whatsappApi';
import { formatPhone } from '@/lib/formatPhone';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

/**
 * WhatsApp → Resumo para produtores.
 *
 * Regra: às 20h (Brasília), quando o evento da landing acontece em 4, 3, 2 ou
 * 1 dia, e no próprio dia, os produtores fixos e os parceiros vinculados ao
 * evento recebem o template `resumo_campanha_evento` com o total de ingressos
 * vendidos (Zig), os vendidos no dia (00h às 20h) e o botão para o relatório de
 * tráfego pago. Cada envio leva um link próprio, então dá para ver quem abriu.
 *
 * Quem dispara é a edge function lagun-resumo-produtores (pg_cron 23:00 UTC).
 * As vendas vêm da lagun-zig-sync (a cada 10 min). O token da Zig nunca volta
 * para o navegador: a tela só sabe se ele foi salvo.
 */

const DIAS_DA_REGRA = [4, 3, 2, 1, 0];

type Config = {
  enabled: boolean;
  template_name: string;
  template_language: string;
  phone_number_id: string | null;
  hora: string;
};
type PhoneNumber = { id: string; display_phone_number: string; verified_name: string };
type Evento = {
  id: string; nome: string; data: string | null; show_on_landing: boolean | null; relatorio_token?: string | null;
};
type ZigCfg = {
  event_id: string; zig_event_id: string; last_sync_at: string | null; last_sync_error: string | null; orders_count: number | null;
};
type Produtor = { id: string; nome: string; telefone: string | null; tipo: 'fixo' | 'parceiro' };
type Envio = {
  id: string; event_id: string; dia: string; dias_faltando: number | null; nome: string | null; telefone: string;
  status: string; wamid: string | null; erro: string | null; total_ingressos: number | null; ingressos_hoje: number | null;
  aberto_em: string | null; ultimo_clique_em: string | null; cliques: number; created_at: string;
  lagun_events?: { nome: string } | null;
};
type Previa = {
  evento: { id: string; nome: string; data: string | null };
  dia: string; hora: string; dias_faltando: number | null; dentro_da_regra: boolean; frase: string;
  total_ingressos: number; ingressos_hoje: number; template: string; template_encontrado: boolean;
  template_status: string | null; botao_url: string | null; ultima_sync: string | null; pendencias: string[];
  destinatarios: { nome: string; telefone: string; tipo: string; status_hoje: string | null; texto: string }[];
};

// ------------------------------------------------------------------ helpers
// Brasília = UTC-3 fixo.
const agoraBrasilia = () => new Date(Date.now() - 3 * 3600_000);
const hojeBrasilia = () => agoraBrasilia().toISOString().slice(0, 10);
const somarDias = (dia: string, n: number) =>
  new Date(Date.parse(`${dia}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const diasEntre = (de: string, ate: string) =>
  Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86400_000);
const dataCurta = (dia: string) =>
  new Date(`${dia}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' });
const dataHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '—';
const faltam = (dias: number) => (dias === 0 ? 'no dia' : dias === 1 ? 'falta 1 dia' : `faltam ${dias} dias`);

function normalizarTelefone(raw: string | null | undefined) {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d;
  return null;
}

// Chama uma edge function com a sessão do usuário (as actions exigem login).
async function chamarFuncao<T = any>(nome: string, params: Record<string, string>, body?: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sua sessão expirou. Entre novamente.');
  const qs = new URLSearchParams(params).toString();
  const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${nome}?${qs}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok || payload?.error) throw new Error(payload?.error || `HTTP ${resp.status}`);
  return payload as T;
}

const inputCls = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#D9B14E]';
const cardCls = 'rounded-xl border border-border bg-card';

function StatusEnvio({ envio, statusWa }: { envio: Envio; statusWa: string | undefined }) {
  const s = String(statusWa || envio.status || '').toLowerCase();
  const mapa: Record<string, [string, string]> = {
    read: ['lido', 'bg-sky-500/15 text-sky-500'],
    delivered: ['entregue', 'bg-emerald-500/15 text-emerald-500'],
    sent: ['enviado', 'bg-muted text-muted-foreground'],
    enviando: ['enviando', 'bg-amber-500/15 text-amber-500'],
    failed: ['falhou', 'bg-red-500/15 text-red-500'],
    error: ['falhou', 'bg-red-500/15 text-red-500'],
    undelivered: ['falhou', 'bg-red-500/15 text-red-500'],
  };
  const falhou = envio.status === 'failed' || ['failed', 'error', 'undelivered'].includes(s);
  const [rotulo, cor] = falhou ? mapa.failed : (mapa[s] || [s || '—', 'bg-muted text-muted-foreground']);
  return (
    <div>
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${cor}`}>
        {rotulo === 'lido' && <CheckCheck size={12} />} {rotulo}
      </span>
      {falhou && envio.erro && <p className="mt-1 max-w-[220px] text-[11px] leading-tight text-red-500">{envio.erro}</p>}
    </div>
  );
}

// ------------------------------------------------------------------- página
export default function InternoResumoProdutores() {
  const [carregando, setCarregando] = useState(true);
  const [config, setConfig] = useState<Config | null>(null);
  const [numeros, setNumeros] = useState<PhoneNumber[]>([]);
  const [templateStatus, setTemplateStatus] = useState<string | null>(null);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [zig, setZig] = useState<Record<string, ZigCfg>>({});
  const [produtores, setProdutores] = useState<Produtor[]>([]);
  const [vinculos, setVinculos] = useState<Record<string, string[]>>({});
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [statusWa, setStatusWa] = useState<Record<string, string>>({});

  const [zigAberto, setZigAberto] = useState<string | null>(null);
  const [zigForm, setZigForm] = useState({ zig_event_id: '', token: '' });
  const [salvandoZig, setSalvandoZig] = useState(false);
  const [sincronizando, setSincronizando] = useState<string | null>(null);

  const [previa, setPrevia] = useState<Previa | null>(null);
  const [carregandoPrevia, setCarregandoPrevia] = useState<string | null>(null);
  const [teste, setTeste] = useState<Evento | null>(null);
  const [telefoneTeste, setTelefoneTeste] = useState('');
  const [enviandoTeste, setEnviandoTeste] = useState(false);

  const hoje = hojeBrasilia();

  async function carregar() {
    setCarregando(true);
    const [cfgRes, evRes, zigRes, prodRes, vincRes, envRes] = await Promise.all([
      (supabase as any).from('lagun_resumo_config').select('*').eq('id', 'default').maybeSingle(),
      // select('*'): relatorio_token vem de outra migration.
      (supabase as any).from('lagun_events').select('*').eq('show_on_landing', true).gte('data', hoje).order('data'),
      (supabase as any).from('lagun_event_zig').select('*'),
      (supabase as any).from('lagun_partners').select('id, nome, telefone, tipo'),
      (supabase as any).from('lagun_event_partners').select('event_id, partner_id'),
      (supabase as any).from('lagun_resumo_envios')
        .select('id, event_id, dia, dias_faltando, nome, telefone, status, wamid, erro, total_ingressos, ingressos_hoje, aberto_em, ultimo_clique_em, cliques, created_at, lagun_events(nome)')
        .order('created_at', { ascending: false }).limit(50),
    ]);
    if (cfgRes.error) toast.error('Erro ao carregar a configuração: ' + cfgRes.error.message);
    setConfig(cfgRes.data as Config | null);
    setEventos((evRes.data || []) as Evento[]);
    const porEvento: Record<string, ZigCfg> = {};
    ((zigRes.data || []) as ZigCfg[]).forEach((z) => { porEvento[z.event_id] = z; });
    setZig(porEvento);
    setProdutores((prodRes.data || []) as Produtor[]);
    const v: Record<string, string[]> = {};
    ((vincRes.data || []) as { event_id: string; partner_id: string }[]).forEach(({ event_id, partner_id }) => {
      (v[event_id] ||= []).push(partner_id);
    });
    setVinculos(v);
    const lista = (envRes.data || []) as Envio[];
    setEnvios(lista);

    // Entregue/lido: status atualizado pelo whatsapp-webhook em whatsapp_messages.
    const wamids = lista.map((e) => e.wamid).filter(Boolean) as string[];
    if (wamids.length) {
      const { data: msgs } = await (supabase as any).from('whatsapp_messages').select('wamid, status').in('wamid', wamids);
      const mapa: Record<string, string> = {};
      ((msgs || []) as { wamid: string; status: string }[]).forEach((m) => { mapa[m.wamid] = m.status; });
      setStatusWa(mapa);
    } else setStatusWa({});
    setCarregando(false);
  }

  // Número de envio e situação do template vêm da API do WhatsApp.
  async function carregarWhatsapp(nomeTemplate: string) {
    try {
      const [phones, templates] = await Promise.all([
        callWhatsappApi<{ data?: PhoneNumber[] }>('phone_numbers'),
        callWhatsappApi<{ data?: { name: string; status: string; language: string }[] }>('templates'),
      ]);
      setNumeros(phones?.data || []);
      const t = (templates?.data || []).find((x) => x.name === nomeTemplate);
      setTemplateStatus(t ? t.status : 'NAO_ENCONTRADO');
    } catch (e) {
      toast.error('WhatsApp API: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void carregar(); }, []);
  useEffect(() => { if (config?.template_name) void carregarWhatsapp(config.template_name); }, [config?.template_name]);

  // Fixos + parceiros do evento, sem repetir telefone.
  const destinatariosPorEvento = useMemo(() => {
    const fixos = produtores.filter((p) => p.tipo === 'fixo');
    const porId = new Map(produtores.map((p) => [p.id, p]));
    const r: Record<string, { fixos: number; parceiros: number; total: number; nomes: string[] }> = {};
    for (const ev of eventos) {
      const vistos = new Set<string>();
      let nFixos = 0, nParceiros = 0;
      const nomes: string[] = [];
      const lista = [...fixos, ...(vinculos[ev.id] || []).map((id) => porId.get(id)).filter(Boolean) as Produtor[]];
      for (const p of lista) {
        const tel = normalizarTelefone(p.telefone);
        if (!tel || vistos.has(tel)) continue;
        vistos.add(tel);
        nomes.push(p.nome);
        if (p.tipo === 'fixo') nFixos++; else nParceiros++;
      }
      r[ev.id] = { fixos: nFixos, parceiros: nParceiros, total: nFixos + nParceiros, nomes };
    }
    return r;
  }, [eventos, produtores, vinculos]);

  // Próximos disparos: para cada dia de hoje a +4, os eventos que caem na regra.
  const proximos = useMemo(() => {
    const horaCorte = config?.hora || '20:00';
    const [h, m] = horaCorte.split(':').map(Number);
    const agora = agoraBrasilia();
    const jaPassouHoje = agora.getUTCHours() * 60 + agora.getUTCMinutes() >= (h || 20) * 60 + (m || 0);
    const enviadosHoje = new Set(envios.filter((e) => e.dia === hoje).map((e) => e.event_id));
    const linhas: { dia: string; evento: Evento; dias: number; avisos: string[]; passado: string | null }[] = [];
    for (let i = 0; i < 5; i++) {
      const dia = somarDias(hoje, i);
      for (const ev of eventos) {
        if (!ev.data) continue;
        const dias = diasEntre(dia, ev.data.slice(0, 10));
        if (!DIAS_DA_REGRA.includes(dias)) continue;
        const avisos: string[] = [];
        if (!config?.enabled) avisos.push('disparo desligado');
        if (templateStatus && templateStatus !== 'APPROVED') {
          avisos.push(templateStatus === 'NAO_ENCONTRADO' ? 'template não encontrado' : `template não aprovado (${templateStatus})`);
        }
        if (!zig[ev.id]) avisos.push('sem Zig configurada');
        if (!ev.relatorio_token) avisos.push('sem link do relatório');
        if (!destinatariosPorEvento[ev.id]?.total) avisos.push('nenhum produtor com telefone');
        const passado = i !== 0 ? null
          : enviadosHoje.has(ev.id) ? 'enviado hoje (ver Enviados)'
          : jaPassouHoje ? 'horário de hoje já passou' : null;
        linhas.push({ dia, evento: ev, dias, avisos, passado });
      }
    }
    return linhas;
  }, [config, templateStatus, eventos, zig, destinatariosPorEvento, envios, hoje]);

  async function salvarConfig(patch: Partial<Config>) {
    if (!config) return;
    const anterior = config;
    setConfig({ ...config, ...patch });
    const { error } = await (supabase as any).from('lagun_resumo_config')
      .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', 'default');
    if (error) { setConfig(anterior); toast.error('Erro ao salvar: ' + error.message); return; }
    toast.success('Configuração salva');
  }

  function abrirZig(ev: Evento) {
    setZigAberto(zigAberto === ev.id ? null : ev.id);
    setZigForm({ zig_event_id: zig[ev.id]?.zig_event_id || '', token: '' });
  }

  async function salvarZig(ev: Evento) {
    const zigEventId = zigForm.zig_event_id.trim();
    if (!zigEventId) { toast.error('Informe o id do evento na Zig'); return; }
    if (!zig[ev.id] && !zigForm.token.trim()) { toast.error('Informe o token da Zig'); return; }
    setSalvandoZig(true);
    try {
      const r = await chamarFuncao<{ sync?: { pedidos?: number; erro?: string } }>(
        'lagun-zig-sync', { action: 'salvar_config' },
        { event_id: ev.id, zig_event_id: zigEventId, token: zigForm.token.trim() },
      );
      if (r.sync?.erro) toast.warning(`Token salvo, mas a leitura da Zig falhou: ${r.sync.erro}`);
      else toast.success(`Zig configurada · ${r.sync?.pedidos ?? 0} pedidos lidos`);
      setZigForm({ zig_event_id: zigEventId, token: '' });
      setZigAberto(null);
      void carregar();
    } catch (e) {
      toast.error('Erro ao salvar: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSalvandoZig(false);
    }
  }

  async function sincronizar(ev: Evento) {
    setSincronizando(ev.id);
    try {
      const r = await chamarFuncao<{ pedidos?: number }>('lagun-zig-sync', { action: 'sincronizar', event_id: ev.id });
      toast.success(`${r.pedidos ?? 0} pedidos lidos da Zig`);
      void carregar();
    } catch (e) {
      toast.error('Zig: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSincronizando(null);
    }
  }

  async function abrirPrevia(ev: Evento) {
    setCarregandoPrevia(ev.id);
    try {
      setPrevia(await chamarFuncao<Previa>('lagun-resumo-produtores', { action: 'previa', event_id: ev.id }));
    } catch (e) {
      toast.error('Prévia: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setCarregandoPrevia(null);
    }
  }

  async function enviarTeste() {
    if (!teste) return;
    const tel = normalizarTelefone(telefoneTeste);
    if (!tel) { toast.error('Telefone inválido: use DDD + número'); return; }
    setEnviandoTeste(true);
    try {
      await chamarFuncao('lagun-resumo-produtores', { action: 'teste', event_id: teste.id, telefone: tel });
      toast.success(`Teste enviado para ${formatPhone(tel)}`);
      setTeste(null);
      setTelefoneTeste('');
    } catch (e) {
      toast.error('Teste: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setEnviandoTeste(false);
    }
  }

  const templateOk = templateStatus === 'APPROVED';

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <MessageSquareText size={20} className="text-[#D9B14E]" />
            <h1 className="text-xl font-bold text-foreground">Resumo para produtores</h1>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Às {config?.hora || '20:00'} (Brasília), quando o evento acontece em 4, 3, 2 ou 1 dia, e no próprio dia, os
            produtores fixos e os parceiros do evento recebem no WhatsApp o total de ingressos vendidos, os vendidos no
            dia (00h às {config?.hora || '20:00'}) e o botão do relatório de tráfego pago. Cada pessoa recebe um link
            próprio, então dá para ver quem abriu.
          </p>
        </div>
        <button
          onClick={() => { void carregar(); if (config?.template_name) void carregarWhatsapp(config.template_name); }}
          className="flex items-center gap-1.5 self-start rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted"
        >
          <RefreshCw size={14} className={carregando ? 'animate-spin' : ''} /> Atualizar
        </button>
      </header>

      {/* ------------------------------------------------ próximos disparos */}
      <section className={`${cardCls} p-4`}>
        <h2 className="flex items-center gap-2 font-bold text-foreground"><CalendarClock size={16} className="text-[#D9B14E]" /> Próximos disparos</h2>
        <p className="mb-3 text-xs text-muted-foreground">Próximos 5 dias. Cada linha é um envio das {config?.hora || '20:00'} para os produtores do evento.</p>
        {carregando ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : proximos.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhum evento da landing nos próximos dias.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Quando</th>
                  <th className="px-3 py-2 font-semibold">Evento</th>
                  <th className="px-3 py-2 font-semibold">Destinatários</th>
                  <th className="px-3 py-2 font-semibold">Situação</th>
                </tr>
              </thead>
              <tbody>
                {proximos.map(({ dia, evento, dias, avisos, passado }) => {
                  const d = destinatariosPorEvento[evento.id];
                  return (
                    <tr key={`${dia}-${evento.id}`} className="border-b border-border/60 last:border-0">
                      <td className="whitespace-nowrap px-3 py-2.5 text-foreground">
                        {dia === hoje ? 'Hoje' : dataCurta(dia)} · {config?.hora || '20:00'}
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-foreground">{evento.nome}</p>
                        <p className="text-xs text-muted-foreground">{faltam(dias)}</p>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground" title={d?.nomes.join(', ')}>
                        {d?.total ?? 0} <span className="text-xs">({d?.fixos ?? 0} fixos + {d?.parceiros ?? 0} parceiros)</span>
                      </td>
                      <td className="px-3 py-2.5">
                        {passado ? (
                          <span className="text-xs text-muted-foreground">{passado}</span>
                        ) : avisos.length ? (
                          <span className="inline-flex items-start gap-1 text-xs text-amber-500">
                            <AlertTriangle size={13} className="mt-0.5 shrink-0" /> Não vai sair: {avisos.join(', ')}
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-emerald-500">programado</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* --------------------------------------------------------- enviados */}
      <section className={`${cardCls} p-4`}>
        <h2 className="flex items-center gap-2 font-bold text-foreground"><Send size={16} className="text-[#D9B14E]" /> Enviados</h2>
        <p className="mb-3 text-xs text-muted-foreground">Últimos 50 envios. Entregue e lido vêm da confirmação do WhatsApp; "abriu" conta os cliques no link individual.</p>
        {carregando ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : envios.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhum resumo enviado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Dia</th>
                  <th className="px-3 py-2 font-semibold">Evento</th>
                  <th className="px-3 py-2 font-semibold">Produtor</th>
                  <th className="px-3 py-2 font-semibold">Números</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Abriu o relatório?</th>
                </tr>
              </thead>
              <tbody>
                {envios.map((e) => (
                  <tr key={e.id} className="border-b border-border/60 align-top last:border-0">
                    <td className="whitespace-nowrap px-3 py-2.5 text-foreground">{dataCurta(e.dia)}</td>
                    <td className="px-3 py-2.5">
                      <p className="text-foreground">{e.lagun_events?.nome || '—'}</p>
                      {e.dias_faltando !== null && <p className="text-xs text-muted-foreground">{faltam(e.dias_faltando)}</p>}
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="text-foreground">{e.nome || '—'}</p>
                      <p className="text-xs text-muted-foreground">{formatPhone(e.telefone)}</p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">
                      {e.total_ingressos ?? 0} no total · {e.ingressos_hoje ?? 0} no dia
                    </td>
                    <td className="px-3 py-2.5"><StatusEnvio envio={e} statusWa={e.wamid ? statusWa[e.wamid] : undefined} /></td>
                    <td className="px-3 py-2.5 text-xs">
                      {e.aberto_em ? (
                        <span className="text-emerald-500">
                          Sim · {dataHora(e.aberto_em)}
                          <span className="text-muted-foreground"> · {e.cliques} clique{e.cliques === 1 ? '' : 's'}</span>
                        </span>
                      ) : <span className="text-muted-foreground">Não</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---------------------------------------------------- configuração */}
      <section className={`${cardCls} space-y-4 p-4`}>
        <h2 className="font-bold text-foreground">Configuração</h2>
        {!config ? (
          <p className="text-sm text-muted-foreground">{carregando ? 'Carregando…' : 'Configuração não encontrada (migration não aplicada?).'}</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">Disparo automático</p>
                <p className="text-xs text-muted-foreground">{config.enabled ? 'Ligado: envia todo dia às ' + config.hora : 'Desligado: nada é enviado'}</p>
              </div>
              <Switch
                checked={config.enabled}
                onCheckedChange={(v) => void salvarConfig({ enabled: v })}
                className="data-[state=checked]:bg-[#D9B14E]"
              />
            </div>
            <div className="rounded-lg border border-border p-3">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Número que envia</label>
              <select
                value={config.phone_number_id || ''}
                onChange={(e) => void salvarConfig({ phone_number_id: e.target.value || null })}
                className={inputCls}
              >
                <option value="">Automático (primeiro número da API)</option>
                {numeros.map((n) => (
                  <option key={n.id} value={n.id}>{n.verified_name} · {n.display_phone_number}</option>
                ))}
              </select>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs font-medium text-muted-foreground">Template</p>
              <p className="mt-1 font-mono text-sm text-foreground">{config.template_name} <span className="text-xs text-muted-foreground">({config.template_language})</span></p>
              <p className={`mt-1 text-xs font-semibold ${templateOk ? 'text-emerald-500' : 'text-amber-500'}`}>
                {templateStatus === null ? 'verificando…' : templateOk ? 'aprovado' : templateStatus === 'NAO_ENCONTRADO' ? 'não encontrado na conta' : `status: ${templateStatus}`}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ---------------------------------------------------------- eventos */}
      <section className="space-y-3">
        <div>
          <h2 className="font-bold text-foreground">Eventos da landing</h2>
          <p className="text-xs text-muted-foreground">Cada evento precisa do id do evento e do token da Zig para contar as vendas.</p>
        </div>
        {carregando ? (
          <div className={`${cardCls} p-6 text-center text-sm text-muted-foreground`}>Carregando…</div>
        ) : eventos.length === 0 ? (
          <div className={`${cardCls} p-6 text-center text-sm text-muted-foreground`}>Nenhum evento ativo na landing com data futura.</div>
        ) : eventos.map((ev) => {
          const dias = ev.data ? diasEntre(hoje, ev.data.slice(0, 10)) : null;
          const z = zig[ev.id];
          const d = destinatariosPorEvento[ev.id];
          const naRegra = dias !== null && DIAS_DA_REGRA.includes(dias);
          return (
            <div key={ev.id} className={`${cardCls} p-4`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{ev.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {ev.data ? dataCurta(ev.data.slice(0, 10)) : 'sem data'}
                    {dias !== null && <> · {dias === 0 ? 'é hoje' : dias === 1 ? 'amanhã' : `em ${dias} dias`}</>}
                    {naRegra && <span className="ml-2 rounded-full bg-[#D9B14E]/15 px-2 py-0.5 text-[10px] font-semibold text-[#D9B14E]">na regra</span>}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    <span className={z ? 'text-emerald-500' : 'text-amber-500'}>
                      Zig: {z ? `configurado (evento ${z.zig_event_id})` : 'falta configurar'}
                    </span>
                    {z && (
                      <span className={z.last_sync_error ? 'text-red-500' : 'text-muted-foreground'}>
                        {z.last_sync_error ? `última leitura falhou: ${z.last_sync_error}` : `${z.orders_count ?? 0} pedidos · lido ${dataHora(z.last_sync_at)}`}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 text-muted-foreground" title={d?.nomes.join(', ')}>
                      <Users size={12} /> {d?.total ?? 0} destinatários ({d?.fixos ?? 0} fixos + {d?.parceiros ?? 0} parceiros)
                    </span>
                    {!ev.relatorio_token && <span className="text-amber-500">sem link do relatório</span>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => abrirZig(ev)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted">
                    <KeyRound size={13} /> Zig
                  </button>
                  {z && (
                    <button onClick={() => void sincronizar(ev)} disabled={sincronizando === ev.id} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-60">
                      <RefreshCw size={13} className={sincronizando === ev.id ? 'animate-spin' : ''} /> Ler vendas
                    </button>
                  )}
                  <button onClick={() => void abrirPrevia(ev)} disabled={carregandoPrevia === ev.id} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-60">
                    {carregandoPrevia === ev.id ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />} Prévia
                  </button>
                  <button onClick={() => { setTeste(ev); setTelefoneTeste(''); }} className="inline-flex items-center gap-1.5 rounded-lg bg-[#D9B14E] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#B98F35]">
                    <Send size={13} /> Enviar teste
                  </button>
                </div>
              </div>

              {zigAberto === ev.id && (
                <div className="mt-4 grid gap-3 border-t border-border pt-4 md:grid-cols-[1fr_1.5fr_auto] md:items-end">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Id do evento na Zig</label>
                    <input
                      value={zigForm.zig_event_id}
                      onChange={(e) => setZigForm((f) => ({ ...f, zig_event_id: e.target.value }))}
                      placeholder="ex: 22540"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Token da Zig {z && <span className="text-emerald-500">· token salvo</span>}
                    </label>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={zigForm.token}
                      onChange={(e) => setZigForm((f) => ({ ...f, token: e.target.value }))}
                      placeholder={z ? 'Deixe vazio para manter o token salvo' : 'Cole o token do evento'}
                      className={inputCls}
                    />
                  </div>
                  <button
                    onClick={() => void salvarZig(ev)}
                    disabled={salvandoZig}
                    className="rounded-lg bg-[#D9B14E] px-4 py-2 text-sm font-medium text-white hover:bg-[#B98F35] disabled:opacity-60"
                  >
                    {salvandoZig ? 'Salvando…' : 'Salvar'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* ------------------------------------------------------------ prévia */}
      <Dialog open={!!previa} onOpenChange={(v) => { if (!v) setPrevia(null); }}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Prévia · {previa?.evento.nome}</DialogTitle>
          </DialogHeader>
          {previa && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-3 gap-2">
                {[
                  ['Ingressos no total', previa.total_ingressos.toLocaleString('pt-BR')],
                  [`Hoje até ${previa.hora}`, previa.ingressos_hoje.toLocaleString('pt-BR')],
                  ['Frase', previa.frase || '—'],
                ].map(([rotulo, valor]) => (
                  <div key={rotulo} className="rounded-lg border border-border p-2.5">
                    <p className="font-bold text-foreground">{valor}</p>
                    <p className="text-[11px] text-muted-foreground">{rotulo}</p>
                  </div>
                ))}
              </div>
              {!previa.dentro_da_regra && (
                <p className="text-xs text-muted-foreground">Hoje este evento não entra na regra (só em 4, 3, 2, 1 dia e no dia).</p>
              )}
              {previa.pendencias.length > 0 && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
                  {previa.pendencias.map((p) => <p key={p}>• {p}</p>)}
                </div>
              )}
              {!previa.template_encontrado && (
                <p className="text-xs text-amber-500">Não consegui ler o texto do template na Meta; abaixo aparecem só as variáveis.</p>
              )}
              {previa.destinatarios[0] && (
                <div className="rounded-xl bg-[#0B141A] p-3">
                  <div className="rounded-lg bg-[#1F2C34] p-3 text-[13px] leading-relaxed text-[#E9EDEF] whitespace-pre-wrap">
                    {previa.destinatarios[0].texto}
                  </div>
                  <div className="mt-1 rounded-lg bg-[#1F2C34] py-2 text-center text-[13px] font-medium text-[#53BDEB]">Ver relatório</div>
                  <p className="mt-2 text-[11px] text-[#8696A0]">
                    Botão: link individual de cada produtor (ex.: {previa.botao_url || 'sem link do relatório'})
                  </p>
                </div>
              )}
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Destinatários ({previa.destinatarios.length})</p>
                <div className="divide-y divide-border rounded-lg border border-border">
                  {previa.destinatarios.map((d) => (
                    <div key={d.telefone} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div>
                        <p className="text-foreground">{d.nome} <span className="text-xs text-muted-foreground">· {d.tipo === 'fixo' ? 'fixo' : 'parceiro'}</span></p>
                        <p className="text-xs text-muted-foreground">{formatPhone(d.telefone)}</p>
                      </div>
                      {d.status_hoje && <span className="text-xs text-muted-foreground">hoje: {d.status_hoje}</span>}
                    </div>
                  ))}
                  {previa.destinatarios.length === 0 && <p className="px-3 py-3 text-xs text-muted-foreground">Ninguém com telefone.</p>}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">Vendas lidas da Zig em {dataHora(previa.ultima_sync)}.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------- teste */}
      <Dialog open={!!teste} onOpenChange={(v) => { if (!v) setTeste(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar teste · {teste?.nome}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Envia a mensagem real, com os números de agora, só para o telefone abaixo. Não entra no histórico da regra.
            </p>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Telefone (WhatsApp)</label>
              <input
                autoFocus
                value={telefoneTeste}
                onChange={(e) => setTelefoneTeste(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void enviarTeste(); }}
                placeholder="(27) 99999-9999"
                inputMode="tel"
                className={inputCls}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setTeste(null)} className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted">Cancelar</button>
              <button onClick={() => void enviarTeste()} disabled={enviandoTeste} className="flex-1 rounded-lg bg-[#D9B14E] py-2.5 text-sm font-medium text-white hover:bg-[#B98F35] disabled:opacity-60">
                {enviandoTeste ? 'Enviando…' : 'Enviar teste'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
