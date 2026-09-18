import { useEffect } from 'react';

/**
 * Quem adiciona o painel à tela inicial do celular precisa cair no login do
 * painel, não na landing pública. O manifesto do site aponta pra "/", então
 * enquanto a pessoa está em /interno trocamos pelo manifesto do painel
 * (start_url /interno/login). Ao sair, volta o do site.
 */
export function useManifestInterno() {
  useEffect(() => {
    let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const criado = !link;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'manifest';
      document.head.appendChild(link);
    }
    const original = link.getAttribute('href');
    link.setAttribute('href', '/manifest-interno.webmanifest');
    return () => {
      if (criado) link?.remove();
      else if (original) link?.setAttribute('href', original);
    };
  }, []);
}
