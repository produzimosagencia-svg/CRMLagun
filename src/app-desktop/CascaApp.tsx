import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { HelpCircle, LayoutGrid, LogOut } from 'lucide-react';
import type { Section, SubItem } from '@/pages/interno/InternoLayout';
import type { Sessao } from '@/components/interno/sessoes';
import fotoMarketing from '@/assets/sessoes/marketing.jpg';
import fotoVendedores from '@/assets/sessoes/vendedores.jpg';
import fotoFinanceiro from '@/assets/sessoes/financeiro.jpg';
import fotoAdmin from '@/assets/sessoes/admin.jpg';

/**
 * Casca do app de computador: menu lateral com a foto da sessão em cima (a
 * mesma dos cartões de escolha), itens com nome, sub-itens abertos embaixo da
 * seção ativa, cabeçalho de página em letreiro e as sub-seções como abas no
 * topo. Só é montada dentro do app (InternoLayout, modoSessoes). No navegador
 * o painel continua com o trilho de ícones de sempre.
 */
const EASE = [0.16, 1, 0.3, 1] as const;
const FOTOS: Record<string, string> = {
  marketing: fotoMarketing,
  vendedores: fotoVendedores,
  financeiro: fotoFinanceiro,
  admin: fotoAdmin,
};

export function CascaApp({
  sessao, grupos, conta, ativa, subitens, titulo, nome, revela, saindo,
  onTrocar, onSair, onIr, sobreposicao, children,
}: {
  sessao: Sessao;
  grupos: Section[][];
  conta: Section[];
  ativa?: Section;
  subitens: SubItem[];
  titulo: string;
  nome: string;
  revela: number;
  saindo: boolean;
  onTrocar: () => void;
  onSair: () => void;
  onIr: (to: string) => void;
  sobreposicao?: ReactNode;
  children: ReactNode;
}) {
  const iniciais = nome.slice(0, 2).toUpperCase();
  const tituloPagina = subitens.length && ativa ? ativa.label : titulo;

  const Item = ({ s }: { s: Section }) => {
    const Icon = s.icon;
    const ativo = ativa?.key === s.key;
    return (
      <div>
        <button type="button" onClick={() => onIr(s.to)} className={`app-menu-item ${ativo ? 'ativo' : ''}`} aria-current={ativo ? 'page' : undefined}>
          {s.render ? s.render(ativo) : Icon ? <Icon size={17} strokeWidth={ativo ? 2.2 : 1.9} className="shrink-0" /> : null}
          <span className="truncate">{s.label}</span>
        </button>
        {ativo && s.children && s.children.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }} className="mt-0.5 flex flex-col gap-px pb-1">
            {s.children.map((c) => (
              <NavLink key={c.to} to={c.to} end={c.end} className={({ isActive }) => `app-submenu-item ${isActive ? 'ativo' : ''}`}>
                <span className="truncate">{c.label}</span>
              </NavLink>
            ))}
          </motion.div>
        )}
      </div>
    );
  };

  return (
    <div className={`interno-noturno app-casca flex h-screen overflow-hidden text-[#F4F2EA] transition-opacity duration-300 ease-out ${saindo ? 'opacity-0' : ''}`}>
      {sobreposicao}

      {/* ── Menu lateral ─────────────────────────────────────────────── */}
      <motion.aside
        key={`menu-${revela}`}
        initial={revela ? { opacity: 0, x: -22 } : false}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.55, delay: 0.3, ease: EASE }}
        className="relative flex h-full w-[248px] shrink-0 flex-col border-r border-white/[0.07] bg-[#070707]"
      >
        {/* Cabeçalho com a foto da sessão. Área de arrastar a janela; os botões do Mac ficam em cima (x12 y21). */}
        <div data-app-topo className="relative h-[150px] shrink-0 overflow-hidden">
          <img src={FOTOS[sessao.id]} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover [filter:grayscale(.7)_sepia(.5)_brightness(.42)_contrast(1.1)]" />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/35 to-[#070707]" />
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(120%_70%_at_50%_100%,rgba(255,214,80,.16),transparent_60%)]" />
          <button type="button" onClick={onTrocar} title="Trocar sessão" aria-label="Trocar sessão"
            className="absolute right-3 top-[14px] grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-black/40 text-white/60 backdrop-blur transition-colors hover:border-[#FFE14D]/60 hover:text-[#FFE14D]">
            <LayoutGrid size={14} />
          </button>
          <div className="absolute inset-x-0 bottom-0 px-5 pb-3">
            <p className="app-eyebrow text-white/45">Sessão</p>
            <p className="app-titulo mt-1 text-[30px] text-white">{sessao.nome}</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-2 pt-3">
          {grupos.map((grupo, gi) => (
            <div key={gi} className="flex flex-col gap-0.5">
              {gi > 0 && <span aria-hidden className="mx-3 my-2.5 h-px bg-white/[0.08]" />}
              {grupo.map((s) => <Item key={s.key} s={s} />)}
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-white/[0.07] px-3 py-3">
          {conta.map((s) => <Item key={s.key} s={s} />)}
          <a href="https://wa.me/5527996528524" target="_blank" rel="noopener noreferrer" className="app-menu-item">
            <HelpCircle size={17} strokeWidth={1.9} className="shrink-0 text-[#FFEC8A]" />
            <span>Suporte</span>
          </a>
          <div className="mt-2 flex items-center gap-3 rounded-[14px] border border-white/[0.07] bg-white/[0.03] px-3 py-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#FFEC8A] to-[#E8B923] text-[11px] font-bold text-black">{iniciais}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-white">{nome}</p>
              <p className="app-eyebrow text-[9.5px] tracking-[0.2em] text-white/35">Lagun</p>
            </div>
            <button type="button" onClick={onSair} aria-label={`Sair (${nome})`} title="Sair"
              className="grid h-8 w-8 place-items-center rounded-full text-white/40 transition-colors hover:bg-red-950/50 hover:text-red-400">
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </motion.aside>

      {/* ── Página ───────────────────────────────────────────────────── */}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div data-app-arrastar aria-hidden className="absolute inset-x-0 top-0 z-40 h-3" />
        <motion.header
          key={`cabecalho-${revela}-${tituloPagina}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: revela ? 0.38 : 0, ease: EASE }}
          data-app-topo
          className="shrink-0 px-9 pb-3 pt-8"
        >
          <p className="app-eyebrow">{sessao.nome}{ativa && ativa.label !== tituloPagina ? ` · ${ativa.label}` : ''}</p>
          <h1 className="app-titulo mt-1.5 text-[38px] text-white">{tituloPagina}</h1>
          {subitens.length > 0 && (
            <nav className="mt-4 flex flex-wrap gap-1.5">
              {subitens.map((c) => (
                <NavLink key={c.to} to={c.to} end={c.end} className={({ isActive }) => `app-aba ${isActive ? 'ativo' : ''}`}>
                  {c.label}
                </NavLink>
              ))}
            </nav>
          )}
        </motion.header>

        <main className="flex-1 overflow-auto px-9 pb-10 pt-3">
          <motion.div key={`pagina-${revela}`}
            initial={revela ? { opacity: 0, y: 16 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.38, ease: EASE }}>
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
