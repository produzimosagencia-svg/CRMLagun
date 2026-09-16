import type { CSSProperties } from 'react';
import { Destaque, Faixa, FolhaA4, H2 } from './RelatorioCampanhas';

/**
 * Relatório de Social Media (Instagram) em A4, no mesmo template dos relatórios
 * de campanhas e disparos. Sem miniaturas: as imagens do CDN da Meta não
 * liberam CORS e mancham o canvas do html2canvas.
 */
export type PostRel = { id: string; legenda: string; data: string; tipo: string; curtidas: number; comentarios: number };

const fraco = (a: number) => `rgba(25,24,19,${a})`;
const ROTULO: CSSProperties = { fontSize: 9, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: fraco(0.5) };
const n = (v: number) => v.toLocaleString('pt-BR');
const cortar = (t: string, max: number) => { const x = (t || 'Sem legenda').split('\n')[0].trim(); return x.length > max ? `${x.slice(0, max - 1).trimEnd()}…` : x; };
const TIPO: Record<string, string> = { VIDEO: 'Reels', IMAGE: 'Foto', CAROUSEL_ALBUM: 'Carrossel' };

export function RelatorioSocialMedia({ usuario, seguidores, publicacoes, curtidas, comentarios, engajamento, posts }: {
  usuario: string; seguidores: number; publicacoes: number; curtidas: number; comentarios: number;
  engajamento: string; posts: PostRel[];
}) {
  const th: CSSProperties = { ...ROTULO, textAlign: 'right', padding: '0 0 5px', whiteSpace: 'nowrap' };
  const td: CSSProperties = { padding: '7px 0', textAlign: 'right', whiteSpace: 'nowrap' };
  const top = [...posts].sort((a, b) => (b.curtidas + b.comentarios) - (a.curtidas + a.comentarios)).slice(0, 15);
  return (
    <FolhaA4 contexto={`Social Media · Instagram @${usuario}`}>
      <div data-bloco style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20 }}>
        <div>
          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 500, fontSize: 30, lineHeight: 1.05, letterSpacing: '-.025em', margin: 0 }}>Social Media</h1>
          <p style={{ margin: '7px 0 0', fontSize: 11.5, lineHeight: 1.45, color: fraco(0.65), maxWidth: '40em' }}>
            Lagun · Instagram @{usuario} · {n(publicacoes)} publicações analisadas, gerado em {new Date().toLocaleDateString('pt-BR')}.
          </p>
        </div>
        <Destaque rotulo="Seguidores" valor={n(seguidores)} sub="conta profissional" />
      </div>

      <Faixa itens={[
        { rotulo: 'Publicações', valor: n(publicacoes), sub: 'carregadas' },
        { rotulo: 'Curtidas', valor: n(curtidas), sub: 'somadas' },
        { rotulo: 'Comentários', valor: n(comentarios), sub: 'somados' },
        { rotulo: 'Engajamento', valor: engajamento, sub: 'média por publicação', destaque: true },
      ]} />

      <div data-bloco>
        <H2 linha={false}>Publicações que mais engajaram</H2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, tableLayout: 'fixed' }}>
          <colgroup><col style={{ width: '5%' }} /><col style={{ width: '45%' }} /><col style={{ width: '11%' }} /><col style={{ width: '12%' }} /><col style={{ width: '9%' }} /><col style={{ width: '9%' }} /><col style={{ width: '9%' }} /></colgroup>
          <thead><tr>
            <th style={{ ...th, textAlign: 'left' }}>#</th><th style={{ ...th, textAlign: 'left' }}>Publicação</th>
            <th style={{ ...th, textAlign: 'left' }}>Tipo</th><th style={th}>Data</th>
            <th style={th}>Curtidas</th><th style={th}>Coment.</th><th style={th}>Total</th>
          </tr></thead>
          <tbody>
            {top.map((p, i, arr) => (
              <tr key={p.id} style={{ borderTop: `1px solid ${fraco(0.1)}`, borderBottom: i === arr.length - 1 ? `1px solid ${fraco(0.1)}` : undefined }}>
                <td style={{ padding: '7px 0', fontSize: 10.5, color: fraco(0.5) }}>{i + 1}</td>
                <td style={{ padding: '7px 8px 7px 0', fontSize: 10.5, whiteSpace: 'nowrap', overflow: 'hidden' }}>{cortar(p.legenda, 58)}</td>
                <td style={{ padding: '7px 0', fontSize: 10.5, color: fraco(0.6) }}>{TIPO[p.tipo] || p.tipo}</td>
                <td style={{ ...td, color: fraco(0.6) }}>{new Date(p.data).toLocaleDateString('pt-BR')}</td>
                <td style={td}>{n(p.curtidas)}</td>
                <td style={td}>{n(p.comentarios)}</td>
                <td style={{ ...td, fontWeight: 600 }}>{n(p.curtidas + p.comentarios)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ margin: '6px 0 0', fontSize: 9.5, color: fraco(0.5) }}>
          Engajamento = (curtidas + comentários) por publicação ÷ seguidores. Alcance e impressões não entram: a Meta não libera os Insights para este app.
        </p>
      </div>
    </FolhaA4>
  );
}
