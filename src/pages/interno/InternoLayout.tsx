import { useState, useEffect } from 'react';
import { Navigate, Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useSidebarSettings } from '@/hooks/useSidebarSettings';
import { NotificationBell } from '@/components/NotificationBell';
import {
  Home, LogOut, Menu, X, Mail,
  ChevronsRight, Ticket, Radio, MessageCircle, Send,
  ChevronDown, ChevronRight, Settings, User, Moon, Sun, Zap, Sparkles,
  Megaphone, BarChart3, Trophy, Users, ClipboardList, Cake,
  Database, Plus, Globe, CalendarRange, LayoutDashboard,
} from 'lucide-react';
import { MetaIcon } from '@/components/icons/MetaIcon';
import SplashScreen from '@/components/SplashScreen';
import { supabase } from '@/integrations/supabase/client';
import logoLagun from '@/assets/palavra-lagun-branco.png';
import flamingoLagun from '@/assets/flamingo-solo.png';
import logoPrive from '@/assets/logo-prive-preto.png';

interface EventItem {
  id: string;
  name: string;
}

export default function InternoLayout() {
  const { user, loading, isPartner, isAdmin, roles, signOut } = useAuth();
  const { isEnabled } = useSidebarSettings();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('interno-theme');
    if (saved) return saved === 'dark';
    return document.documentElement.classList.contains('dark');
  });
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [crmOpen, setCrmOpen] = useState(false);
  const [zigTicketsOpen, setZigTicketsOpen] = useState(false);
  const [adsOpen, setAdsOpen] = useState(false);
  const [blueticketOpen, setBlueticketOpen] = useState(false);
  const [zigTicketsDropdownOpen, setZigTicketsDropdownOpen] = useState(false);
  const [zigEvents, setZigEvents] = useState<EventItem[]>([]);
  // Splash pós-login: flag gravado pelo InternoLogin apenas em autenticação
  // bem-sucedida; consumido uma única vez aqui (não dispara em rotas internas).
  const [splash, setSplash] = useState(() => sessionStorage.getItem('interno-splash') === '1');
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (splash) sessionStorage.removeItem('interno-splash');
  }, [splash]);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('interno-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  useEffect(() => {
    supabase
      .from('webhook_logs')
      .select('payload, source')
      .eq('source', 'zig_tickets')
      .then(({ data }) => {
        if (!data) return;
        const zigEventsMap = new Map<string, string>();
        for (const row of data) {
          const p = (row.payload as any)?.payload;
          if (p?.event?.id && p?.event?.name) {
            zigEventsMap.set(String(p.event.id), p.event.name);
          }
        }
        setZigEvents(Array.from(zigEventsMap, ([id, name]) => ({ id, name })));
      });
  }, []);

  useEffect(() => {
    if (location.pathname.startsWith('/interno/whatsapp')) setWhatsappOpen(true);
    if (location.pathname.startsWith('/interno/zig-tickets')) setZigTicketsDropdownOpen(true);
    if (location.pathname.startsWith('/interno/ads') || location.pathname.startsWith('/interno/trafego-gpt')) setAdsOpen(true);
    if (location.pathname === '/interno/lebai' || location.pathname === '/interno/aura') setBlueticketOpen(true);
    if (
      location.pathname === '/interno/crm-visao-geral' ||
      location.pathname === '/interno/eventos' ||
      location.pathname.startsWith('/interno/aniversariantes') ||
      location.pathname.startsWith('/interno/divulgadores') ||
      location.pathname.startsWith('/interno/superclientes') ||
      location.pathname.startsWith('/interno/clientes')
    ) setCrmOpen(true);
  }, [location.pathname]);

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

  if (!user || !isPartner) {
    return <Navigate to="/interno/login" replace />;
  }

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
    const isAllowed = designAllowed.some((p) => location.pathname.startsWith(p));
    if (!isAllowed) {
      return <Navigate to="/interno/marketing/design" replace />;
    }
  }

  const getPageTitle = () => {
    if (location.pathname === '/interno/dashboard') return 'Dashboard Geral';
    if (location.pathname.startsWith('/interno/trafego-gpt')) return 'TráfegoGPT';
    if (location.pathname === '/interno/ads/campanhas') return 'Campanhas';
    if (location.pathname === '/interno/ads/criativos') return 'Criativos Campeões';
    if (location.pathname === '/interno/ads/criar') return 'Nova Campanha';
    if (location.pathname === '/interno/ads/pixel') return 'Pixel & Públicos';
    if (location.pathname.startsWith('/interno/ads')) return 'Ads';
    if (location.pathname === '/interno/crm-visao-geral') return 'Visão Geral - CRM';
    if (location.pathname === '/interno/eventos') return 'Eventos';
    if (location.pathname === '/interno/zig-tickets/geral' || location.pathname === '/interno/zig-tickets') return 'Zig Tickets - Geral';
    if (location.pathname.startsWith('/interno/zig-tickets')) return 'Zig Tickets';
    if (location.pathname === '/interno/tarefas') return 'Tarefas';
    if (location.pathname === '/interno/whatsapp/chat') return 'Chat';
    if (location.pathname.startsWith('/interno/whatsapp')) return 'WhatsApp';
    if (location.pathname.startsWith('/interno/marketing/design')) return 'Design';
    if (location.pathname.startsWith('/interno/marketing/referencias')) return 'Referências';
    if (location.pathname.startsWith('/interno/perfil')) return 'Perfil';
    if (location.pathname.startsWith('/interno/grafos')) return 'RMKT (Grafos)';
    if (location.pathname.startsWith('/interno/dados')) return 'Dados';
    if (location.pathname === '/interno/lebai') return 'Le Bai';
    if (location.pathname === '/interno/aura') return 'Aura';
    if (location.pathname.startsWith('/interno/prive')) return 'Privê';
    if (location.pathname === '/interno/base') return 'Base';
    if (location.pathname === '/interno/landing') return 'Landing Page';
    if (location.pathname === '/interno/calendario') return 'Calendário';
    if (location.pathname === '/interno') return 'Home';
    return 'Interno';
  };

  const isActiveRoute = (path: string, end = false) => {
    if (end) return location.pathname === path;
    return location.pathname.startsWith(path);
  };

  const navLinkClass = (active: boolean) =>
    `relative flex h-9 w-full items-center rounded-md transition-colors duration-150 ${
      collapsed ? 'justify-center px-0' : 'px-3'
    } ${
      active
        ? 'text-[#E8C766] font-medium bg-[#E8C766]/[0.06] border-l-2 border-[#E8C766]'
        : 'text-[#8F8A7C] hover:bg-white/[0.04] hover:text-[#EDEAE3]'
    }`;

  const subItemClass = (active: boolean) =>
    `flex h-8 w-full items-center rounded-md px-3 pl-9 text-xs font-medium transition-colors duration-150 ${
      active
        ? 'text-[#E8C766] bg-[#E8C766]/[0.06]'
        : 'text-[#6F6A5E] hover:text-[#EDEAE3] hover:bg-white/[0.04]'
    }`;

  const isHome = location.pathname === '/interno';

  return (
    <div className="min-h-screen flex bg-background">
      {splashOverlay}
      {sidebarOpen && !isHome && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed lg:sticky lg:top-0 inset-y-0 left-0 z-50 flex flex-col h-screen bg-[#191813] border-r border-black/30 transition-all duration-300 lg:translate-x-0
          ${isHome ? '-translate-x-full lg:-translate-x-full lg:hidden' : sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          ${collapsed ? 'w-[60px]' : 'w-[225px]'}
        `}
      >
        <div className="mb-1 border-b border-white/[0.06] p-3 flex justify-center">
          <div className="flex items-center justify-center gap-2">
            <img
              src={flamingoLagun}
              alt=""
              className={`transition-all shrink-0 ${collapsed ? 'h-5 w-auto' : 'h-6 w-auto'}`}
            />
            {!collapsed && (
              <img
                src={logoLagun}
                alt="Lagun"
                className="h-6 w-auto transition-all"
              />
            )}
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden absolute top-3 right-3 text-[#6F6A5E] hover:text-[#EDEAE3]">
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 px-2 py-2 overflow-y-auto">
          {/* Home removida — login vai direto para CRM */}

          {/* Dashboard Geral */}
          {canSeeHome && isEnabled('dashboard') && (
            <NavLink
              to="/interno/dashboard"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => navLinkClass(isActive)}
              title={collapsed ? 'Dashboard' : undefined}
            >
              <div className={`flex items-center justify-center ${collapsed ? '' : 'mr-2'}`}>
                <LayoutDashboard size={18} />
              </div>
              {!collapsed && <span className="text-sm font-medium">Dashboard</span>}
            </NavLink>
          )}

          {/* Design-only: Referências */}
          {canSeeDesign && !canSeeHome && (
            <NavLink
              to="/interno/marketing/referencias"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => navLinkClass(isActive)}
              title={collapsed ? 'Referências' : undefined}
            >
              <div className={`flex items-center justify-center ${collapsed ? '' : 'mr-2'}`}>
                <Sparkles size={18} />
              </div>
              {!collapsed && <span className="text-sm font-medium">Referências</span>}
            </NavLink>
          )}


          {/* 1.5. Landing Page CMS */}
          {canSeeHome && isEnabled('landing') && (
            <NavLink
              to="/interno/landing"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => navLinkClass(isActive)}
              title={collapsed ? 'Landing Page' : undefined}
            >
              <div className={`flex items-center justify-center ${collapsed ? '' : 'mr-2'}`}>
                <Globe size={18} />
              </div>
              {!collapsed && <span className="text-sm font-medium">Landing Page</span>}
            </NavLink>
          )}

          {/* 2. CRM (com sub-itens) */}
          {canSeeCRM && isEnabled('crm') && (
            <div>
              <button
                onClick={() => {
                  if (collapsed) {
                    navigate('/interno/crm-visao-geral');
                    setSidebarOpen(false);
                  } else {
                    setCrmOpen((v) => !v);
                  }
                }}
                className={navLinkClass(location.pathname === '/interno/crm-visao-geral' || location.pathname === '/interno/eventos' || location.pathname.startsWith('/interno/clientes') || location.pathname.startsWith('/interno/aniversariantes') || location.pathname.startsWith('/interno/divulgadores') || location.pathname.startsWith('/interno/superclientes'))}
                title={collapsed ? 'CRM' : undefined}
              >
                <div className={`flex items-center justify-center ${collapsed ? '' : 'mr-2'}`}>
                  <Users size={18} />
                </div>
                {!collapsed && (
                  <>
                    <span className="text-sm font-medium flex-1 text-left">CRM</span>
                    {crmOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </>
                )}
              </button>

              {!collapsed && crmOpen && (
                <div className="ml-4 mt-1 space-y-0.5 border-l border-white/10 pl-2">
                  <NavLink
                    to="/interno/crm-visao-geral"
                    end
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) => navLinkClass(isActive) + ' text-xs'}
                  >
                    <span className="text-xs">Visão geral</span>
                  </NavLink>
                  <NavLink
                    to="/interno/aniversariantes"
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) => navLinkClass(isActive) + ' text-xs'}
                  >
                    <Cake size={14} className="mr-2" />
                    <span className="text-xs">Aniversariantes</span>
                  </NavLink>
                  <NavLink
                    to="/interno/divulgadores"
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) => navLinkClass(isActive) + ' text-xs'}
                  >
                    <Megaphone size={14} className="mr-2" />
                    <span className="text-xs">Influenciadores</span>
                  </NavLink>
                </div>
              )}
            </div>
          )}

          {/* Blueticket */}
          {canSeeHome && isEnabled('blueticket') && (
            <div>
              <button
                onClick={() => {
                  if (collapsed) {
                    navigate('/interno/lebai');
                    setSidebarOpen(false);
                  } else {
                    setBlueticketOpen(v => !v);
                  }
                }}
                className={navLinkClass(location.pathname === '/interno/lebai' || location.pathname === '/interno/aura')}
                title={collapsed ? 'Blueticket' : undefined}
              >
                <div className={`flex items-center justify-center ${collapsed ? '' : 'mr-2'}`}>
                  <Ticket size={18} />
                </div>
                {!collapsed && (
                  <>
                    <span className="text-sm font-medium flex-1 text-left">Blueticket</span>
                    {blueticketOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </>
                )}
              </button>
              {!collapsed && blueticketOpen && (
                <div className="ml-4 mt-1 space-y-0.5 border-l border-white/10 pl-2">
                  <NavLink
                    to="/interno/lebai"
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) => navLinkClass(isActive) + ' text-xs'}
                  >
                    <span className="text-xs">Le Bai</span>
                  </NavLink>
                  <NavLink
                    to="/interno/aura"
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) => navLinkClass(isActive) + ' text-xs'}
                  >
                    <span className="text-xs">Aura</span>
                  </NavLink>
                </div>
              )}
            </div>
          )}

          {/* Privê — ecossistema com identidade escura */}
          {canSeeHome && isEnabled('prive') && (
            <NavLink
              to="/interno/prive"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `group relative flex h-9 w-full items-center rounded-lg transition-all duration-150 ${
                  collapsed ? 'justify-center px-0' : 'px-3'
                } ${
                  isActive
                    ? 'bg-white/[0.06] border-l-2 border-[#E8C766]'
                    : 'hover:bg-white/[0.04]'
                }`
              }
              title={collapsed ? 'Privê' : undefined}
            >
              {() => (
                <img
                  src={logoPrive}
                  alt="Privê"
                  className={`${collapsed ? 'h-4' : 'h-5'} w-auto invert opacity-60 group-hover:opacity-100 transition-opacity`}
                />
              )}
            </NavLink>
          )}

          {/* Zig Tickets Dropdown */}
          {canSeeZigTickets && isEnabled('zig_tickets') && (
            <div>
              <button
                onClick={() => {
                  if (collapsed) {
                    navigate('/interno/zig-tickets');
                    setSidebarOpen(false);
                  } else {
                    setZigTicketsDropdownOpen(v => !v);
                  }
                }}
                className={navLinkClass(location.pathname.startsWith('/interno/zig-tickets'))}
                title={collapsed ? 'Zig Tickets' : undefined}
              >
                <div className={`flex items-center justify-center ${collapsed ? '' : 'mr-2'}`}>
                  <Ticket size={18} />
                </div>
                {!collapsed && (
                  <>
                    <span className="text-sm font-medium flex-1 text-left">Zig Tickets</span>
                    {zigTicketsDropdownOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </>
                )}
              </button>
              {!collapsed && zigTicketsDropdownOpen && (
                <div className="ml-4 mt-1 space-y-0.5 border-l border-white/10 pl-2">
                  <NavLink
                    to="/interno/zig-tickets/geral"
                    end
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) => navLinkClass(isActive) + ' text-xs'}
                  >
                    <span className="text-xs">Geral</span>
                  </NavLink>
                  <button className="flex items-center gap-1 w-full px-3 py-1.5 rounded text-xs font-medium text-[#6F6A5E] hover:text-[#EDEAE3] hover:bg-white/[0.04]">
                    <Ticket size={12} />
                    <span>Eventos</span>
                    <ChevronRight size={10} className="ml-auto" />
                  </button>
                  {zigEvents.map((event) => (
                    <NavLink
                      key={event.id}
                      to={`/interno/zig-tickets/${event.id}`}
                      onClick={() => setSidebarOpen(false)}
                      className={({ isActive }) => `flex h-7 w-full items-center rounded-lg px-3 pl-7 text-[11px] font-medium transition-all duration-150 ${
                        isActive
                          ? 'text-[#E8C766] bg-[#E8C766]/[0.06]'
                          : 'text-[#6F6A5E] hover:text-[#EDEAE3] hover:bg-white/[0.04]'
                      }`}
                    >
                      {event.name}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Base */}
          {canSeeHome && isEnabled('base') && (
            <NavLink
              to="/interno/base"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => navLinkClass(isActive)}
              title={collapsed ? 'Base' : undefined}
            >
              <div className={`flex items-center justify-center ${collapsed ? '' : 'mr-2'}`}>
                <Users size={18} />
              </div>
              {!collapsed && <span className="text-sm font-medium">Base</span>}
            </NavLink>
          )}

          {/* 2.5. Tarefas */}
          {isEnabled('tarefas') && (
            <NavLink
              to="/interno/tarefas"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => navLinkClass(isActive)}
              title={collapsed ? 'Tarefas' : undefined}
            >
              <div className={`flex items-center justify-center ${collapsed ? '' : 'mr-2'}`}>
                <ClipboardList size={18} />
              </div>
              {!collapsed && <span className="text-sm font-medium">Tarefas</span>}
            </NavLink>
          )}

          {/* 2.6. Calendário */}
          {isEnabled('calendario') && (
            <NavLink
              to="/interno/calendario"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => navLinkClass(isActive)}
              title={collapsed ? 'Calendário' : undefined}
            >
              <div className={`flex items-center justify-center ${collapsed ? '' : 'mr-2'}`}>
                <CalendarRange size={18} />
              </div>
              {!collapsed && <span className="text-sm font-medium">Calendário</span>}
            </NavLink>
          )}

          {/* Dados removido do sidebar */}

          {/* 2.6. Chat (WhatsApp + Instagram) */}
          {canSeeWhatsApp && isEnabled('chat') && (
            <NavLink
              to="/interno/whatsapp/chat"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => navLinkClass(isActive)}
              title={collapsed ? 'Chat' : undefined}
            >
              <div className={`flex items-center justify-center ${collapsed ? '' : 'mr-2'}`}>
                <MessageCircle size={18} />
              </div>
              {!collapsed && <span className="text-sm font-medium">Chat</span>}
            </NavLink>
          )}

          {/* 3. WhatsApp */}
          {canSeeWhatsApp && isEnabled('whatsapp') && (
            <>
              <button
                onClick={() => {
                  if (collapsed) { navigate('/interno/whatsapp'); }
                  else { setWhatsappOpen(!whatsappOpen); }
                }}
                className={navLinkClass(isActiveRoute('/interno/whatsapp') && !isActiveRoute('/interno/whatsapp/chat'))}
                title={collapsed ? 'WhatsApp' : undefined}
              >
                <div className={`flex items-center justify-center ${collapsed ? '' : 'mr-2'}`}>
                  <Send size={18} />
                </div>
                {!collapsed && (
                  <>
                    <span className="text-sm font-medium flex-1 text-left">WhatsApp</span>
                    <ChevronRight size={14} className={`text-white/25 transition-transform duration-200 ${whatsappOpen ? 'rotate-90' : ''}`} />
                  </>
                )}
              </button>
              {whatsappOpen && !collapsed && (
                <div className="space-y-0.5">
                  <NavLink to="/interno/whatsapp/dashboard" onClick={() => setSidebarOpen(false)} className={({ isActive }) => subItemClass(isActive)}>
                    <BarChart3 size={14} className="mr-2" /> Dashboard
                  </NavLink>
                  <NavLink to="/interno/whatsapp" end onClick={() => setSidebarOpen(false)} className={({ isActive }) => subItemClass(isActive)}>
                    <Send size={14} className="mr-2" /> Disparo
                  </NavLink>
                </div>
              )}
            </>
          )}


          {/* 6. Ads */}
          {canSeeAds && isEnabled('ads') && (
            <>
              <button
                onClick={() => {
                  if (collapsed) { navigate('/interno/ads/campanhas'); }
                  else { setAdsOpen(!adsOpen); }
                }}
                className={navLinkClass(isActiveRoute('/interno/ads'))}
                title={collapsed ? 'Ads' : undefined}
              >
                <div className={`flex items-center justify-center ${collapsed ? '' : 'mr-2'}`}>
                  <MetaIcon size={18} />
                </div>
                {!collapsed && (
                  <>
                    <span className="text-sm font-medium flex-1 text-left">Ads</span>
                    <ChevronRight size={14} className={`text-white/25 transition-transform duration-200 ${adsOpen ? 'rotate-90' : ''}`} />
                  </>
                )}
              </button>
              {adsOpen && !collapsed && (
                <div className="space-y-0.5">
                  <NavLink to="/interno/ads/campanhas" onClick={() => setSidebarOpen(false)} className={({ isActive }) => subItemClass(isActive)}>
                    <BarChart3 size={14} className="mr-2" /> Campanhas
                  </NavLink>
                  <NavLink to="/interno/ads/criativos" onClick={() => setSidebarOpen(false)} className={({ isActive }) => subItemClass(isActive)}>
                    <Trophy size={14} className="mr-2" /> Criativos Campeões
                  </NavLink>
                </div>
              )}
            </>
          )}

          {/* 8. Admin */}
          {isAdmin && (
            <NavLink
              to="/interno/admin"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => navLinkClass(isActive)}
              title={collapsed ? 'Admin' : undefined}
            >
              <div className={`flex items-center justify-center ${collapsed ? '' : 'mr-2'}`}>
                <Settings size={18} />
              </div>
              {!collapsed && <span className="text-sm font-medium">Admin</span>}
            </NavLink>
          )}

          {/* 9. Perfil */}
          <NavLink
            to="/interno/perfil"
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) => navLinkClass(isActive)}
            title={collapsed ? 'Perfil' : undefined}
          >
            <div className={`flex items-center justify-center ${collapsed ? '' : 'mr-2'}`}>
              <User size={18} />
            </div>
            {!collapsed && <span className="text-sm font-medium">Perfil</span>}
          </NavLink>
        </nav>

        {/* Bottom section */}
        <div className="border-t border-white/[0.06]">
          {!collapsed && (
            <div className="px-3 py-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#E8C766]/15 text-[#E8C766] text-xs font-bold">
                  {userName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <span className="block text-xs font-semibold text-[#EDEAE3]">{userName}</span>
                  <span className="block text-[10px] text-[#6F6A5E]">
                    {isAdmin ? 'Admin' : hasDesignRole ? 'Design' : hasTrafegoRole ? 'Gestor de Tráfego' : 'Parceiro'}
                  </span>
                </div>
              </div>
              <a
                href="https://wa.me/5527996528524"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] px-2 py-1.5 text-xs font-medium text-white transition-colors mb-1.5"
              >
                <MessageCircle size={12} /> Suporte
              </a>
              <button
                onClick={signOut}
                className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-white/10 px-2 py-1.5 text-xs text-[#8F8A7C] hover:bg-red-50 hover:text-red-600 hover:border-red-200 dark:hover:bg-red-950/40 dark:hover:text-red-400 dark:hover:border-red-900 transition-colors"
              >
                <LogOut size={12} /> Sair
              </button>
            </div>
          )}

          <div className={`flex items-center border-t border-white/[0.06] ${collapsed ? 'flex-col' : ''}`}>
            <button
              onClick={() => setIsDark(!isDark)}
              className={`flex items-center justify-center gap-1.5 text-[#6F6A5E] hover:text-[#EDEAE3] transition-colors ${
                collapsed ? 'w-full py-2.5' : 'flex-1 py-2.5'
              }`}
              title={isDark ? 'Modo claro' : 'Modo escuro'}
            >
              {isDark ? <Sun size={14} /> : <Moon size={14} />}
              {!collapsed && <span className="text-[11px]">{isDark ? 'Claro' : 'Escuro'}</span>}
            </button>
            <button
              onClick={() => setCollapsed(!collapsed)}
              className={`hidden lg:flex items-center justify-center text-[#6F6A5E] hover:text-[#EDEAE3] transition-colors ${
                collapsed ? 'w-full py-2.5' : 'flex-1 py-2.5 border-l border-white/[0.06]'
              }`}
              title={collapsed ? 'Expandir' : 'Recolher'}
            >
              <ChevronsRight size={14} className={`transition-transform ${collapsed ? '' : 'rotate-180'}`} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {!isHome && (
          <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border px-4 h-12 flex items-center gap-3 lg:px-6">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-muted-foreground hover:text-foreground">
              <Menu size={20} />
            </button>
            <h1 className="font-display text-[15px] font-medium tracking-tight text-foreground">
              {getPageTitle()}
            </h1>
            <NotificationBell />
          </header>
        )}

        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
