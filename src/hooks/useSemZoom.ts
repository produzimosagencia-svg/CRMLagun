import { useEffect } from 'react';

/**
 * Trava o zoom do painel no celular (pinça, toque duplo e o zoom automático
 * do iPhone ao tocar num campo). Só enquanto ligado; ao sair, tudo volta.
 */
export function useSemZoom(ativo = true) {
  useEffect(() => {
    if (!ativo) return;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const extra = ', maximum-scale=1, user-scalable=no';
    const adicionou = !!meta && !meta.content.includes('user-scalable');
    if (meta && adicionou) meta.content = `${meta.content}${extra}`;
    const html = document.documentElement;
    const originalToque = html.style.touchAction;
    html.style.touchAction = 'pan-x pan-y';
    // Safari do iPhone ignora o user-scalable; os gestos de pinça são barrados aqui.
    const bloquear = (e: Event) => e.preventDefault();
    document.addEventListener('gesturestart', bloquear, { passive: false });
    document.addEventListener('gesturechange', bloquear, { passive: false });
    return () => {
      if (meta && adicionou) meta.content = meta.content.replace(extra, '');
      html.style.touchAction = originalToque;
      document.removeEventListener('gesturestart', bloquear);
      document.removeEventListener('gesturechange', bloquear);
    };
  }, [ativo]);
}
