import logoLagun from '@/assets/simbolo-lagun.png';

/**
 * Identidade visual do tenant autenticado.
 *
 * Ponto único de extensão multi-tenant: hoje o sistema não possui tabela de
 * tenants/branding, então retornamos a marca padrão (Lagun). Quando existir
 * cadastro de empresas com logomarca, basta resolver aqui (ex.: a partir do
 * profile do usuário) — a SplashScreen e demais consumidores não mudam.
 */
export interface TenantBranding {
  /** Nome da empresa — usado como fallback quando não há logomarca. */
  name: string;
  /** URL/asset da logomarca (idealmente versão clara, para fundo escuro). */
  logo: string | null;
}

export function getTenantBranding(): TenantBranding {
  return { name: 'Lagun', logo: logoLagun };
}
