import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import App from "./App.tsx";
import { Toaster } from "sonner";
import "./index.css";

const InternoLogin = lazy(() => import("./pages/InternoLogin.tsx"));
const InternoLayout = lazy(() => import("./pages/interno/InternoLayout.tsx"));
const InternoEventos = lazy(() => import("./pages/interno/InternoEventos.tsx"));
const InternoCrmVisaoGeral = lazy(() => import("./pages/interno/InternoCrmVisaoGeral.tsx"));
const InternoEventosDashboard = lazy(() => import("./pages/interno/InternoEventosDashboard.tsx"));
const InternoTrafegoGPT = lazy(() => import("./pages/interno/InternoTrafegoGPT.tsx"));
const CrmCustomers = lazy(() => import("./pages/crm/CrmCustomers.tsx"));
const CrmCustomerForm = lazy(() => import("./pages/crm/CrmCustomerForm.tsx"));
const CrmCustomerDetail = lazy(() => import("./pages/crm/CrmCustomerDetail.tsx"));
const CrmSuperclientes = lazy(() => import("./pages/crm/CrmSuperclientes.tsx"));
const CrmCreators = lazy(() => import("./pages/crm/CrmCreators.tsx"));
const CrmAniversariantes = lazy(() => import("./pages/crm/CrmAniversariantes.tsx"));
const InternoMarketing = lazy(() => import("./pages/interno/InternoMarketing.tsx"));
const InternoDivulgadores = lazy(() => import("./pages/interno/InternoDivulgadores.tsx"));
const InternoDivulgadoresInstagram = lazy(() => import("./pages/interno/InternoDivulgadoresInstagram.tsx"));
const InternoReferencias = lazy(() => import("./pages/interno/InternoReferencias.tsx"));
const InternoDesign = lazy(() => import("./pages/interno/InternoDesign.tsx"));
const InternoSocialMedia = lazy(() => import("./pages/interno/InternoSocialMedia.tsx"));
const InternoCampanhas = lazy(() => import("./pages/interno/InternoCampanhas.tsx"));
const InternoRelatorios = lazy(() => import("./pages/interno/InternoRelatorios.tsx"));
const InternoCriativosCampeoes = lazy(() => import("./pages/interno/InternoCriativosCampeoes.tsx"));
const InternoAdsCriarCampanha = lazy(() => import("./pages/interno/InternoAdsCriarCampanha.tsx"));
const InternoAdsPixel = lazy(() => import("./pages/interno/InternoAdsPixel.tsx"));
const InternoLeBai = lazy(() => import("./pages/interno/InternoLeBai.tsx"));
const InternoAura = lazy(() => import("./pages/interno/InternoAura.tsx"));
const InternoBase = lazy(() => import("./pages/interno/InternoBase.tsx"));
const InternoInstagram = lazy(() => import("./pages/interno/InternoInstagram.tsx"));
const InternoWhatsApp = lazy(() => import("./pages/interno/InternoWhatsApp.tsx"));
const InternoWhatsAppChat = lazy(() => import("./pages/interno/InternoWhatsAppChat.tsx"));
const InternoWhatsAppDashboard = lazy(() => import("./pages/interno/InternoWhatsAppDashboard.tsx"));
const InternoBluetick = lazy(() => import("./pages/interno/InternoBluetick.tsx"));
const InternoZigTickets = lazy(() => import("./pages/interno/InternoZigTickets.tsx"));
const InternoZigTicketsGeral = lazy(() => import("./pages/interno/InternoZigTicketsGeral.tsx"));
const InternoEmail = lazy(() => import("./pages/interno/InternoEmail.tsx"));
const InternoAdmin = lazy(() => import("./pages/interno/InternoAdmin.tsx"));
const InternoTarefas = lazy(() => import("./pages/interno/InternoTarefas.tsx"));
const InternoPerfil = lazy(() => import("./pages/interno/InternoPerfil.tsx"));
const InternoGrafos = lazy(() => import("./pages/interno/InternoGrafos.tsx"));
const InternoGrafosLista = lazy(() => import("./pages/interno/InternoGrafosLista.tsx"));
const InternoDados = lazy(() => import("./pages/interno/InternoDados.tsx"));
const InternoLanding = lazy(() => import("./pages/interno/InternoLanding.tsx"));
const InternoCalendario = lazy(() => import("./pages/interno/InternoCalendario.tsx"));
const Privacidade = lazy(() => import("./pages/Privacidade.tsx"));
const Termos = lazy(() => import("./pages/Termos.tsx"));
const ExclusaoDados = lazy(() => import("./pages/ExclusaoDados.tsx"));
const InfluenciadorConectar = lazy(() => import("./pages/InfluenciadorConectar.tsx"));
const InfluenciadorCallback = lazy(() => import("./pages/InfluenciadorCallback.tsx"));

const Fallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <div className="h-8 w-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
  </div>
);

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Toaster />
    <Suspense fallback={<Fallback />}>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/privacidade" element={<Privacidade />} />
        <Route path="/termos" element={<Termos />} />
        <Route path="/exclusao-de-dados" element={<ExclusaoDados />} />
        <Route path="/influenciadores/conectar" element={<InfluenciadorConectar />} />
        <Route path="/influenciadores/callback" element={<InfluenciadorCallback />} />

        <Route path="/interno/login" element={<InternoLogin />} />
        <Route path="/interno/trafego-gpt" element={<InternoTrafegoGPT />} />
        <Route path="/interno" element={<InternoLayout />}>
          <Route index element={<Navigate to="/interno/eventos-dashboard" replace />} />
          <Route path="eventos-dashboard" element={<InternoEventosDashboard />} />
          <Route path="eventos" element={<InternoEventos />} />
          <Route path="crm-visao-geral" element={<InternoCrmVisaoGeral />} />
          <Route path="zig-tickets" element={<InternoZigTicketsGeral />} />
          <Route path="zig-tickets/geral" element={<InternoZigTicketsGeral />} />
          <Route path="zig-tickets/:eventId" element={<InternoZigTickets />} />
          <Route path="clientes" element={<CrmCustomers />} />
          <Route path="clientes/novo" element={<CrmCustomerForm />} />
          <Route path="clientes/:id" element={<CrmCustomerDetail />} />
          <Route path="clientes/:id/editar" element={<CrmCustomerForm />} />
          <Route path="superclientes" element={<CrmSuperclientes />} />
          <Route path="aniversariantes" element={<CrmAniversariantes />} />
          <Route path="instagram" element={<InternoInstagram />} />
          <Route path="whatsapp" element={<InternoWhatsApp />} />
          <Route path="whatsapp/dashboard" element={<InternoWhatsAppDashboard />} />
          <Route path="whatsapp/chat" element={<InternoWhatsAppChat />} />
          <Route path="lebai" element={<InternoLeBai />} />
          <Route path="aura" element={<InternoAura />} />
          <Route path="base" element={<InternoBase />} />
          <Route path="blueticket" element={<InternoBluetick />} />
          <Route path="blueticket/:eventId" element={<InternoBluetick />} />
          <Route path="email" element={<InternoEmail />} />
          <Route path="ads/campanhas" element={<InternoRelatorios />} />
          <Route path="ads/criativos" element={<InternoCriativosCampeoes />} />
          <Route path="ads/criar" element={<InternoAdsCriarCampanha />} />
          <Route path="ads/pixel" element={<InternoAdsPixel />} />
          <Route path="zig-tickets" element={<InternoZigTickets />} />
          <Route path="zig-tickets/:eventId" element={<InternoZigTickets />} />
          <Route path="tarefas" element={<InternoTarefas />} />
          <Route path="divulgadores" element={<InternoDivulgadores />} />
          <Route path="divulgadores/instagram" element={<InternoDivulgadoresInstagram />} />
          <Route path="admin" element={<InternoAdmin />} />
          <Route path="perfil" element={<InternoPerfil />} />
          <Route path="grafos" element={<InternoGrafosLista />} />
          <Route path="grafos/:id" element={<InternoGrafos />} />
          <Route path="dados" element={<InternoDados />} />
          <Route path="landing" element={<InternoLanding />} />
          <Route path="calendario" element={<InternoCalendario />} />
          <Route path="marketing" element={<InternoMarketing />}>
            <Route index element={null} />
            <Route path="creators" element={<CrmCreators />} />
            <Route path="divulgadores" element={<InternoDivulgadores />} />
            <Route path="referencias" element={<InternoReferencias />} />
            <Route path="design" element={<InternoDesign />} />
            <Route path="social-media" element={<InternoSocialMedia />} />
            <Route path="campanhas" element={<InternoCampanhas />} />
            <Route path="relatorios" element={<InternoRelatorios />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  </BrowserRouter>
);
