import type { CSSProperties, ReactNode } from 'react';
import { A4_H, A4_W } from '@/lib/relatorioPdf';
// Marca escura: no papel branco o flamingo dourado sumia.
import marcaLagun from '@/assets/palavra-lagun-escuro.png';

/**
 * Relatório de campanhas em A4 — mesmo corpo e mesmas posições do relatório da
 * Produzimos (cabeçalho com marca, destaque de investimento, faixa de métricas,
 * tabela por campanha, grade de criativos e rodapé), com a identidade do Lagun:
 * ouro no lugar do roxo e o flamingo no lugar das pétalas.
 */

export type LinhaCampanha = {
  id: string; name: string; active: boolean; objective?: string;
  spend: number; impressions: number; reach: number; clicks: number;
  results: number; revenue: number; purchases: number;
};
export type CriativoRel = {
  ad_id: string; ad_name: string; campaign_name?: string;
  spend?: string | number; impressions?: string | number; clicks?: string | number;
  ctr?: string | number; thumbnail?: string | null;
};

const TINTA = '#191813';
const OURO = '#8A6B12';      // ouro escurecido: legível sobre papel branco
const OURO_FORTE = '#6B5208';
const fraco = (a: number) => `rgba(25,24,19,${a})`;
const SG: CSSProperties = { fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-.02em' };
const NUM: CSSProperties = { fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-.04em', lineHeight: 1, whiteSpace: 'nowrap' };
const ROTULO: CSSProperties = { fontSize: 9, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: fraco(0.5) };
const GRAD = [
  'linear-gradient(160deg,#FFE14D,#8A6B12)', 'linear-gradient(160deg,#FFB84D,#191813)',
  'linear-gradient(160deg,#FFEC8A,#FFB84D)', 'linear-gradient(160deg,#E8C766,#8A6B12)',
  'linear-gradient(160deg,#D9C27A,#6B5208)',
];

// html2canvas corta texto com overflow/ellipsis; então o corte é feito na string.
const cortar = (t: string | undefined, max: number) => { const x = (t || '—').trim(); return x.length > max ? `${x.slice(0, max - 1).trimEnd()}…` : x; };
const n = (v: number) => v.toLocaleString('pt-BR');
const curto = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(2).replace('.', ',')}M` : v >= 1e4 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${(v / 1000).toFixed(1).replace('.', ',')} mil` : n(Math.round(v)));
const reais = (v: number) => `R$ ${Math.round(v).toLocaleString('pt-BR')}`;
const reais2 = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1).replace('.', ',')}%` : '—');
const roas = (rev: number, spend: number) => (rev && spend ? `${(rev / spend).toFixed(1).replace('.', ',')}×` : '—');

/** Folha A4 com cabeçalho (marca + contexto) e rodapé. */
export function FolhaA4({ contexto, children }: { contexto: string; children: ReactNode }) {
  return (
    <div style={{ width: A4_W, minHeight: A4_H, padding: '40px 53px', boxSizing: 'border-box', background: '#fff', color: TINTA, fontFamily: "'IBM Plex Sans', system-ui, sans-serif", display: 'flex', flexDirection: 'column' }}>
      <div data-bloco style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingBottom: 12, marginBottom: 10, borderBottom: `1px solid ${fraco(0.12)}` }}>
        <img src={marcaLagun} alt="Lagun" style={{ height: 22, width: 'auto', display: 'block' }} />
        <span style={{ fontSize: 11, color: fraco(0.55) }}>{contexto}</span>
      </div>
      <div style={{ flex: 1 }}>{children}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, marginTop: 14, borderTop: `1px solid ${fraco(0.12)}`, fontSize: 10.5, color: fraco(0.55) }}>
        <span>Gerado em {new Date().toLocaleDateString('pt-BR')} · dados da conta conectada</span>
        <span>lagunvitoria.com.br</span>
      </div>
    </div>
  );
}

export const H2 = ({ children, linha = true }: { children: ReactNode; linha?: boolean }) => (
  <h2 style={{ ...SG, fontWeight: 500, fontSize: 17, margin: '14px 0 8px', ...(linha ? { borderTop: `1px solid ${fraco(0.14)}`, paddingTop: 11 } : {}) }}>{children}</h2>
);

export const Faixa = ({ itens }: { itens: { rotulo: string; valor: string; sub: string; destaque?: boolean }[] }) => (
  <div data-bloco style={{ display: 'grid', gridTemplateColumns: `repeat(${itens.length},1fr)`, marginTop: 14, padding: '12px 0', borderTop: `1px solid ${fraco(0.14)}`, borderBottom: `1px solid ${fraco(0.14)}` }}>
    {itens.map((k, i) => (
      <div key={k.rotulo} style={{ padding: i ? '0 12px' : '0 12px 0 0', borderLeft: i ? `1px solid ${fraco(0.12)}` : undefined, minWidth: 0 }}>
        <div style={{ ...ROTULO, color: k.destaque ? OURO : ROTULO.color }}>{k.rotulo}</div>
        <div style={{ ...NUM, fontWeight: k.destaque ? 700 : 600, fontSize: k.valor.length > 10 ? 14 : 17, marginTop: 7, color: k.destaque ? OURO_FORTE : undefined }}>{k.valor}</div>
        <div style={{ fontSize: 10, color: fraco(0.55), marginTop: 5, whiteSpace: 'nowrap' }}>{k.sub}</div>
      </div>
    ))}
  </div>
);

export const Destaque = ({ rotulo, valor, sub }: { rotulo: string; valor: string; sub: string }) => (
  <div style={{ borderRadius: 16, padding: '12px 18px', color: '#191813', minWidth: 190, flex: '0 0 auto', background: 'linear-gradient(45deg,#FFB84D 0%,#FFE14D 55%,#FFEC8A 100%)' }}>
    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', opacity: 0.7 }}>{rotulo}</div>
    <div style={{ ...NUM, fontWeight: 700, fontSize: 21, marginTop: 6, lineHeight: 1.1 }}>{valor}</div>
    <div style={{ fontSize: 10, opacity: 0.75, marginTop: 3 }}>{sub}</div>
  </div>
);

export function RelatorioCampanhas({ cliente, periodo, dias, campanhas, criativos }: {
  cliente: string; periodo: string; dias: number; campanhas: LinhaCampanha[]; criativos: CriativoRel[];
}) {
  const t = campanhas.reduce((s, c) => ({
    spend: s.spend + c.spend, impressions: s.impressions + c.impressions, reach: s.reach + c.reach,
    clicks: s.clicks + c.clicks, results: s.results + c.results, revenue: s.revenue + c.revenue, purchases: s.purchases + c.purchases,
  }), { spend: 0, impressions: 0, reach: 0, clicks: 0, results: 0, revenue: 0, purchases: 0 });
  const ativas = campanhas.filter((c) => c.active).length;
  const fim = new Date(); const ini = new Date(fim.getTime() - (dias - 1) * 864e5);
  const dm = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const temCompra = t.purchases > 0;
  const top = [...criativos].sort((a, b) => Number(b.spend || 0) - Number(a.spend || 0)).slice(0, 10);
  const th: CSSProperties = { ...ROTULO, textAlign: 'right', padding: '0 0 5px', whiteSpace: 'nowrap' };
  const td: CSSProperties = { padding: '7px 0', textAlign: 'right', whiteSpace: 'nowrap' };

  return (
    <FolhaA4 contexto={`Campanhas · Meta Ads · ${periodo}`}>
      <div data-bloco style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20 }}>
        <div>
          <h1 style={{ ...SG, fontWeight: 500, fontSize: 30, lineHeight: 1.05, letterSpacing: '-.025em', margin: 0 }}>Campanhas</h1>
          <p style={{ margin: '7px 0 0', fontSize: 11.5, lineHeight: 1.45, color: fraco(0.65), maxWidth: '40em' }}>
            {cliente} · conta Meta Ads conectada · {campanhas.length} {campanhas.length === 1 ? 'campanha' : 'campanhas'} no relatório, {ativas} {ativas === 1 ? 'ativa' : 'ativas'}, no período de {dm(ini)} a {fim.toLocaleDateString('pt-BR')}.
          </p>
        </div>
        <Destaque rotulo="Investimento" valor={reais(t.spend)} sub={`${reais(t.spend / Math.max(dias, 1))}/dia em média`} />
      </div>

      <Faixa itens={[
        { rotulo: 'Impressões', valor: curto(t.impressions), sub: `alcance ${curto(t.reach)}` },
        { rotulo: 'Cliques', valor: curto(t.clicks), sub: `CTR ${pct(t.clicks, t.impressions)}` },
        temCompra
          ? { rotulo: 'Compras', valor: n(t.purchases), sub: `${reais2(t.spend / t.purchases)}/compra` }
          : { rotulo: 'Resultados', valor: n(t.results), sub: t.results ? `${reais2(t.spend / t.results)}/resultado` : 'sem conversões' },
        { rotulo: 'Receita atribuída', valor: t.revenue ? reais(t.revenue) : '—', sub: '7d clique · 1d view' },
        { rotulo: 'ROAS', valor: roas(t.revenue, t.spend), sub: 'só Meta Ads', destaque: true },
      ]} />

      <div data-bloco>
        <H2 linha={false}>Desempenho por campanha</H2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, tableLayout: 'fixed' }}>
          <colgroup><col style={{ width: '32%' }} /><col style={{ width: '13%' }} /><col style={{ width: '10%' }} /><col style={{ width: '8%' }} /><col style={{ width: '11%' }} /><col style={{ width: '15%' }} /><col style={{ width: '11%' }} /></colgroup>
          <thead><tr>
            <th style={{ ...th, textAlign: 'left' }}>Campanha</th><th style={th}>Gasto</th><th style={th}>Impr.</th>
            <th style={th}>CTR</th><th style={th}>Result.</th><th style={th}>Custo/result.</th><th style={th}>ROAS</th>
          </tr></thead>
          <tbody>
            {campanhas.slice(0, 12).map((c, i, arr) => (
              <tr key={c.id} style={{ borderTop: `1px solid ${fraco(0.1)}`, borderBottom: i === arr.length - 1 ? `1px solid ${fraco(0.1)}` : undefined }}>
                <td style={{ padding: '7px 8px 7px 0', lineHeight: 1.35, whiteSpace: 'nowrap', fontSize: 10.5 }}>
                  <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: c.active ? '#0F8A3E' : fraco(0.25), marginRight: 7, verticalAlign: 'middle' }} />
                  {cortar(c.name, 34)}
                </td>
                <td style={{ ...td, fontWeight: 600 }}>{reais(c.spend)}</td>
                <td style={td}>{curto(c.impressions)}</td>
                <td style={td}>{pct(c.clicks, c.impressions)}</td>
                <td style={td}>{c.results ? n(c.results) : '—'}</td>
                <td style={td}>{c.results ? reais2(c.spend / c.results) : '—'}</td>
                <td style={{ ...td, fontWeight: 600, color: c.revenue ? OURO_FORTE : fraco(0.45) }}>{roas(c.revenue, c.spend)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ margin: '6px 0 0', fontSize: 9.5, color: fraco(0.5) }}>
          <span style={{ color: '#0F8A3E' }}>●</span> ativa · <span style={{ color: fraco(0.35) }}>●</span> pausada. Resultados = compras para campanhas de vendas, cadastros para leads, conversas iniciadas para engajamento e tráfego.
          {campanhas.length > 12 ? ` Mostrando as 12 de maior gasto (de ${campanhas.length}).` : ''}
        </p>
      </div>

      {!!top.length && (
        <div data-bloco>
          <H2>Criativos com maior investimento</H2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 9 }}>
            {top.map((x, i) => (
              <div key={x.ad_id} style={{ background: '#F7F6F2', borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ height: 150, backgroundColor: '#EFEDE6', backgroundImage: x.thumbnail ? `url("${x.thumbnail}")` : GRAD[i % GRAD.length], backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }} />
                <div style={{ padding: '8px 10px 10px' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 600, lineHeight: 1.3, minHeight: 27 }}>{cortar(x.ad_name, 30)}</div>
                  <div style={{ fontSize: 9.5, lineHeight: 1.35, color: fraco(0.55), marginTop: 3, whiteSpace: 'nowrap' }}>{cortar(x.campaign_name, 20)}</div>
                  <div style={{ fontSize: 10, marginTop: 6, display: 'flex', justifyContent: 'space-between', gap: 5, whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: 600 }}>{reais(Number(x.spend || 0))}</span>
                    <span style={{ color: fraco(0.55) }}>CTR {Number(x.ctr || 0).toFixed(1).replace('.', ',')}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </FolhaA4>
  );
}
