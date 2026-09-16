import { useState, useEffect, type ReactNode } from 'react';
import { Navigate, Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useSidebarSettings, type SidebarKey } from '@/hooks/useSidebarSettings';
import { NotificationBell } from '@/components/NotificationBell';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  LogOut, Menu, X, ChevronRight, Ticket, MessageCircle, Send, Settings, User, Sparkles, HelpCircle,
  Megaphone, BarChart3, Trophy, Users, ClipboardList, Cake, Globe, CalendarRange, LayoutDashboard,
  TrendingUp, MessagesSquare, ShoppingCart, RotateCcw, MousePointerClick, Zap, Crown, Database,
  type LucideIcon,
} from 'lucide-react';
import SplashScreen from '@/components/SplashScreen';
import { supabase } from '@/integrations/supabase/client';
import flamingoLagun from '@/assets/flamingo-solo.png';
import logoPrive from '@/assets/logo-prive-preto.png';

interface EventItem { id: string; name: string }

// Módulos preservados no código, mas retirados da navegação interna do Lagun.
const DISABLED_SIDEBAR_MODULES = new Set(['prive', 'zig_tickets', 'blueticket']);

// ─── Estrutura de navegação ─────────────────────────────────────────────────
// Sidebar 1 (trilho): só ícones, nome no balão ao passar o mouse.
// Sidebar 2 (painel): sub-itens da seção ativa; só aparece quando a seção tem filhos.
interface SubItem { label: string; to: string; end?: boolean; icon?: LucideIcon }
interface Section {
  key: string;
  label: string;
  icon?: LucideIcon;
  render?: (active: boolean) => ReactNode; // ícone customizado (logo do Privê)
  to: string;                              // destino ao clicar no trilho
  isActive: (path: string) => boolean;
  children?: SubItem[];
}

export default function InternoLayout() {
  const { user, loading, isPartner, isAdmin, roles, signOut } = useAuth();
  const { isEnabled: isEnabledSetting } = useSidebarSettings();
  const isEnabled = (key: SidebarKey) => !DISABLED_SIDEBAR_MODULES.has(key) && isEnabledSetting(key);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [zigEvents, setZigEvents] = useState<EventItem[]>([]);
  // Splash pós-login: flag gravado pelo InternoLogin apenas em autenticação
  // bem-sucedida; consumido uma única vez aqui (não dispara em rotas internas).
  const [splash, setSplash] = useState(() => sessionStorage.getItem('interno-splash') === '1');
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;

  useEffect(() => { if (splash) sessionStorage.removeItem('interno-splash'); }, [splash]);

  // O painel tem um modo só (noturno). A classe `dark` continua ligada porque
  // as telas usam variantes dark: do Tailwind; sem ela o texto sairia claro.
  useEffect(() => {
    document.documentElement.classList.add('dark');
    localStorage.removeItem('interno-tema');
    localStorage.removeItem('interno-theme');
  }, []);

  useEffect(() => {
    supabase.from('webhook_logs').select('payload, source').eq('source', 'zig_tickets').then(({ data }) => {
      if (!data) return;
      const map = new Map<string, string>();
      for (const row of data) {
        const p = (row.payload as any)?.payload;
        if (p?.event?.id && p?.event?.name) map.set(String(p.event.id), p.event.name);
      }
      setZigEvents(Array.from(map, ([id, name]) => ({ id, name })));
    });
  }, []);

  // Overlay da splash: fica ACIMA de tudo (z-100) enquanto o app carrega por
  // baixo — inclusive sobre o spinner de loading, evitando qualquer piscada.
  const splashOverlay = splash ? <SplashScreen onComplete={() => setSplash(false)} /> : null;

  if (loading) {
    return (
      <>
        {splashOverlay}
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="h-8 w-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  if (!user || !isPartner) return <Navigate to="/interno/login" replace />;

  const userName = user.user_metadata?.full_name
    ? (user.user_metadata.full_name as string).split(' ')[0]
    : user.email?.split('@')[0] ?? 'Usuário';

  // Role-based visibility
  const hasDesignRole = roles.includes('design');
  const hasTrafegoRole = roles.includes('trafego');
  const isFullAccess = isAdmin || (!hasDesignRole && !hasTrafegoRole);
  const canSeeHome = isFullAccess;
  const canSeeCRM = isFullAccess;
  const canSeeWhatsApp = isFullAccess || hasTrafegoRole;
  const canSeeZigTickets = isFullAccess;
  const canSeeAds = isFullAccess || hasTrafegoRole;
  const canSeeDesign = isFullAccess || hasDesignRole;

  // Redirect design-only users away from routes they can't access
  if (hasDesignRole && !isFullAccess) {
    const designAllowed = ['/interno/marketing/design', '/interno/marketing/referencias', '/interno/perfil'];
    if (!designAllowed.some((p) => path.startsWith(p))) return <Navigate to="/interno/marketing/design" replace />;
  }

  const startsWith = (...prefixes: string[]) => (p: string) => prefixes.some((x) => p.startsWith(x));
  const exact = (...paths: string[]) => (p: string) => paths.includes(p);

  // Navegação em grupos — cada grupo vira um bloco separado por uma linha fina
  // no trilho. Ordem definida com o time.
  const navGroups: Section[][] = [
    // Visão geral
    [
      canSeeHome && isEnabled('dashboard') && { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, to: '/interno/dashboard', isActive: exact('/interno/dashboard') },
      canSeeDesign && !canSeeHome && { key: 'referencias', label: 'Referências', icon: Sparkles, to: '/interno/marketing/referencias', isActive: startsWith('/interno/marketing/referencias') },
      canSeeHome && isEnabled('landing') && { key: 'landing', label: 'Landing Page', icon: Globe, to: '/interno/landing', isActive: startsWith('/interno/landing') },
    ],
    // O que chega do público
    [
      canSeeWhatsApp && isEnabled('chat') && { key: 'chat', label: 'Chat', icon: MessageCircle, to: '/interno/whatsapp/chat', isActive: exact('/interno/whatsapp/chat') },
      canSeeHome && isEnabled('social_media') && { key: 'social_media', label: 'Social Media', icon: BarChart3, to: '/interno/marketing/social-media', isActive: startsWith('/interno/marketing/social-media') },
      canSeeHome && isEnabled('comentarios') && { key: 'comentarios', label: 'Comentários', icon: MessagesSquare, to: '/interno/comentarios', isActive: startsWith('/interno/comentarios') },
    ],
    // O que a gente dispara
    [
      canSeeHome && isEnabled('automacoes') && { key: 'automacoes', label: 'Automações', icon: Zap, to: '/interno/automacoes', isActive: startsWith('/interno/automacoes') },
      canSeeWhatsApp && isEnabled('whatsapp') && {
        key: 'whatsapp', label: 'Disparo', icon: Send, to: '/interno/whatsapp',
        isActive: (p) => p.startsWith('/interno/whatsapp') && p !== '/interno/whatsapp/chat',
        children: [
          { label: 'Dashboard', to: '/interno/whatsapp', end: true, icon: BarChart3 },
          { label: 'Carrinho Abandonado', to: '/interno/whatsapp/carrinho-abandonado', icon: ShoppingCart },
          { label: 'Aniversário', to: '/interno/whatsapp/aniversario', icon: Cake },
          { label: 'Estornos', to: '/interno/whatsapp/estornos', icon: RotateCcw },
          { label: 'Rastreamento', to: '/interno/whatsapp/rastreamento', icon: MousePointerClick },
        ],
      },
      canSeeAds && isEnabled('ads') && {
        key: 'ads', label: 'Performance', icon: TrendingUp, to: '/interno/ads/campanhas', isActive: startsWith('/interno/ads', '/interno/trafego-gpt'),
        children: [
          { label: 'Campanhas', to: '/interno/ads/campanhas', icon: BarChart3 },
          { label: 'Criativos Campeões', to: '/interno/ads/criativos', icon: Trophy },
        ],
      },
    ],
    // Dados e organização (bilheteria entra aqui quando reativada no Admin)
    [
      canSeeCRM && isEnabled('crm') && {
        key: 'crm', label: 'CRM', icon: Users, to: '/interno/crm-visao-geral',
        isActive: startsWith('/interno/crm-visao-geral', '/interno/eventos', '/interno/clientes', '/interno/aniversariantes', '/interno/divulgadores', '/interno/superclientes', '/interno/base'),
        children: [
          { label: 'Visão geral', to: '/interno/crm-visao-geral', end: true, icon: LayoutDashboard },
          { label: 'Clientes', to: '/interno/clientes', icon: Users },
          { label: 'Superclientes', to: '/interno/superclientes', icon: Crown },
          { label: 'Aniversariantes', to: '/interno/aniversariantes', icon: Cake },
          { label: 'Influenciadores', to: '/interno/divulgadores', icon: Megaphone },
          ...(canSeeHome && isEnabled('base') ? [{ label: 'Base', to: '/interno/base', icon: Database }] : []),
        ],
      },
      isEnabled('tarefas') && { key: 'tarefas', label: 'Tarefas', icon: ClipboardList, to: '/interno/tarefas', isActive: startsWith('/interno/tarefas') },
      isEnabled('calendario') && { key: 'calendario', label: 'Calendário', icon: CalendarRange, to: '/interno/calendario', isActive: startsWith('/interno/calendario') },
      canSeeHome && isEnabled('blueticket') && {
        key: 'blueticket', label: 'Blueticket', icon: Ticket, to: '/interno/blueticket', isActive: startsWith('/interno/blueticket', '/interno/lebai', '/interno/aura'),
        children: [{ label: 'Painel', to: '/interno/blueticket', end: true }, { label: 'Le Bai', to: '/interno/lebai' }, { label: 'Aura', to: '/interno/aura' }],
      },
      canSeeHome && isEnabled('prive') && {
        key: 'prive', label: 'Privê', to: '/interno/prive', isActive: startsWith('/interno/prive'),
        render: (active) => <img src={logoPrive} alt="Privê" className={`h-3.5 w-auto invert transition-opacity ${active ? 'opacity-100' : 'opacity-60'}`} />,
      },
      canSeeZigTickets && isEnabled('zig_tickets') && {
        key: 'zig_tickets', label: 'Zig Tickets', icon: Ticket, to: '/interno/zig-tickets/geral', isActive: startsWith('/interno/zig-tickets'),
        children: [{ label: 'Geral', to: '/interno/zig-tickets/geral', end: true }, ...zigEvents.map((e) => ({ label: e.name, to: `/interno/zig-tickets/${e.id}` }))],
      },
    ],
  ].map((g) => g.filter(Boolean) as Section[]).filter((g) => g.length > 0);

  // Conta e sessão ficam no rodapé do trilho, fora dos grupos.
  const contaSections: Section[] = [
    isAdmin && { key: 'admin', label: 'Admin', icon: Settings, to: '/interno/admin', isActive: startsWith('/interno/admin') },
    { key: 'perfil', label: 'Perfil', icon: User, to: '/interno/perfil', isActive: startsWith('/interno/perfil') },
  ].filter(Boolean) as Section[];

  const sections: Section[] = [...navGroups.flat(), ...contaSections];

  const activeSection = sections.find((s) => s.isActive(path));
  const panelItems = activeSection?.children ?? [];

  const getPageTitle = () => {
    if (path === '/interno/dashboard') return 'Redes Sociais';
    if (path.startsWith('/interno/trafego-gpt')) return 'TráfegoGPT';
    if (path === '/interno/ads/campanhas') return 'Campanhas';
    if (path === '/interno/ads/criativos') return 'Criativos Campeões';
    if (path === '/interno/ads/criar') return 'Nova Campanha';
    if (path === '/interno/ads/gerenciar') return 'Gerenciar Meta Ads';
    if (path === '/interno/ads/pixel') return 'Pixel & Públicos';
    if (path.startsWith('/interno/ads')) return 'Performance';
    if (path === '/interno/crm-visao-geral') return 'Visão Geral - CRM';
    if (path === '/interno/eventos') return 'Eventos';
    if (path.startsWith('/interno/clientes')) return 'Clientes';
    if (path.startsWith('/interno/superclientes')) return 'Superclientes';
    if (path.startsWith('/interno/aniversariantes')) return 'Aniversariantes';
    if (path.startsWith('/interno/divulgadores')) return 'Influenciadores';
    if (path === '/interno/zig-tickets/geral' || path === '/interno/zig-tickets') return 'Zig Tickets - Geral';
    if (path.startsWith('/interno/zig-tickets')) return 'Zig Tickets';
    if (path === '/interno/tarefas') return 'Tarefas';
    if (path === '/interno/whatsapp/chat') return 'Chat';
    if (path === '/interno/comentarios') return 'Comentários';
    if (path.startsWith('/interno/automacoes')) return 'Automações';
    if (path === '/interno/marketing/social-media') return 'Social Media';
    if (path.startsWith('/interno/whatsapp')) return 'Disparo';
    if (path.startsWith('/interno/marketing/design')) return 'Design';
    if (path.startsWith('/interno/marketing/referencias')) return 'Referências';
    if (path.startsWith('/interno/perfil')) return 'Perfil';
    if (path.startsWith('/interno/grafos')) return 'RMKT (Grafos)';
    if (path.startsWith('/interno/dados')) return 'Dados';
    if (path === '/interno/lebai') return 'Le Bai';
    if (path === '/interno/aura') return 'Aura';
    if (path.startsWith('/interno/prive')) return 'Privê';
    if (path === '/interno/base') return 'Base';
    if (path === '/interno/landing') return 'Landing Page';
    if (path === '/interno/calendario') return 'Calendário';
    if (path === '/interno/admin') return 'Admin';
    if (path === '/interno') return 'Home';
    return 'Interno';
  };

  const isHome = path === '/interno';

  const railButtonClass = (active: boolean) =>
    `relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors duration-150 ${
      active ? 'text-[#FFE14D] bg-[#FFE14D]/[0.10]' : 'text-[#8B8A9B] hover:bg-white/[0.06] hover:text-[#F2F1F7]'
    }`;

  // Item do trilho: ícone + balão com o nome ao passar o mouse.
  const RailItem = ({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: ReactNode }) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" onClick={onClick} aria-label={label} aria-current={active ? 'page' : undefined} className={railButtonClass(active)}>
          {active && <span className="n-ativo absolute left-0 top-2 bottom-2 w-0.5 rounded-r bg-[#FFE14D]" />}
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10} className="bg-[#0A0A0F] text-[#F2F1F7] border-white/10 text-xs font-medium">
        {label}
      </TooltipContent>
    </Tooltip>
  );

  const go = (to: string) => { navigate(to); setSidebarOpen(false); };

  return (
    <TooltipProvider delayDuration={80}>
      <div className="interno-noturno min-h-screen flex bg-background">
        {splashOverlay}
        {sidebarOpen && !isHome && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        {/* Sidebar 1 + Sidebar 2 (no mobile viram uma gaveta só) */}
        <aside
          className={`fixed lg:sticky lg:top-0 inset-y-0 left-0 z-50 flex h-screen transition-transform duration-300 lg:translate-x-0
            ${isHome ? '-translate-x-full lg:hidden' : sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        >
          {/* ── Trilho de ícones ── */}
          <nav className="flex w-[64px] flex-col items-center bg-[#0A0A0F] border-r border-white/[0.06]">
            <div className="flex h-14 w-full items-center justify-center border-b border-white/[0.06]">
              <img src={flamingoLagun} alt="Lagun" className="h-6 w-auto" />
            </div>
            <div className="flex-1 w-full flex flex-col items-center gap-1 py-2 overflow-y-auto">
              {navGroups.map((grupo, gi) => (
                <div key={gi} className="flex w-full flex-col items-center gap-1">
                  {gi > 0 && <span aria-hidden className="my-2 h-px w-8 bg-white/[0.16]" />}
                  {grupo.map((s) => {
                    const Icon = s.icon;
                    return (
                      <RailItem key={s.key} label={s.label} active={activeSection?.key === s.key} onClick={() => go(s.to)}>
                        {s.render ? s.render(activeSection?.key === s.key) : Icon ? <Icon size={19} /> : null}
                      </RailItem>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="w-full flex flex-col items-center gap-1 py-2 border-t border-white/[0.06]">
              {contaSections.map((s) => {
                const Icon = s.icon!;
                return (
                  <RailItem key={s.key} label={s.label} active={activeSection?.key === s.key} onClick={() => go(s.to)}>
                    <Icon size={18} />
                  </RailItem>
                );
              })}
              <Tooltip>
                <TooltipTrigger asChild>
                  <a href="https://wa.me/5527996528524" target="_blank" rel="noopener noreferrer" aria-label="Suporte"
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-[#FFEC8A] hover:bg-[#FFE14D]/15 transition-colors">
                    <HelpCircle size={18} />
                  </a>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={10} className="bg-[#0A0A0F] text-[#F2F1F7] border-white/10 text-xs font-medium">Suporte</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" onClick={signOut} aria-label={`Sair (${userName})`}
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-[#8B8A9B] hover:bg-red-950/40 hover:text-red-400 transition-colors">
                    <LogOut size={18} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={10} className="bg-[#0A0A0F] text-[#F2F1F7] border-white/10 text-xs font-medium">
                  Sair · {userName}
                </TooltipContent>
              </Tooltip>
            </div>
          </nav>

          {/* ── Painel de sub-itens da seção ativa ── */}
          {panelItems.length > 0 && activeSection && (
            <div key={activeSection.key} className="n-painel flex w-[196px] flex-col bg-[#0D0D14] border-r border-white/[0.06]">
              <div className="flex h-14 items-center justify-between px-4 border-b border-white/[0.06]">
                <span className="text-[13px] font-semibold text-[#F2F1F7] truncate">{activeSection.label}</span>
                <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-[#6B6A7B] hover:text-[#F2F1F7]" aria-label="Fechar menu">
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
                {panelItems.map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      onClick={() => setSidebarOpen(false)}
                      style={{ animationDelay: `${i * 28}ms` }}
                      className={({ isActive }) =>
                        `n-item flex h-9 items-center gap-2.5 rounded-md px-3 text-[13px] transition-colors duration-150 ${
                          isActive ? 'text-[#FFE14D] font-medium bg-[#FFE14D]/[0.08]' : 'text-[#8B8A9B] hover:text-[#F2F1F7] hover:bg-white/[0.04]'
                        }`
                      }
                    >
                      {Icon ? <Icon size={15} className="shrink-0" /> : <ChevronRight size={13} className="shrink-0 opacity-50" />}
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          )}
        </aside>

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0">
          {!isHome && (
            <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border px-4 h-12 flex items-center gap-3 lg:px-6">
              <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-muted-foreground hover:text-foreground" aria-label="Abrir menu">
                <Menu size={20} />
              </button>
              <h1 className="font-display text-[15px] font-medium tracking-tight text-foreground">{getPageTitle()}</h1>
              <NotificationBell />
            </header>
          )}
          <main className="flex-1 p-4 lg:p-6 overflow-auto">
            {/* key por rota: a animação de entrada roda a cada troca de página */}
            <div key={path} className="n-entra">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
