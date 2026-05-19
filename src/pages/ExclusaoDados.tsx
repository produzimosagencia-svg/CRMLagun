import { useEffect, useState } from 'react';

export default function ExclusaoDados() {
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setCode(params.get('code'));
  }, []);

  return (
    <div style={{ backgroundColor: '#0f0a05', minHeight: '100vh', color: 'rgba(255,255,255,0.8)', fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '60px 24px' }}>
        <p style={{ color: '#F5D470', fontSize: 11, letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: 12 }}>Lagun · Vitória/ES</p>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Exclusão de Dados</h1>
        <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, marginBottom: 40 }}>Última atualização: maio de 2026</p>

        {code ? (
          <div style={{ background: 'rgba(245,212,112,0.08)', border: '1px solid rgba(245,212,112,0.2)', borderRadius: 12, padding: '24px 28px', marginBottom: 40 }}>
            <p style={{ color: '#F5D470', fontWeight: 700, marginBottom: 8 }}>✓ Solicitação recebida</p>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 12 }}>
              Seus dados foram removidos dos nossos sistemas. Guarde o código abaixo para referência:
            </p>
            <code style={{ fontSize: 13, color: '#fff', background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: 6 }}>{code}</code>
          </div>
        ) : null}

        {[
          {
            title: 'Como solicitar a exclusão dos seus dados',
            text: 'Você pode solicitar a exclusão dos seus dados pessoais armazenados pela Lagun de duas formas:\n\n1. Através do Facebook/Instagram: acesse as configurações da sua conta → Segurança e Login → Aplicativos e Sites → encontre a Lagun → clique em "Remover" → selecione "Solicitar exclusão de dados".\n\n2. Por e-mail: envie uma solicitação para contato@lagun.com.br com o assunto "Exclusão de Dados" informando seu nome e o canal de contato que utilizou (Instagram, WhatsApp etc.).',
          },
          {
            title: 'Quais dados são excluídos',
            text: 'Ao solicitar a exclusão, removemos permanentemente:\n• Histórico de mensagens via Instagram Direct\n• Dados de cadastro vinculados à sua conta\n• Preferências e dados de atendimento\n\nDados de compra de ingressos podem ser retidos pelo prazo legal (5 anos) para fins fiscais.',
          },
          {
            title: 'Prazo',
            text: 'A exclusão é processada em até 30 dias corridos após a confirmação da solicitação.',
          },
          {
            title: 'Contato',
            text: 'E-mail: contato@lagun.com.br\nInstagram: @lagun.vix\nWhatsApp: (27) 99778-9988',
          },
        ].map((section) => (
          <div key={section.title} style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#F5D470', marginBottom: 8 }}>{section.title}</h2>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: 'rgba(255,255,255,0.65)', whiteSpace: 'pre-line' }}>{section.text}</p>
          </div>
        ))}

        <div style={{ borderTop: '1px solid rgba(245,212,112,0.1)', paddingTop: 32, marginTop: 16 }}>
          <a href="/" style={{ color: '#F5D470', fontSize: 13, textDecoration: 'none' }}>← Voltar ao site</a>
        </div>
      </div>
    </div>
  );
}
