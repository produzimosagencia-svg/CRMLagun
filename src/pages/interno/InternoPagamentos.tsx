import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { AlertTriangle, Ban, Banknote, CheckCircle2, Copy, History, Loader2, Pencil, Plus, RefreshCw, Send, ShieldCheck, UserPlus, Wallet, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { confirmDialog } from '@/components/ConfirmDialog';
import { toast } from 'sonner';
import {
  CATEGORIAS, STATUS, TIPOS_CHAVE, chamarFuncao, chaveBonita, fmtBRL, fmtData, fmtDataHora, normalizarChave,
  useBanco, useEventosRecentes, useFavorecidos, useLimiteDiario, usePagamentos,
  type Categoria, type Favorecido, type LogItem, type Pagamento,
} from '@/components/pagamentos/usePagamentos';

/**
 * Pagamentos (/interno/pagamentos/:aba). Só para quem está na lista
 * lagun_pagamentos_usuarios (a trava de verdade é no banco, pelas policies).
 *
 * Abas: a pagar (lançar, pagar, cancelar) · histórico (pago, falhou,
 * cancelado, com o registro de cada um) · favorecidos (cadastro de chave Pix).
 */

const OURO = '#D9B14E';
const ABAS = ['a-pagar', 'historico', 'favorecidos'] as const;
type Aba = typeof ABAS[number];

const TITULOS: Record<Aba, { titulo: string; sub: string }> = {
  'a-pagar': { titulo: 'A pagar', sub: 'Pix lançados e ainda não enviados. Pagar manda na hora pela conta da Lagun.' },
  historico: { titulo: 'Histórico', sub: 'Tudo que já foi pago, falhou ou foi cancelado, com o comprovante do banco.' },
  favorecidos: { titulo: 'Favorecidos', sub: 'Quem recebe: artista, fornecedor, staff. Uma chave Pix por favorecido.' },
};

export default function InternoPagamentos() {
  const { aba = 'a-pagar' } = useParams<{ aba: string }>();
  const { user } = useAuth();
  const [acesso, setAcesso] = useState<boolean | null>(null);
  const favs = useFavorecidos();
  const banco = useBanco();
  const [lancando, setLancando] = useState(false);
  const [versao, setVersao] = useState(0);
  const atualizar = () => setVersao((v) => v + 1);

  useEffect(() => {
    if (!user) return;
    (supabase as any).from('lagun_pagamentos_usuarios').select('user_id').eq('user_id', user.id).maybeSingle()
      .then(({ data }: { data: unknown }) => setAcesso(!!data));
  }, [user?.id]);

  if (!ABAS.includes(aba as Aba)) return <Navigate to="/interno/pagamentos/a-pagar" replace />;
  const atual = aba as Aba;

  if (acesso === null) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-muted-foreground" size={24} /></div>;
  if (!acesso) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
        <ShieldCheck size={28} className="text-muted-foreground/60" />
        <p className="text-sm font-medium text-foreground">Esta área é só de quem faz os pagamentos da casa.</p>
        <p className="text-xs text-muted-foreground">Se você precisa de acesso, fale com o Bruno ou com o Peset.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-md:space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-semibold text-foreground max-md:text-lg">{TITULOS[atual].titulo}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{TITULOS[atual].sub}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ChipBanco banco={banco} />
          {atual !== 'favorecidos' && (
            <button onClick={() => setLancando(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold text-white transition-colors hover:brightness-110" style={{ background: OURO }}>
              <Plus size={15} /> Lançar pagamento
            </button>
          )}
        </div>
      </div>

      {atual === 'a-pagar' && <APagar versao={versao} onMudou={atualizar} bancoPronto={!!banco?.configurado} />}
      {atual === 'historico' && <Historico versao={versao} onMudou={atualizar} />}
      {atual === 'favorecidos' && <Favorecidos favorecidos={favs.favorecidos} carregando={favs.carregando} onMudou={favs.recarregar} />}

      <DialogoLancar aberto={lancando} onFechar={() => setLancando(false)} favorecidos={favs.favorecidos.filter((f) => f.ativo)} onSalvou={() => { setLancando(false); atualizar(); }} />
    </div>
  );
}

// ── Banco ──────────────────────────────────────────────────────────────────
function ChipBanco({ banco }: { banco: { configurado: boolean; banco: string; ambiente?: string } | null }) {
  if (!banco) return null;
  const ok = banco.configurado;
  return (
    <span className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[11px] font-medium ${ok ? 'border-emerald-500/30 text-emerald-400' : 'border-amber-500/30 text-amber-400'}`} title={ok ? `Conectado ao ${banco.banco}` : 'As chaves da API do banco ainda não foram configuradas'}>
      <Banknote size={14} /> {ok ? `${banco.banco}${banco.ambiente === 'sandbox' ? ' (teste)' : ''}` : 'Banco não conectado'}
    </span>
  );
}

// ── A pagar ────────────────────────────────────────────────────────────────
function APagar({ versao, onMudou, bancoPronto }: { versao: number; onMudou: () => void; bancoPronto: boolean }) {
  const { pagamentos, carregando, recarregar } = usePagamentos('abertos');
  const { limite, salvar: salvarLimite } = useLimiteDiario();
  const [pagando, setPagando] = useState<string | null>(null);
  const [editandoLimite, setEditandoLimite] = useState(false);
  const [limiteTexto, setLimiteTexto] = useState('');
  useEffect(() => { recarregar(); }, [versao, recarregar]);

  const total = useMemo(() => pagamentos.filter((p) => p.status === 'a_pagar').reduce((s, p) => s + p.valor, 0), [pagamentos]);
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

  async function pagar(p: Pagamento) {
    if (!bancoPronto) { toast.error('A conta do banco ainda não foi conectada. Dá pra lançar, mas não pagar.'); return; }
    const ok = await confirmDialog({
      title: 'Confirmar Pix',
      description: `Enviar ${fmtBRL(p.valor)} para ${p.favorecido?.nome ?? 'favorecido'} (${p.favorecido ? chaveBonita(p.favorecido) : ''})? O Pix sai da conta da Lagun na hora e não tem volta.`,
      confirmText: `Pagar ${fmtBRL(p.valor)}`,
    });
    if (!ok) return;
    setPagando(p.id);
    const r = await chamarFuncao({ action: 'pagar', pagamento_id: p.id });
    setPagando(null);
    if (!r.ok) { toast.error(r.data?.mensagem ?? r.data?.error ?? 'O banco não aceitou o pagamento'); recarregar(); return; }
    const st = r.data?.pagamento?.status;
    if (st === 'pago') toast.success(`Pix de ${fmtBRL(p.valor)} enviado`);
    else if (st === 'falhou') toast.error(r.data?.pagamento?.erro ?? 'O banco recusou o Pix');
    else toast.info('Pix enviado ao banco, aguardando confirmação');
    onMudou();
  }

  async function consultar(p: Pagamento) {
    const r = await chamarFuncao({ action: 'consultar', pagamento_id: p.id });
    if (!r.ok) { toast.error(r.data?.error ?? 'Não consegui consultar'); return; }
    toast.success(`Status: ${STATUS[r.data?.pagamento?.status as keyof typeof STATUS]?.rotulo ?? '…'}`);
    onMudou();
  }

  async function cancelar(p: Pagamento) {
    const ok = await confirmDialog({ title: 'Cancelar pagamento', description: `${p.descricao}, ${fmtBRL(p.valor)} para ${p.favorecido?.nome ?? ''}. Ele sai da lista e vai pro histórico como cancelado.`, confirmText: 'Cancelar pagamento', destructive: true });
    if (!ok) return;
    const { error } = await (supabase as any).from('lagun_pagamentos').update({ status: 'cancelado' }).eq('id', p.id);
    if (error) { toast.error('Erro ao cancelar: ' + error.message); return; }
    toast.success('Pagamento cancelado');
    onMudou();
  }

  async function gravarLimite() {
    const v = Number(limiteTexto.replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(v) || v < 0) { toast.error('Valor inválido'); return; }
    const error = await salvarLimite(v);
    if (error) { toast.error('Erro ao salvar: ' + error.message); return; }
    toast.success(v > 0 ? `Limite do dia: ${fmtBRL(v)}` : 'Sem limite diário');
    setEditandoLimite(false);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Indicador rotulo="A pagar" valor={fmtBRL(total)} sub={`${pagamentos.filter((p) => p.status === 'a_pagar').length} pagamento(s)`} />
        <Indicador rotulo="Processando" valor={String(pagamentos.filter((p) => p.status === 'processando').length)} sub="aguardando o banco" />
        <Indicador rotulo="Limite por dia" valor={limite === null ? '…' : limite > 0 ? fmtBRL(limite) : 'Sem limite'} sub={
          editandoLimite ? (
            <span className="flex items-center gap-1">
              <input autoFocus value={limiteTexto} onChange={(e) => setLimiteTexto(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void gravarLimite(); if (e.key === 'Escape') setEditandoLimite(false); }} placeholder="0 = sem limite" className="h-7 w-28 rounded-md border border-border bg-background px-2 text-xs text-foreground" />
              <button onClick={() => void gravarLimite()} className="text-xs font-semibold" style={{ color: OURO }}>ok</button>
            </span>
          ) : (
            <button onClick={() => { setLimiteTexto(limite ? String(limite).replace('.', ',') : ''); setEditandoLimite(true); }} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Pencil size={11} /> alterar</button>
          )
        } />
      </div>

      <Quadro titulo="Pagamentos abertos">
        {carregando ? <Carregando /> : pagamentos.length === 0 ? (
          <Vazio icone={<Wallet size={28} />}>Nada a pagar. Lance um pagamento pelo botão acima.</Vazio>
        ) : (
          <div className="divide-y divide-border">
            {pagamentos.map((p) => {
              const atrasado = p.status === 'a_pagar' && p.vencimento && p.vencimento < hoje;
              const vence = p.status === 'a_pagar' && p.vencimento === hoje;
              return (
                <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                      {p.favorecido?.nome ?? 'Favorecido removido'}
                      <Etiqueta status={p.status} />
                      {atrasado && <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-400"><AlertTriangle size={10} /> atrasado</span>}
                      {vence && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">vence hoje</span>}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {p.descricao}{p.evento ? ` · ${p.evento.nome}` : ''}{p.vencimento ? ` · vence ${fmtData(p.vencimento)}` : ''}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground/80">{p.favorecido ? `${TIPOS_CHAVE[p.favorecido.tipo_chave]} ${chaveBonita(p.favorecido)}` : ''}</p>
                  </div>
                  <p className="font-display text-base font-semibold text-foreground">{fmtBRL(p.valor)}</p>
                  <div className="flex items-center gap-1.5">
                    {p.status === 'a_pagar' && (
                      <>
                        <button onClick={() => void pagar(p)} disabled={pagando === p.id} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-60" style={{ background: OURO }}>
                          {pagando === p.id ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Pagar
                        </button>
                        <button onClick={() => void cancelar(p)} title="Cancelar" className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-red-400"><Ban size={14} /></button>
                      </>
                    )}
                    {p.status === 'processando' && (
                      <button onClick={() => void consultar(p)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-muted"><RefreshCw size={13} /> Consultar</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Quadro>
    </div>
  );
}

// ── Histórico ──────────────────────────────────────────────────────────────
function Historico({ versao, onMudou }: { versao: number; onMudou: () => void }) {
  const { pagamentos, carregando, recarregar } = usePagamentos('historico');
  const [aberto, setAberto] = useState<Pagamento | null>(null);
  const [filtro, setFiltro] = useState<'todos' | 'pago' | 'falhou' | 'cancelado'>('todos');
  useEffect(() => { recarregar(); }, [versao, recarregar]);

  const lista = filtro === 'todos' ? pagamentos : pagamentos.filter((p) => p.status === filtro);
  const totalPago = useMemo(() => pagamentos.filter((p) => p.status === 'pago').reduce((s, p) => s + p.valor, 0), [pagamentos]);

  async function relancar(p: Pagamento) {
    const { error } = await (supabase as any).from('lagun_pagamentos').insert({ favorecido_id: p.favorecido_id, event_id: p.event_id, descricao: p.descricao, valor: p.valor, vencimento: p.vencimento });
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Lançado de novo em A pagar');
    onMudou();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Total pago: <span className="font-semibold text-foreground">{fmtBRL(totalPago)}</span></p>
        <div className="flex gap-1">
          {(['todos', 'pago', 'falhou', 'cancelado'] as const).map((f) => (
            <button key={f} onClick={() => setFiltro(f)} className={`rounded-full px-3 py-1 text-[11px] font-medium ${filtro === f ? 'bg-foreground text-background' : 'border border-border text-muted-foreground hover:text-foreground'}`}>
              {f === 'todos' ? 'Todos' : STATUS[f].rotulo}
            </button>
          ))}
        </div>
      </div>
      <Quadro titulo={`Histórico (${lista.length})`}>
        {carregando ? <Carregando /> : lista.length === 0 ? <Vazio icone={<History size={28} />}>Nenhum pagamento aqui ainda.</Vazio> : (
          <div className="divide-y divide-border">
            {lista.map((p) => (
              <button key={p.id} onClick={() => setAberto(p)} className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03]">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">{p.favorecido?.nome ?? 'Favorecido removido'} <Etiqueta status={p.status} /></p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{p.descricao}{p.evento ? ` · ${p.evento.nome}` : ''} · {fmtDataHora(p.pago_em ?? p.created_at)}</p>
                  {p.erro && <p className="mt-0.5 text-[11px] text-red-400">{p.erro}</p>}
                </div>
                <p className="font-display text-base font-semibold text-foreground">{fmtBRL(p.valor)}</p>
              </button>
            ))}
          </div>
        )}
      </Quadro>
      <DialogoDetalhe pagamento={aberto} onFechar={() => setAberto(null)} onRelancar={relancar} />
    </div>
  );
}

function DialogoDetalhe({ pagamento: p, onFechar, onRelancar }: { pagamento: Pagamento | null; onFechar: () => void; onRelancar: (p: Pagamento) => void }) {
  const [log, setLog] = useState<LogItem[]>([]);
  useEffect(() => {
    if (!p) return;
    (supabase as any).from('lagun_pagamentos_log').select('id, acao, detalhe, user_id, created_at').eq('pagamento_id', p.id).order('created_at')
      .then(({ data }: { data: LogItem[] | null }) => setLog(data || []));
  }, [p?.id]);
  if (!p) return null;
  const copiar = (t: string) => { navigator.clipboard.writeText(t); toast.success('Copiado'); };
  const ACOES: Record<string, string> = { lancado: 'Lançado', cancelado: 'Cancelado', pagar: 'Mandou pagar', banco_aceitou: 'Banco aceitou', pago: 'Pago', falhou: 'Falhou', consulta: 'Consulta ao banco', webhook: 'Aviso do banco' };
  return (
    <Dialog open={!!p} onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2">{p.favorecido?.nome} <Etiqueta status={p.status} /></DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded-lg border border-border p-3">
            <p className="font-display text-2xl font-semibold text-foreground">{fmtBRL(p.valor)}</p>
            <p className="text-xs text-muted-foreground">{p.descricao}{p.evento ? ` · ${p.evento.nome}` : ''}</p>
          </div>
          <Linha rotulo="Chave Pix" valor={p.chave_pix_usada ?? (p.favorecido ? chaveBonita(p.favorecido) : '')} />
          {p.nome_no_banco && <Linha rotulo="Nome no banco" valor={p.nome_no_banco} />}
          {p.end_to_end_id && <Linha rotulo="Comprovante (E2E)" valor={p.end_to_end_id} acao={<button onClick={() => copiar(p.end_to_end_id!)} className="text-muted-foreground hover:text-foreground"><Copy size={13} /></button>} />}
          {p.pago_em && <Linha rotulo={p.status === 'pago' ? 'Pago em' : 'Tentativa em'} valor={fmtDataHora(p.pago_em)} />}
          {p.erro && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{p.erro}</p>}
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Registro</p>
            <ul className="space-y-1 text-[11px] text-muted-foreground">
              {log.map((l) => <li key={l.id} className="flex justify-between gap-2"><span>{ACOES[l.acao] ?? l.acao}</span><span>{fmtDataHora(l.created_at)}</span></li>)}
            </ul>
          </div>
          {(p.status === 'falhou' || p.status === 'cancelado') && (
            <button onClick={() => { onRelancar(p); onFechar(); }} className="w-full rounded-lg py-2.5 text-sm font-medium text-white hover:brightness-110" style={{ background: OURO }}>Lançar de novo</button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Favorecidos ────────────────────────────────────────────────────────────
const favVazio = { nome: '', documento: '', chave: '', categoria: 'fornecedor' as Categoria, observacao: '', ativo: true };

function Favorecidos({ favorecidos, carregando, onMudou }: { favorecidos: Favorecido[]; carregando: boolean; onMudou: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<Favorecido | null>(null);
  const [form, setForm] = useState(favVazio);
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useState('');

  function abrir(f: Favorecido | null) {
    setEditando(f);
    setForm(f ? { nome: f.nome, documento: f.documento ?? '', chave: f.chave_pix, categoria: f.categoria, observacao: f.observacao ?? '', ativo: f.ativo } : favVazio);
    setAberto(true);
  }

  async function salvar() {
    const nome = form.nome.trim();
    if (nome.length < 2) { toast.error('Informe o nome'); return; }
    const chave = normalizarChave(form.chave);
    if ('erro' in chave) { toast.error(chave.erro); return; }
    const documento = form.documento.replace(/\D/g, '') || null;
    if (documento && documento.length !== 11 && documento.length !== 14) { toast.error('CPF ou CNPJ inválido'); return; }
    const repetido = favorecidos.find((f) => f.id !== editando?.id && f.chave_pix.toLowerCase() === chave.chave.toLowerCase());
    if (repetido) { toast.error(`Essa chave já está com ${repetido.nome}.`); return; }
    setSalvando(true);
    const payload = { nome, documento, tipo_chave: chave.tipo, chave_pix: chave.chave, categoria: form.categoria, observacao: form.observacao.trim() || null, ativo: form.ativo };
    const { error } = editando
      ? await (supabase as any).from('lagun_favorecidos').update(payload).eq('id', editando.id)
      : await (supabase as any).from('lagun_favorecidos').insert(payload);
    setSalvando(false);
    if (error) { toast.error('Erro ao salvar: ' + error.message); return; }
    toast.success(editando ? 'Favorecido atualizado' : 'Favorecido cadastrado');
    setAberto(false);
    onMudou();
  }

  const lista = favorecidos.filter((f) => !busca || `${f.nome} ${f.chave_pix} ${f.documento ?? ''}`.toLowerCase().includes(busca.toLowerCase()));

  return (
    <>
      <Quadro
        titulo={`Favorecidos (${favorecidos.length})`}
        extra={
          <div className="flex items-center gap-2">
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar" className="h-8 w-36 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground" />
            <button onClick={() => abrir(null)} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold text-white hover:brightness-110" style={{ background: OURO }}><Plus size={15} /> Novo favorecido</button>
          </div>
        }
      >
        {carregando ? <Carregando /> : lista.length === 0 ? <Vazio icone={<UserPlus size={28} />}>Nenhum favorecido cadastrado ainda.</Vazio> : (
          <div className="divide-y divide-border">
            {lista.map((f) => (
              <div key={f.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                    {f.nome}
                    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-normal text-foreground/80">{CATEGORIAS[f.categoria]}</span>
                    {!f.ativo && <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-normal text-muted-foreground">Inativo</span>}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{TIPOS_CHAVE[f.tipo_chave]} · {chaveBonita(f)}{f.observacao ? ` · ${f.observacao}` : ''}</p>
                </div>
                <button onClick={() => abrir(f)} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground"><Pencil size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </Quadro>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editando ? 'Editar favorecido' : 'Novo favorecido'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Campo rotulo="Nome *"><input autoFocus value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="Quem recebe" className={ENTRADA} /></Campo>
            <Campo rotulo="Chave Pix *" ajuda="CPF, CNPJ, e-mail, telefone ou chave aleatória. O nome de quem recebe é conferido pelo banco na hora do Pix.">
              <input value={form.chave} onChange={(e) => setForm((f) => ({ ...f, chave: e.target.value }))} placeholder="000.000.000-00 ou email@…" className={ENTRADA} />
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Categoria">
                <select value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value as Categoria }))} className={ENTRADA}>
                  {(Object.keys(CATEGORIAS) as Categoria[]).map((c) => <option key={c} value={c}>{CATEGORIAS[c]}</option>)}
                </select>
              </Campo>
              <Campo rotulo="CPF/CNPJ"><input value={form.documento} onChange={(e) => setForm((f) => ({ ...f, documento: e.target.value }))} placeholder="opcional" inputMode="numeric" className={ENTRADA} /></Campo>
            </div>
            <Campo rotulo="Observação"><input value={form.observacao} onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))} placeholder="ex: DJ residente, som e luz" className={ENTRADA} /></Campo>
            {editando && (
              <label className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm text-foreground">
                Ativo
                <input type="checkbox" checked={form.ativo} onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.checked }))} className="h-4 w-4 accent-[#D9B14E]" />
              </label>
            )}
            <BotoesDialogo onCancelar={() => setAberto(false)} onSalvar={() => void salvar()} salvando={salvando} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Lançar pagamento ───────────────────────────────────────────────────────
function DialogoLancar({ aberto, onFechar, favorecidos, onSalvou }: { aberto: boolean; onFechar: () => void; favorecidos: Favorecido[]; onSalvou: () => void }) {
  const eventos = useEventosRecentes();
  const [form, setForm] = useState({ favorecido: '', descricao: '', valor: '', vencimento: '', evento: '' });
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { if (aberto) setForm((f) => ({ ...f, favorecido: f.favorecido || favorecidos[0]?.id || '', descricao: '', valor: '', vencimento: '' })); }, [aberto, favorecidos]);

  const fav = favorecidos.find((f) => f.id === form.favorecido);

  async function salvar() {
    if (!form.favorecido) { toast.error('Escolha o favorecido'); return; }
    const valor = Number(form.valor.replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(valor) || valor <= 0) { toast.error('Informe o valor'); return; }
    if (form.descricao.trim().length < 2) { toast.error('Descreva o pagamento (aparece no extrato)'); return; }
    setSalvando(true);
    const { error } = await (supabase as any).from('lagun_pagamentos').insert({
      favorecido_id: form.favorecido, descricao: form.descricao.trim(), valor, vencimento: form.vencimento || null, event_id: form.evento || null,
    });
    setSalvando(false);
    if (error) { toast.error('Erro ao lançar: ' + error.message); return; }
    toast.success('Pagamento lançado');
    onSalvou();
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Lançar pagamento</DialogTitle></DialogHeader>
        {favorecidos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Cadastre um favorecido primeiro, na aba Favorecidos.</p>
        ) : (
          <div className="space-y-3">
            <Campo rotulo="Favorecido *">
              <select value={form.favorecido} onChange={(e) => setForm((f) => ({ ...f, favorecido: e.target.value }))} className={ENTRADA}>
                {favorecidos.map((f) => <option key={f.id} value={f.id}>{f.nome} · {CATEGORIAS[f.categoria]}</option>)}
              </select>
              {fav && <p className="mt-1 text-[11px] text-muted-foreground">{TIPOS_CHAVE[fav.tipo_chave]} {chaveBonita(fav)}</p>}
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Valor (R$) *"><input value={form.valor} onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))} placeholder="1.500,00" inputMode="decimal" className={ENTRADA} /></Campo>
              <Campo rotulo="Vencimento"><input type="date" value={form.vencimento} onChange={(e) => setForm((f) => ({ ...f, vencimento: e.target.value }))} className={ENTRADA} /></Campo>
            </div>
            <Campo rotulo="Descrição *" ajuda="Vai no Pix e no extrato. Até 140 caracteres.">
              <input value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value.slice(0, 140) }))} placeholder="ex: Cachê show 24/10" className={ENTRADA} />
            </Campo>
            <Campo rotulo="Evento">
              <select value={form.evento} onChange={(e) => setForm((f) => ({ ...f, evento: e.target.value }))} className={ENTRADA}>
                <option value="">Sem evento</option>
                {eventos.map((e) => <option key={e.id} value={e.id}>{e.nome}{e.data ? ` · ${fmtData(e.data)}` : ''}</option>)}
              </select>
            </Campo>
            <BotoesDialogo onCancelar={onFechar} onSalvar={() => void salvar()} salvando={salvando} rotulo="Lançar" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Peças ──────────────────────────────────────────────────────────────────
const ENTRADA = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#D9B14E]';

function Etiqueta({ status }: { status: Pagamento['status'] }) {
  const s = STATUS[status];
  const Icone = status === 'pago' ? CheckCircle2 : status === 'falhou' ? XCircle : status === 'processando' ? Loader2 : null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ color: s.cor, background: `${s.cor}1a` }}>
      {Icone && <Icone size={10} className={status === 'processando' ? 'animate-spin' : ''} />}{s.rotulo}
    </span>
  );
}

function Indicador({ rotulo, valor, sub }: { rotulo: string; valor: string; sub?: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className="mt-1 font-display text-xl font-semibold text-foreground">{valor}</p>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Linha({ rotulo, valor, acao }: { rotulo: string; valor: string; acao?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="flex items-center gap-2 truncate text-foreground">{valor}{acao}</span>
    </div>
  );
}

function Quadro({ titulo, extra, children }: { titulo: ReactNode; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="font-display text-sm font-semibold text-foreground">{titulo}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

function Vazio({ icone, children }: { icone: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <span className="text-muted-foreground/60">{icone}</span>
      <p className="text-xs text-muted-foreground">{children}</p>
    </div>
  );
}

function Carregando() {
  return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" size={22} /></div>;
}

function Campo({ rotulo, ajuda, children }: { rotulo: string; ajuda?: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{rotulo}</label>
      {children}
      {ajuda && <p className="mt-1 text-[11px] text-muted-foreground">{ajuda}</p>}
    </div>
  );
}

function BotoesDialogo({ onCancelar, onSalvar, salvando, rotulo = 'Salvar' }: { onCancelar: () => void; onSalvar: () => void; salvando: boolean; rotulo?: string }) {
  return (
    <div className="flex gap-3 pt-2">
      <button onClick={onCancelar} className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted">Cancelar</button>
      <button onClick={onSalvar} disabled={salvando} className="flex-1 rounded-lg py-2.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-60" style={{ background: OURO }}>
        {salvando ? 'Salvando…' : rotulo}
      </button>
    </div>
  );
}
