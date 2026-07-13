import { Globe, MessageCircle } from 'lucide-react';

const PHONE = '5527996528524';
const MESSAGE =
  'Olá! Gostaria de solicitar um orçamento para um site personalizado para o meu evento. Poderia me passar mais informações?';
const WHATSAPP_URL = `https://wa.me/${PHONE}?text=${encodeURIComponent(MESSAGE)}`;

export default function InternoOrcamentoSite() {
  return (
    <div className="max-w-2xl mx-auto p-4 md:p-8">
      <div className="rounded-2xl border border-border bg-card p-8 md:p-12 text-center shadow-sm">
        <div
          className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full"
          style={{ backgroundColor: 'rgba(232,199,102,0.14)' }}
        >
          <Globe size={30} style={{ color: '#E8C766' }} />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-3">🌐 Orçamento de Site</h1>
        <p className="text-muted-foreground leading-relaxed mb-8 max-w-md mx-auto">
          Solicite um orçamento para um site exclusivo do seu evento. Desenvolvemos uma página
          totalmente personalizada, com a identidade visual, tema, cores e informações do seu
          evento, proporcionando uma experiência profissional para seus convidados.
        </p>
        <a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2.5 px-8 py-4 rounded-xl font-bold text-white transition-transform hover:scale-[1.02] active:scale-[0.98]"
          style={{
            background: 'linear-gradient(135deg, #2EE06F 0%, #25D366 45%, #1DAA52 100%)',
            boxShadow: '0 0 28px rgba(37,211,102,0.45), 0 8px 24px rgba(37,211,102,0.25)',
          }}
        >
          <MessageCircle size={20} />
          Solicitar Orçamento pelo WhatsApp
        </a>
      </div>
    </div>
  );
}
