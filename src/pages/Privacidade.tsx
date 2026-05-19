export default function Privacidade() {
  return (
    <div style={{ backgroundColor: '#0f0a05', minHeight: '100vh', color: 'rgba(255,255,255,0.8)', fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '60px 24px' }}>
        <p style={{ color: '#F5D470', fontSize: 11, letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: 12 }}>Lagun · Vitória/ES</p>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Política de Privacidade</h1>
        <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, marginBottom: 40 }}>Última atualização: maio de 2026</p>

        {[
          {
            title: '1. Quem somos',
            text: 'A Lagun é uma casa noturna localizada em Vitória, Espírito Santo, Brasil. Esta Política de Privacidade descreve como coletamos, usamos e protegemos as informações dos usuários que interagem com nossas plataformas digitais, incluindo o site, redes sociais e sistemas de comunicação.',
          },
          {
            title: '2. Informações que coletamos',
            text: 'Podemos coletar: nome, número de telefone, endereço de e-mail, data de nascimento, dados de compra de ingressos, histórico de interações com nosso suporte via Instagram Direct e WhatsApp, e dados de navegação no site (cookies técnicos).',
          },
          {
            title: '3. Como usamos suas informações',
            text: 'Usamos suas informações para: processar compras de ingressos e reservas de lounge; enviar confirmações e informações sobre eventos; prestar atendimento ao cliente via chat automatizado e humano; enviar comunicações de marketing quando você der consentimento; cumprir obrigações legais.',
          },
          {
            title: '4. Integração com o Instagram (Meta)',
            text: 'Nosso sistema utiliza a API do Instagram (Meta Platforms) para receber e responder mensagens diretas (DMs). Ao nos enviar uma mensagem pelo Instagram, você consente que a mensagem seja processada pelo nosso sistema automatizado. Não compartilhamos suas mensagens com terceiros além dos prestadores de serviço necessários para o funcionamento do sistema.',
          },
          {
            title: '5. Compartilhamento de dados',
            text: 'Não vendemos nem alugamos seus dados pessoais. Podemos compartilhá-los apenas com: prestadores de serviços tecnológicos que nos auxiliam na operação (sujeitos a acordos de confidencialidade); autoridades públicas quando exigido por lei.',
          },
          {
            title: '6. Retenção de dados',
            text: 'Mantemos seus dados pelo período necessário para as finalidades descritas nesta política, ou pelo prazo exigido por lei. Mensagens de atendimento são armazenadas por até 2 anos.',
          },
          {
            title: '7. Seus direitos (LGPD)',
            text: 'De acordo com a Lei Geral de Proteção de Dados (Lei 13.709/2018), você tem direito a: acessar seus dados, corrigir informações incorretas, solicitar a exclusão dos seus dados, revogar consentimentos e solicitar portabilidade. Para exercer esses direitos, entre em contato pelo e-mail: contato@lagun.com.br',
          },
          {
            title: '8. Segurança',
            text: 'Adotamos medidas técnicas e organizacionais para proteger seus dados contra acesso não autorizado, perda ou destruição. Nossos dados são armazenados em servidores seguros na nuvem (Supabase/AWS).',
          },
          {
            title: '9. Cookies',
            text: 'Nosso site utiliza cookies estritamente necessários para o funcionamento. Não utilizamos cookies de rastreamento de terceiros sem o seu consentimento.',
          },
          {
            title: '10. Contato',
            text: 'Para dúvidas sobre esta política, entre em contato:\nLagun Entretenimento\nRua Manoel Gonçalves Carneiro, 65 — Praia do Canto, Vitória/ES\nE-mail: contato@lagun.com.br\nInstagram: @lagun.vix',
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
