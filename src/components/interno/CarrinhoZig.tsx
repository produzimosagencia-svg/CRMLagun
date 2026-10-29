import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, MessageSquareText, RotateCcw, ShoppingCart, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { callWhatsappApi } from '@/lib/whatsappApi';

/**
 * Carrinho abandonado e estorno da Zig, no dashboard de cada evento: para cada
 * um, escolhe o template aprovado e liga o envio. Quem manda é a
 * lagun-zig-sync (a cada 10 min). Carrinho: pedido feito depois de ligar,
 * pendente há 30 min ou descartado. Estorno: pedido que muda para estornado
 * depois de ligar. Configuração em lagun_zig_carrinho, envios em
 * lagun_zig_carrinho_envios.
 */

interface Template {
  name: string; language: string; status: string; category?: string;
  components?: { type: string; format?: string; text?: string; example?: { header_handle?: string[] }; buttons?: { type: string; url?: string }[] }[];
}
interface Config {
  event_id: string; phone_number_id: string | null;
  enabled: boolean; template_name: string | null; template_language: string;
  template_variable_count: number; header_image_url: string | null; botao_url_base: string | null; ligado_em: string | null;
  estorno_enabled: boolean; estorno_template_name: string | null; estorno_template_language: string;
  estorno_variable_count: number; estorno_header_image_url: string | null; estorno_botao_url_base: string | null; estorno_ligado_em: string | null;
}
interface Envio { tipo: Tipo; ok: boolean; recuperado_em: string | null; valor_recuperado: number | null }
type Tipo = 'carrinho' | 'estorno';

// Colunas de cada automação em lagun_zig_carrinho.
const COLUNAS = {
  carrinho: { enabled: 'enabled', nome: 'template_name', idioma: 'template_language', vars: 'template_variable_count', imagem: 'header_image_url', botao: 'botao_url_base', ligado: 'ligado_em' },
  estorno: { enabled: 'estorno_enabled', nome: 'estorno_template_name', idioma: 'estorno_template_language', vars: 'estorno_variable_count', imagem: 'estorno_header_image_url', botao: 'estorno_botao_url_base', ligado: 'estorno_ligado_em' },
} as const;
const MARCA: Record<Tipo, RegExp> = { carrinho: /carrinho/i, estorno: /estorn|reembols/i };
const chaveDe = (t: Template) => `${t.name}|${t.language}`;
const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

// O envio automático preenche {{1}} com o primeiro nome, {{2}} com o nome do
// evento, o cabeçalho com a imagem do exemplo e o botão de link variável com o
// final do link do evento.
function analisar(t: Template) {
  const corpo = t.components?.find((c) => c.type === 'BODY')?.text ?? '';
  const header = t.components?.find((c) => c.type === 'HEADER');
  const vars = new Set(corpo.match(/\{\{\d+\}\}/g) ?? []).size;
  const botoes = t.components?.find((c) => c.type === 'BUTTONS')?.buttons ?? [];
  const comVariavel = botoes.filter((b) => b.type === 'URL' && /\{\{\d+\}\}/.test(b.url ?? ''));
  const botaoBase = comVariavel[0]?.url?.replace(/\{\{\d+\}\}.*$/, '') ?? null;
  const imagem = header?.format === 'IMAGE' ? header.example?.header_handle?.[0] ?? null : null;
  const headerVar = header?.format === 'TEXT' && /\{\{\d+\}\}/.test(header.text ?? '');
  const midiaSemSuporte = header && ['VIDEO', 'DOCUMENT'].includes(header.format ?? '');
  const motivo = vars > 2 ? 'tem mais de duas variáveis' : comVariavel.length > 1 ? 'tem mais de um botão com variável' : headerVar ? 'tem variável no cabeçalho' : midiaSemSuporte ? 'cabeçalho com vídeo ou documento' : header?.format === 'IMAGE' && !imagem ? 'cabeçalho sem imagem de exemplo' : null;
  return { corpo, vars, imagem, botaoBase, motivo };
}

/** Uma automação: cabeçalho com o botão, menu de templates, prévia e números. */
function Bloco({ tipo, titulo, Icone, texto, cfg, templates, salvando, salvar, numeros }: {
  tipo: Tipo; titulo: string; Icone: LucideIcon; texto: { ligado: string; desligado: string };
  cfg: Config | null; templates: Template[] | null; salvando: boolean;
  salvar: (tipo: Tipo, enabled: boolean, chave: string) => void; numeros: { valor: string; rotulo: string; forte?: boolean }[];
}) {
  const col = COLUNAS[tipo];
  const ligado = !!cfg?.[col.enabled];
  const nome = cfg?.[col.nome] as string | null | undefined;
  const escolhido = nome ? `${nome}|${cfg?.[col.idioma]}` : '';
  const ligadoEm = cfg?.[col.ligado] as string | null | undefined;
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  // Fecha o menu ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto]);

  // Templates com o nome da automação ("carrinho", "estorno") primeiro.
  const marca = MARCA[tipo];
  const ordenados = useMemo(() => [...(templates ?? [])].sort((a, b) => Number(marca.test(b.name)) - Number(marca.test(a.name)) || a.name.localeCompare(b.name)), [templates, marca]);
  const atual = ordenados.find((t) => chaveDe(t) === escolhido) ?? null;
  const info = atual ? analisar(atual) : null;

  const escolher = (chave: string) => {
    const t = ordenados.find((x) => chaveDe(x) === chave);
    setAberto(false);
    salvar(tipo, ligado && !!t && !analisar(t).motivo, chave);
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-xl transition-colors ${ligado ? 'bg-[#FFE14D] text-black' : 'bg-white/5 text-[#FFE14D] ring-1 ring-white/10'}`}><Icone size={16} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 text-sm font-bold text-white">
            {titulo}
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${ligado ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/5 text-[#8F8A7C]'}`}>{ligado ? 'Ligado' : 'Desligado'}</span>
          </h3>
          <p className="mt-0.5 text-xs text-[#8F8A7C]">{ligado && ligadoEm ? `Desde ${quando(ligadoEm)} · ${texto.ligado}` : texto.desligado}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={ligado}
          aria-label={`Ligar ${titulo.toLowerCase()}`}
          disabled={salvando || !templates}
          onClick={() => salvar(tipo, !ligado, escolhido)}
          className={`relative mt-0.5 h-7 w-12 flex-none rounded-full transition-colors disabled:opacity-50 ${ligado ? 'bg-[#FFE14D]' : 'bg-white/10'}`}
        >
          <span className={`absolute top-1 flex h-5 w-5 items-center justify-center rounded-full shadow transition-all ${ligado ? 'left-6 bg-black' : 'left-1 bg-[#D8D2C7]'}`}>
            {salvando && <Loader2 size={11} className={`animate-spin ${ligado ? 'text-[#FFE14D]' : 'text-black'}`} />}
          </span>
        </button>
      </div>

      {/* Menu de templates (não usa o select do sistema) */}
      <div ref={caixa} className="relative mt-3">
        <button
          type="button"
          disabled={!templates || salvando}
          onClick={() => setAberto((v) => !v)}
          className={`flex h-10 w-full items-center gap-2 rounded-xl border bg-[#12110E] px-3 text-left text-sm transition-colors disabled:opacity-50 ${aberto ? 'border-[#FFE14D]/60' : 'border-[#2A2822] hover:border-[#3A372F]'}`}
        >
          <MessageSquareText size={15} className="flex-none text-[#FFE14D]" />
          <span className={`min-w-0 flex-1 truncate ${atual ? 'font-medium text-white' : 'text-[#8F8A7C]'}`}>
            {atual ? atual.name : templates ? 'Escolha o template' : 'Carregando templates…'}
          </span>
          {atual?.category && <span className="flex-none rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] uppercase text-[#8F8A7C]">{atual.category === 'MARKETING' ? 'Marketing' : atual.category === 'UTILITY' ? 'Utilidade' : atual.category.toLowerCase()}</span>}
          <ChevronDown size={15} className={`flex-none text-[#8F8A7C] transition-transform ${aberto ? 'rotate-180' : ''}`} />
        </button>
        {aberto && (
          <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-72 overflow-y-auto rounded-xl border border-[#2A2822] bg-[#12110E] p-1.5 shadow-2xl shadow-black/60">
            {ordenados.length === 0 && <p className="px-3 py-4 text-center text-xs text-[#8F8A7C]">Nenhum template aprovado na Meta.</p>}
            {ordenados.map((t) => {
              const chave = chaveDe(t);
              const a = analisar(t);
              const sel = chave === escolhido;
              return (
                <button
                  key={chave}
                  type="button"
                  disabled={!!a.motivo}
                  onClick={() => escolher(chave)}
                  className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${sel ? 'bg-[#FFE14D]/10' : 'hover:bg-white/[0.04]'}`}
                >
                  <span className={`mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full border ${sel ? 'border-[#FFE14D] bg-[#FFE14D] text-black' : 'border-white/15'}`}>{sel && <Check size={10} strokeWidth={3} />}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`flex items-center gap-1.5 text-sm ${sel ? 'font-semibold text-[#FFE14D]' : 'text-white'}`}>
                      <span className="truncate">{t.name}</span>
                      {marca.test(t.name) && <span className="flex-none rounded bg-[#FFE14D]/15 px-1 text-[9px] font-bold uppercase text-[#FFE14D]">{tipo}</span>}
                    </span>
                    <span className="block truncate text-[11px] text-[#8F8A7C]">{a.motivo ? `Não serve: ${a.motivo}` : a.corpo.replace(/\{\{1\}\}/g, '[nome]').replace(/\{\{2\}\}/g, '[evento]').replace(/\s+/g, ' ')}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {info && (
        <div className="mt-2 flex min-w-0 gap-2.5 rounded-xl bg-white/[0.03] p-2.5 ring-1 ring-white/5">
          {info.imagem && <img src={info.imagem} alt="" className="h-11 w-11 flex-none rounded-lg object-cover ring-1 ring-white/10" />}
          <p className="line-clamp-2 text-xs leading-relaxed text-[#D8D2C7]">{info.corpo.replace(/\{\{1\}\}/g, '[primeiro nome]').replace(/\{\{2\}\}/g, '[nome do evento]').replace(/\s+/g, ' ')}</p>
        </div>
      )}

      <div className="mt-3 flex gap-5">
        {numeros.map((n) => (
          <div key={n.rotulo}><p className={`text-base font-bold tabular-nums ${n.forte ? 'text-[#FFE14D]' : 'text-white'}`}>{n.valor}</p><p className="text-[11px] text-[#8F8A7C]">{n.rotulo}</p></div>
        ))}
      </div>
    </div>
  );
}

export function CarrinhoZig({ eventoId, cardCls }: { eventoId: string; cardCls: string }) {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [telefoneId, setTelefoneId] = useState<string | null>(null);
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [salvando, setSalvando] = useState<Tipo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [nEstornados, setNEstornados] = useState<number | null>(null);
  const [nAbandonados, setNAbandonados] = useState<number | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const [c, e, est, ab] = await Promise.all([
        (supabase as any).from('lagun_zig_carrinho').select('*').eq('event_id', eventoId).maybeSingle(),
        (supabase as any).from('lagun_zig_carrinho_envios').select('tipo, ok, recuperado_em, valor_recuperado').eq('event_id', eventoId),
        (supabase as any).from('lagun_zig_orders').select('order_id', { count: 'exact', head: true }).eq('event_id', eventoId).in('status', ['estornado', 'estornado_parcialmente']),
        (supabase as any).from('lagun_zig_orders').select('order_id', { count: 'exact', head: true }).eq('event_id', eventoId).in('status', ['pendente', 'descartado']),
      ]);
      if (!vivo) return;
      setCfg(c.data ?? null);
      setEnvios(e.data ?? []);
      setNEstornados(est.count ?? 0);
      setNAbandonados(ab.count ?? 0);
      try {
        const [t, n] = await Promise.all([callWhatsappApi('templates'), callWhatsappApi('phone_numbers')]);
        if (!vivo) return;
        setTemplates(((t?.data ?? []) as Template[]).filter((x) => x.status === 'APPROVED'));
        setTelefoneId(n?.data?.[0]?.id ?? null);
      } catch (err) {
        if (vivo) { setTemplates([]); setErro(err instanceof Error ? err.message : 'Não deu para ler os templates.'); }
      }
    })();
    return () => { vivo = false; };
  }, [eventoId]);

  async function salvar(tipo: Tipo, enabled: boolean, chave: string) {
    const col = COLUNAS[tipo];
    const t = (templates ?? []).find((x) => chaveDe(x) === chave) ?? null;
    if (enabled && (!t || !telefoneId)) { toast.error(!t ? 'Escolha o template antes de ligar.' : 'Número do WhatsApp não encontrado.'); return; }
    const a = t ? analisar(t) : null;
    if (enabled && a?.motivo) { toast.error(`Esse template não serve para o envio automático: ${a.motivo}.`); return; }
    const antes = !!cfg?.[col.enabled];
    const ligadoEm = cfg?.[col.ligado] as string | null | undefined;
    setSalvando(tipo);
    const { data: u } = await supabase.auth.getUser();
    const linha = {
      event_id: eventoId,
      phone_number_id: telefoneId ?? cfg?.phone_number_id ?? null,
      [col.enabled]: enabled,
      [col.nome]: t?.name ?? null,
      [col.idioma]: t?.language ?? 'pt_BR',
      [col.vars]: a?.vars ?? 0,
      [col.imagem]: a?.imagem ?? null,
      [col.botao]: a?.botaoBase ?? null,
      // Conta a partir de quando ligou: carrinho antigo ou estorno antigo não recebe mensagem.
      [col.ligado]: enabled ? (antes && ligadoEm ? ligadoEm : new Date().toISOString()) : ligadoEm ?? null,
      updated_at: new Date().toISOString(),
      updated_by: u.user?.id ?? null,
    };
    const { data, error } = await (supabase as any).from('lagun_zig_carrinho').upsert(linha, { onConflict: 'event_id' }).select('*').single();
    setSalvando(null);
    if (error) { toast.error(`Não salvou: ${error.message}`); return; }
    setCfg(data);
    const nome = tipo === 'carrinho' ? 'Carrinho abandonado' : 'Estorno';
    toast.success(enabled !== antes ? `${nome} ${enabled ? 'ligado' : 'desligado'}.` : 'Template salvo.');
  }

  const carrinhos = envios.filter((e) => e.tipo === 'carrinho' && e.ok);
  const recuperados = carrinhos.filter((e) => e.recuperado_em);
  const valor = recuperados.reduce((s, e) => s + (Number(e.valor_recuperado) || 0), 0);
  const estornos = envios.filter((e) => e.tipo === 'estorno' && e.ok);
  const voltaram = estornos.filter((e) => e.recuperado_em);
  const valorVoltou = voltaram.reduce((s, e) => s + (Number(e.valor_recuperado) || 0), 0);

  return (
    <section className={`${cardCls} flex min-w-0 flex-col gap-4 p-4 sm:p-5`}>
      <Bloco
        tipo="carrinho" titulo="Carrinho abandonado" Icone={ShoppingCart}
        texto={{ ligado: 'Pix pendente há 30 min ou pedido descartado recebe o template, uma vez só.', desligado: 'Quem não concluir a compra na Zig recebe a mensagem no WhatsApp, sozinho.' }}
        cfg={cfg} templates={templates} salvando={salvando === 'carrinho'} salvar={(...a) => void salvar(...a)}
        numeros={[{ valor: nAbandonados == null ? '–' : String(nAbandonados), rotulo: 'não pagos no evento' }, { valor: String(carrinhos.length), rotulo: 'enviados' }, { valor: String(recuperados.length), rotulo: 'compraram depois' }, { valor: brl(valor), rotulo: 'recuperado', forte: true }]}
      />
      <div className="border-t border-white/5" />
      <Bloco
        tipo="estorno" titulo="Estorno" Icone={RotateCcw}
        texto={{ ligado: 'Pedido estornado na Zig recebe o template, uma vez só.', desligado: 'Quem tiver o pedido estornado na Zig recebe a mensagem no WhatsApp, sozinho.' }}
        cfg={cfg} templates={templates} salvando={salvando === 'estorno'} salvar={(...a) => void salvar(...a)}
        numeros={[
          { valor: nEstornados == null ? '–' : String(nEstornados), rotulo: 'estornos no evento' },
          { valor: String(estornos.length), rotulo: 'enviados' },
          { valor: String(voltaram.length), rotulo: 'compraram de novo' },
          { valor: brl(valorVoltou), rotulo: 'recuperado', forte: true },
        ]}
      />
      {erro && <p className="text-xs text-red-400">{erro}</p>}
    </section>
  );
}
