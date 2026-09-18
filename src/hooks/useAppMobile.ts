import { useEffect, useState } from 'react';

/**
 * Liga o layout de aplicativo do painel interno (barra de abas embaixo,
 * cabeçalho de app) só no celular: largura abaixo do breakpoint md (768px).
 * Acima disso o painel segue exatamente como a versão web.
 */
const CONSULTA = '(max-width: 767px)';

export function useAppMobile() {
  const [ativo, setAtivo] = useState(() => typeof window !== 'undefined' && window.matchMedia(CONSULTA).matches);

  useEffect(() => {
    const mq = window.matchMedia(CONSULTA);
    const onChange = () => setAtivo(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return ativo;
}
