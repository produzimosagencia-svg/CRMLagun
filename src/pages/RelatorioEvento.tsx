import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertTriangle, FileDown, RotateCcw } from 'lucide-react';
import { gerarRelatorioPdfBlob } from '@/lib/relatorioPdf';
import { RelatorioCampanhas, type CriativoRel, type LinhaCampanha } from '@/components/interno/RelatorioCampanhas';
import marcaLagun from '@/assets/palavra-lagun-branco.png';

/**
 * Link secreto do relatório de campanhas de um evento (/relatorio/<token>).
 *
 * Público, sem login: enviado aos produtores pelo WhatsApp. Busca os dados na
 * edge function relatorio-evento (só as campanhas vinculadas ao evento), monta o
 * PDF no mesmo modelo do relatório interno e abre direto no navegador. Se o
 * navegador do app bloquear a navegação para o blob, fica a tela com
 * "Baixar PDF".
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
  | { fase: 'pronto'; url: string; arquivo: string; evento: string }
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
  const urlAtual = useRef<string | null>(null);

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

      try {
        const nome = dados.evento?.nome || 'Evento';
        const blob = await gerarRelatorioPdfBlob(
          <RelatorioCampanhas
            cliente={nome}
            periodo={PERIODOS[dados.date_preset || 'maximum'] || 'Todo o período'}
            dias={dados.dias || 30}
            campanhas={campanhas}
            criativos={dados.criativos || []}
          />,
        );
        if (cancelado) return;
        const url = URL.createObjectURL(blob);
        urlAtual.current = url;
        const arquivo = `relatorio-${slug(nome) || 'evento'}-${new Date().toISOString().slice(0, 10)}.pdf`;
        setEstado({ fase: 'pronto', url, arquivo, evento: nome });
        // Abre o PDF direto. Alguns navegadores de app bloqueiam blob; aí fica a tela com o botão.
        try { window.location.replace(url); } catch { /* segue na tela de download */ }
      } catch (e) {
        console.error('[Relatório] Falha ao gerar PDF', e);
        erro('erro_interno');
      }
    })();

    return () => { cancelado = true; };
  }, [token, tentativa]);

  // Libera o blob ao sair da página.
  useEffect(() => () => { if (urlAtual.current) URL.revokeObjectURL(urlAtual.current); }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#06060A] px-4 py-10 text-center text-white">
      <div className="w-full max-w-sm">
        <img src={marcaLagun} alt="Lagun" className="mx-auto mb-10 h-7 w-auto opacity-90" />

        {estado.fase === 'carregando' && (
          <div role="status" aria-live="polite">
            <div className="mx-auto mb-5 h-10 w-10 animate-spin rounded-full border-[3px] border-white/10 border-t-[#FFE14D]" />
            <p className="text-base font-semibold">Gerando relatório…</p>
            <p className="mt-2 text-sm text-white/50">Buscando os dados das campanhas no Meta Ads. Leva alguns segundos.</p>
          </div>
        )}

        {estado.fase === 'pronto' && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.14em] text-[#FFE14D]">Relatório de campanhas</p>
            <h1 className="mt-2 text-xl font-semibold">{estado.evento}</h1>
            <p className="mt-2 text-sm text-white/50">Se o PDF não abriu sozinho, toque no botão abaixo.</p>
            <a
              href={estado.url}
              download={estado.arquivo}
              className="mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#FFE14D] px-6 text-sm font-semibold text-black shadow-[0_0_24px_rgba(255,225,77,.4)] transition hover:bg-[#FFEC8A]"
            >
              <FileDown size={16} /> Baixar PDF
            </a>
            <a href={estado.url} target="_blank" rel="noreferrer" className="mt-4 block text-xs text-white/50 underline underline-offset-4 hover:text-white/80">
              Abrir em nova aba
            </a>
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
