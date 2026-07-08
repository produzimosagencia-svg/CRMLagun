import { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { getTenantBranding } from '@/lib/branding';

/** Curva "premium" (easeOutExpo suavizada) — mesma família usada por Vercel/Linear. */
const EASE = [0.16, 1, 0.3, 1] as const;

/** Tempo em tela antes do fade-out (ms). Total ≈ HOLD + 450ms de saída. */
const HOLD_MS = 5000;

interface SplashScreenProps {
  /** Chamado quando o overlay terminou o fade-out e foi removido. */
  onComplete: () => void;
}

/**
 * Splash de pós-login: overlay preto fullscreen com a logomarca do tenant
 * surgindo em profundidade (escala + rotação 3D + blur + glow), depois fade-out
 * revelando a aplicação que já carregou por baixo — sem piscadas.
 *
 * Renderizada pelo InternoLayout apenas quando o flag de login recém-sucedido
 * está presente (nunca em navegação interna ou refresh).
 */
export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const [visible, setVisible] = useState(true);
  const reduced = useReducedMotion();
  const { name, logo } = getTenantBranding();

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), reduced ? 700 : HOLD_MS);
    return () => clearTimeout(t);
  }, [reduced]);

  return (
    <AnimatePresence onExitComplete={onComplete}>
      {visible && (
        <motion.div
          aria-hidden
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: 'easeInOut' }}
        >
          {/* Iluminação: glow radial dourado que "acende" atrás da marca */}
          {!reduced && (
            <motion.div
              className="absolute h-[26rem] w-[26rem] rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(245,212,112,0.13) 0%, transparent 65%)' }}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1.15 }}
              transition={{ duration: 1.5, ease: EASE }}
            />
          )}

          {/* Perspectiva para o efeito de profundidade 3D */}
          <div style={{ perspective: 900 }}>
            <motion.div
              className="flex flex-col items-center"
              initial={
                reduced
                  ? { opacity: 0 }
                  : { opacity: 0, scale: 0.88, rotateX: 16, y: 12, filter: 'blur(10px)' }
              }
              animate={
                reduced
                  ? { opacity: 1 }
                  : { opacity: 1, scale: 1, rotateX: 0, y: 0, filter: 'blur(0px)' }
              }
              transition={{ duration: 1.05, ease: EASE }}
            >
              {logo ? (
                <img
                  src={logo}
                  alt={name}
                  draggable={false}
                  className="h-44 sm:h-52 w-auto max-w-[70vw] object-contain select-none"
                />
              ) : (
                <span className="text-3xl font-bold uppercase tracking-[0.3em] text-white select-none">
                  {name}
                </span>
              )}

              {/* Mensagem de boas-vindas — entra depois da logo assentar */}
              <motion.p
                className="mt-5 text-xs sm:text-sm tracking-[0.18em] uppercase select-none text-center px-6"
                style={{ color: 'rgba(245, 212, 112, 0.75)' }}
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
                transition={{ duration: 0.9, delay: reduced ? 0.1 : 0.75, ease: EASE }}
              >
                Bem-vindo(a) a uma experiência única da sua gestão
              </motion.p>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
