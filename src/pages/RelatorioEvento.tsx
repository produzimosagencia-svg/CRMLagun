import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import { useParams } from 'react-router-dom';
import { AlertTriangle, FileDown, Loader2, RotateCcw } from 'lucide-react';
import { A4_W, gerarRelatorioPdfBlob } from '@/lib/relatorioPdf';
import { RelatorioCampanhas, type CriativoRel, type LinhaCampanha } from '@/components/interno/RelatorioCampanhas';
import marcaLagun from '@/assets/palavra-lagun-branco.png';

/**
 * Link secreto do relatório de campanhas de um evento (/relatorio/<token>).
 *
 * Público, sem login: enviado aos produtores pelo WhatsApp. Busca os dados na
 * edge function relatorio-evento (só as campanhas vinculadas ao evento) e
 * mostra o relatório NA TELA, no mesmo modelo do PDF, reduzido à largura do
 * celular. O botão "Baixar PDF" gera o arquivo na hora: no celular abre o
 * compartilhamento do aparelho (Salvar em Arquivos, WhatsApp…); onde isso não
 * existe, baixa o arquivo.
 *
 * Antes a página trocava a própria tela pelo PDF em memória (blob:). No
 * navegador de dentro do WhatsApp e no Safari isso abria uma tela branca e os
 * botões sumiam junto.
 */

type Resposta = {
  evento?: { nome: string; data: string | null };
  date_preset?: string;
  dias?: number;
  campanhas?: LinhaCampanha[];
  criativos?: CriativoRel[];
  error?: string;
};

type Estado =
  | { fase: 'carregando' }
  | { fase: 'pronto'; relatorio: ReactElement; arquivo: string; evento: string }
  | { fase: 'erro'; titulo: string; texto: string; tentarDeNovo?: boolean };

const PERIODOS: Record<string, string> = {
  today: 'Hoje', yesterday: 'Ontem', last_7d: 'Últimos 7 dias', last_14d: 'Últimos 14 dias',
  last_30d: 'Últimos 30 dias', last_90d: 'Últimos 90 dias', this_year: 'Este ano',
  last_year: 'Ano passado', maximum: 'Todo o período',
};

const ERROS: Record<string, { titulo: string; texto: string; tentarDeNovo?: boolean }> = {
  link_invalido: { titulo: 'Link inválido', texto: 'Este link de relatório não existe ou foi trocado. Peça um link novo à equipe do Lagun.' },
  sem_campanhas: { titulo: 'Sem campanhas vinculadas', texto: 'Este evento ainda não tem campanhas de anúncio vinculadas. Assim que a equipe vincular, o relatório aparece neste mesmo link.' },
  sem_entrega: { titulo: 'Sem dados no período', texto: 'As campanhas deste evento ainda não tiveram entrega. Tente de novo mais tarde.' },
  meta_indisponivel: { titulo: 'Meta indisponível', texto: 'Não conseguimos buscar os dados do Meta Ads agora. Tente de novo em alguns minutos.', tentarDeNovo: true },
  erro_interno: { titulo: 'Não foi possível gerar o relatório', texto: 'Algo deu errado do nosso lado. Tente de novo em alguns minutos.', tentarDeNovo: true },
};

const slug = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function RelatorioEvento() {
  const { token } = useParams<{ token: string }>();
  const [estado, setEstado] = useState<Estado>({ fase: 'carregando' });
  const [tentativa, setTentativa] = useState(0);
  const [baixando, setBaixando] = useState(false);

  useEffect(() => {
    document.title = 'Relatório de campanhas · Lagun';
  }, []);

  useEffect(() => {
    let cancelado = false;
    const erro = (codigo: string) => {
      if (!cancelado) setEstado({ fase: 'erro', ...(ERROS[codigo] || ERROS.erro_interno) });
    };

    (async () => {
      setEstado({ fase: 'carregando' });
      if (!token || !/^[0-9a-f]{24}$/i.test(token)) return erro('link_invalido');

      let dados: Resposta;
      try {
        const base = import.meta.env.VITE_SUPABASE_URL;
        const chave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const resp = await fetch(
          `${base}/functions/v1/relatorio-evento?token=${encodeURIComponent(token.toLowerCase())}`,
          { headers: { apikey: chave } },
        );
        dados = await resp.json().catch(() => ({ error: resp.status === 404 ? 'link_invalido' : 'erro_interno' }));
        if (!resp.ok || dados.error) return erro(dados.error || 'erro_interno');
      } catch {
        return erro('meta_indisponivel');
      }

      const campanhas = dados.campanhas || [];
      if (!campanhas.length) return erro('sem_entrega');

      if (cancelado) return;
      const nome = dados.evento?.nome || 'Evento';
      const relatorio = (
        <RelatorioCampanhas
          cliente={nome}
          periodo={PERIODOS[dados.date_preset || 'maximum'] || 'Todo o período'}
          dias={dados.dias || 30}
          campanhas={campanhas}
          criativos={dados.criativos || []}
        />
      );
      const arquivo = `relatorio-${slug(nome) || 'evento'}-${new Date().toISOString().slice(0, 10)}.pdf`;
      setEstado({ fase: 'pronto', relatorio, arquivo, evento: nome });
    })();

    return () => { cancelado = true; };
  }, [token, tentativa]);

  async function baixarPdf() {
    if (estado.fase !== 'pronto' || baixando) return;
    setBaixando(true);
    try {
      const blob = await gerarRelatorioPdfBlob(estado.relatorio);
      const arquivo = new File([blob], estado.arquivo, { type: 'application/pdf' });
      // Celular: compartilhamento nativo (Salvar em Arquivos, WhatsApp, e-mail).
      if (navigator.canShare?.({ files: [arquivo] })) {
        try {
          await navigator.share({ files: [arquivo], title: `Relatório · ${estado.evento}` });
          return;
        } catch (e) {
          if ((e as Error)?.name === 'AbortError') return; // pessoa fechou a folha de compartilhar
        }
      }
      // Computador e navegadores sem compartilhamento: download direto.
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = estado.arquivo; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      console.error('[Relatório] Falha ao gerar PDF', e);
      alertaFalha();
    } finally {
      setBaixando(false);
    }
  }

  if (estado.fase === 'pronto') {
    return (
      <main className="min-h-screen bg-[#0B0B10] text-white">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/10 bg-[#06060A]/95 px-4 py-3 backdrop-blur">
          <img src={marcaLagun} alt="Lagun" className="h-5 w-auto opacity-90" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#FFE14D]">Relatório de campanhas</p>
            <p className="truncate text-sm font-semibold">{estado.evento}</p>
          </div>
          <button
            type="button"
            onClick={() => void baixarPdf()}
            disabled={baixando}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-[#FFE14D] px-4 text-sm font-semibold text-black transition hover:bg-[#FFEC8A] disabled:opacity-70"
          >
            {baixando ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
            {baixando ? 'Gerando…' : 'Baixar PDF'}
          </button>
        </header>
        <FolhaNaTela>{estado.relatorio}</FolhaNaTela>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#06060A] px-4 py-10 text-center text-white">
      <div className="w-full max-w-sm">
        <img src={marcaLagun} alt="Lagun" className="mx-auto mb-10 h-7 w-auto opacity-90" />

        {estado.fase === 'carregando' && (
          <div role="status" aria-live="polite">
            <div className="mx-auto mb-5 h-10 w-10 animate-spin rounded-full border-[3px] border-white/10 border-t-[#FFE14D]" />
            <p className="text-base font-semibold">Carregando relatório…</p>
            <p className="mt-2 text-sm text-white/50">Buscando os dados das campanhas no Meta Ads. Leva alguns segundos.</p>
          </div>
        )}

        {estado.fase === 'erro' && (
          <div role="alert">
            <div className="mx-auto mb-5 grid h-11 w-11 place-items-center rounded-full bg-[#FFE14D]/10 text-[#FFE14D]">
              <AlertTriangle size={20} />
            </div>
            <h1 className="text-lg font-semibold">{estado.titulo}</h1>
            <p className="mt-2 text-sm leading-relaxed text-white/55">{estado.texto}</p>
            {estado.tentarDeNovo && (
              <button
                type="button"
                onClick={() => setTentativa((t) => t + 1)}
                className="mt-7 inline-flex h-10 items-center gap-2 rounded-xl border border-white/15 px-5 text-sm font-medium hover:bg-white/5"
              >
                <RotateCcw size={15} /> Tentar de novo
              </button>
            )}
          </div>
        )}

      </div>
    </main>
  );
}

function alertaFalha() {
  // Sem alert(): em app de mensagem ele trava a página. Mensagem simples no topo.
  const aviso = document.createElement('div');
  aviso.textContent = 'Não foi possível gerar o PDF. Tente de novo.';
  aviso.style.cssText = 'position:fixed;left:50%;top:72px;transform:translateX(-50%);z-index:50;background:#2a0d12;color:#fff;border:1px solid #FF4D63;border-radius:12px;padding:10px 14px;font-size:13px';
  document.body.appendChild(aviso);
  window.setTimeout(() => aviso.remove(), 4000);
}

/**
 * Mostra a folha A4 do relatório inteira na tela: ela é montada na largura
 * real do PDF (794px) e reduzida por escala para caber no celular, sem
 * quebrar o layout do relatório.
 */
function FolhaNaTela({ children }: { children: ReactElement }) {
  const caixa = useRef<HTMLDivElement>(null);
  const folha = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(1);
  const [altura, setAltura] = useState<number | null>(null);

  useLayoutEffect(() => {
    const medir = () => {
      const largura = caixa.current?.clientWidth ?? A4_W;
      const e = Math.min(1, largura / A4_W);
      setEscala(e);
      if (folha.current) setAltura(folha.current.offsetHeight * e);
    };
    medir();
    const ro = new ResizeObserver(medir);
    if (caixa.current) ro.observe(caixa.current);
    if (folha.current) ro.observe(folha.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="px-3 py-4 sm:px-6 sm:py-8">
      <div ref={caixa} className="mx-auto w-full" style={{ maxWidth: A4_W, height: altura ?? undefined }}>
        <div
          ref={folha}
          className="origin-top-left overflow-hidden rounded-md bg-white shadow-2xl"
          style={{ width: A4_W, transform: `scale(${escala})` }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
