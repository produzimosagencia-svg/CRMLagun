import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { LogOut } from 'lucide-react';
import { FundoEscultura } from '@/components/interno/FundoEscultura';
import { aberturaEmCena, aoSairAbertura, avisarPaginaPronta } from '@/components/interno/AberturaSistema';
import type { Sessao, SessaoId } from '@/components/interno/sessoes';
import flamingoLagun from '@/assets/flamingo-solo.png';
import fotoMarketing from '@/assets/sessoes/marketing.jpg';
import fotoVendedores from '@/assets/sessoes/vendedores.jpg';
import fotoFinanceiro from '@/assets/sessoes/financeiro.jpg';
import fotoAdmin from '@/assets/sessoes/admin.jpg';

/**
 * Escolha da sessão no app de computador. É uma camada por cima do painel
 * (InternoLayout a monta dentro de um AnimatePresence):
 * - depois da abertura, os cartões só entram quando os ícones começam a sair,
 *   e a escultura do fundo passa direto da abertura para cá;
 * - ao escolher, o cartão escolhido se destaca, os outros saem e a camada
 *   esmaece revelando o painel que já montou por baixo;
 * - "trocar sessão" faz a camada aparecer por cima do painel;
 * - "Sair" tira os cartões e só então encerra a sessão (o login entra com a
 *   mesma escultura no fundo).
 * Cada sessão é um cartão em pé, como um flyer da casa, com uma foto da Lagun.
 */
const EASE = [0.16, 1, 0.3, 1] as const;
const FOTOS: Record<SessaoId, string> = {
  marketing: fotoMarketing,
  vendedores: fotoVendedores,
  financeiro: fotoFinanceiro,
  admin: fotoAdmin,
};

export function EscolhaSessao({ sessoes, nome, onEscolher, onSair }: {
  sessoes: Sessao[];
  nome: string;
  onEscolher: (id: SessaoId) => void;
  onSair: () => void;
}) {
  const reduzido = !!useReducedMotion();
  // Enquanto a abertura está na frente, os cartões esperam.
  const [entrar, setEntrar] = useState(() => !aberturaEmCena());
  const [escolhido, setEscolhido] = useState<SessaoId | null>(null);
  const [saindo, setSaindo] = useState(false);
  const ocupado = escolhido !== null || saindo;

  // Esta tela ocupa o lugar da primeira página: a abertura espera por ela.
  useEffect(() => { avisarPaginaPronta(); }, []);
  useEffect(() => (entrar ? undefined : aoSairAbertura(() => setEntrar(true))), [entrar]);

  const escolher = (id: SessaoId) => {
    if (ocupado) return;
    setEscolhido(id);
    // Os outros cartões saem um a um e o escolhido fica, aceso; só então a
    // camada esmaece revelando a página da sessão.
    window.setTimeout(() => onEscolher(id), reduzido ? 0 : 720);
  };

  const sair = () => {
    if (ocupado) return;
    setSaindo(true);
    window.setTimeout(onSair, reduzido ? 0 : 380);
  };

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const i = Number(e.key) - 1;
      if (!e.metaKey && !e.ctrlKey && entrar && i >= 0 && i < sessoes.length) escolher(sessoes[i].id);
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  });

  const visivel = entrar && !saindo;

  return (
    <motion.div
      className="fixed inset-0 z-[90] flex flex-col items-center justify-center overflow-hidden bg-black px-8 py-14"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.55, delay: 0.12, ease: [0.4, 0, 0.2, 1] } }}
      transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
    >
      <div data-app-arrastar aria-hidden className="fixed inset-x-0 top-0 z-50 h-10" />
      <FundoEscultura className="absolute inset-0" />

      <div className="relative z-10 flex w-full max-w-[1040px] flex-col items-center">
        <motion.div
          className="flex flex-col items-center"
          initial={{ opacity: 0, y: reduzido ? 0 : 10 }}
          animate={visivel && !escolhido ? { opacity: 1, y: 0 } : { opacity: 0, y: reduzido ? 0 : -8 }}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <img src={flamingoLagun} alt="" aria-hidden className="h-12 w-auto" />
          <h1 className="mt-4 text-center text-[26px] font-bold tracking-tight text-white">Olá, {nome}.</h1>
          <p className="mt-1.5 text-center text-sm text-white/50">Escolha a sessão para começar.</p>
        </motion.div>

        <div className={`mt-10 grid w-full gap-4 ${sessoes.length >= 4 ? 'grid-cols-4 max-lg:grid-cols-2' : sessoes.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {sessoes.map((s, i) => {
            const eEste = escolhido === s.id;
            // Ordem de saída dos outros: do mais perto do escolhido para fora.
            const posEscolhido = sessoes.findIndex((x) => x.id === escolhido);
            const distancia = Math.abs(i - posEscolhido);
            const alvo = !visivel
              ? { opacity: 0, y: reduzido ? 0 : 26, scale: reduzido ? 1 : 0.96, filter: 'blur(0px)' }
              : escolhido
                ? eEste
                  ? { opacity: 1, y: -6, scale: 1.05, filter: 'blur(0px)' }
                  : { opacity: 0, y: reduzido ? 0 : 46, scale: 0.88, filter: 'blur(6px)' }
                : { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' };
            const transicao = escolhido
              ? eEste
                ? { duration: 0.5, ease: EASE }
                : { duration: 0.42, delay: (distancia - 1) * 0.08, ease: [0.4, 0, 1, 1] as const }
              : { duration: 0.8, delay: visivel ? 0.12 + i * 0.08 : 0, ease: EASE };
            return (
              <motion.button
                key={s.id}
                type="button"
                onClick={() => escolher(s.id)}
                initial={{ opacity: 0, y: reduzido ? 0 : 26, scale: reduzido ? 1 : 0.96 }}
                animate={alvo}
                transition={transicao}
                className={`group relative aspect-[3/4] overflow-hidden rounded-[22px] border text-left outline-none transition-[border-color,box-shadow] duration-300 hover:border-[#FFE14D]/70 hover:shadow-[0_0_0_1px_rgba(255,225,77,.35),0_0_38px_-4px_rgba(255,214,80,.55),0_24px_50px_-20px_rgba(0,0,0,.9)] focus-visible:border-[#FFE14D]/80 ${
                  eEste ? 'border-[#FFE14D]/80 shadow-[0_0_0_1px_rgba(255,225,77,.45),0_0_50px_-2px_rgba(255,214,80,.65)]' : 'border-[#FFE14D]/15'
                }`}
              >
                {/* Foto da casa: escura e dourada em repouso, em cor ao passar o mouse */}
                <img src={FOTOS[s.id]} alt="" aria-hidden loading="eager"
                  className={`absolute inset-0 h-full w-full object-cover transition-[filter,transform] duration-700 ease-out group-hover:scale-[1.06] group-hover:[filter:none] group-focus-visible:[filter:none] ${
                    eEste ? 'scale-[1.06] [filter:none]' : '[filter:grayscale(.85)_sepia(.55)_brightness(.5)_contrast(1.1)]'
                  }`} />
                <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/10" />
                {/* Luz de neon que passa por cima ao acender */}
                <div aria-hidden className={`absolute inset-0 bg-[radial-gradient(120%_60%_at_50%_0%,rgba(255,214,80,.28),transparent_60%)] transition-opacity duration-500 group-hover:opacity-100 ${eEste ? 'opacity-100' : 'opacity-0'}`} />

                <span className="absolute inset-x-0 bottom-0 flex flex-col p-5">
                  <span className={`font-['Anton',sans-serif] text-[34px] uppercase leading-none tracking-[0.01em] transition-colors duration-300 group-hover:text-[#FFE14D] group-hover:[text-shadow:0_0_24px_rgba(255,214,80,.55)] ${eEste ? 'text-[#FFE14D] [text-shadow:0_0_24px_rgba(255,214,80,.55)]' : 'text-white'}`}>
                    {s.nome}
                  </span>
                  <span className="mt-2 text-[12.5px] leading-snug text-white/60 transition-colors duration-300 group-hover:text-white/85">
                    {s.descricao}
                  </span>
                </span>
              </motion.button>
            );
          })}
        </div>

        <motion.button type="button" onClick={sair}
          initial={{ opacity: 0 }}
          animate={{ opacity: visivel && !escolhido ? 1 : 0 }}
          transition={{ duration: 0.5, delay: visivel && !escolhido ? 0.5 : 0, ease: EASE }}
          className="mt-10 flex items-center gap-2 text-[12.5px] text-white/35 transition-colors hover:text-white/70">
          <LogOut size={14} /> Sair
        </motion.button>
      </div>
    </motion.div>
  );
}
