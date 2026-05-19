export default function Termos() {
  return (
    <div style={{ backgroundColor: '#0f0a05', minHeight: '100vh', color: 'rgba(255,255,255,0.8)', fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '60px 24px' }}>
        <p style={{ color: '#F5D470', fontSize: 11, letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: 12 }}>Lagun · Vitória/ES</p>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Termos de Serviço</h1>
        <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, marginBottom: 40 }}>Última atualização: maio de 2026</p>

        {[
          {
            title: '1. Aceitação dos termos',
            text: 'Ao acessar o site, comprar ingressos ou interagir com qualquer serviço digital da Lagun, você concorda com estes Termos de Serviço. Se não concordar, não utilize nossos serviços.',
          },
          {
            title: '2. Sobre a Lagun',
            text: 'A Lagun é uma casa noturna localizada em Vitória/ES, que oferece experiências de entretenimento noturno, aluguel de lounges privativos e serviços de hospitalidade.',
          },
          {
            title: '3. Ingressos e reservas',
            text: 'A compra de ingressos é processada por plataformas parceiras (OnTicket, Zig Tickets). A Lagun não se responsabiliza por falhas técnicas dessas plataformas. Ingressos não são reembolsáveis, exceto em caso de cancelamento do evento pela Lagun. Reservas de lounge estão sujeitas à disponibilidade e confirmação prévia.',
          },
          {
            title: '4. Conduta no estabelecimento',
            text: 'A Lagun reserva o direito de recusar entrada ou retirar do local qualquer pessoa que: esteja em estado de embriaguez ou sob efeito de substâncias ilícitas; apresente comportamento agressivo ou desrespeitoso; descumpra as regras internas do estabelecimento. Não há reembolso de ingresso em caso de retirada por violação de conduta.',
          },
          {
            title: '5. Comunicações automáticas',
            text: 'Ao nos enviar mensagem via Instagram Direct ou WhatsApp, você pode receber respostas automáticas geradas por inteligência artificial. Essas respostas são informativas e não constituem contrato ou compromisso formal. Para assuntos que exijam confirmação oficial, entre em contato diretamente com nossa equipe.',
          },
          {
            title: '6. Propriedade intelectual',
            text: 'Todo o conteúdo do site (textos, imagens, vídeos, logotipos) é de propriedade da Lagun ou licenciado para uso. É proibida a reprodução sem autorização prévia por escrito.',
          },
          {
            title: '7. Limitação de responsabilidade',
            text: 'A Lagun não se responsabiliza por: danos indiretos decorrentes do uso dos serviços; falhas em serviços de terceiros (plataformas de ingresso, redes sociais); perdas, furtos ou danos a pertences pessoais dentro do estabelecimento (exceto nos casos previstos em lei).',
          },
          {
            title: '8. Alterações nos termos',
            text: 'Podemos atualizar estes termos a qualquer momento. As alterações entram em vigor na data de publicação. O uso continuado dos serviços após as alterações implica aceitação.',
          },
          {
            title: '9. Legislação aplicável',
            text: 'Estes termos são regidos pelas leis brasileiras. Qualquer disputa será resolvida no Foro da Comarca de Vitória, Espírito Santo.',
          },
          {
            title: '10. Contato',
            text: 'Lagun Entretenimento\nRua Manoel Gonçalves Carneiro, 65 — Praia do Canto, Vitória/ES\nE-mail: contato@lagun.com.br\nInstagram: @lagun.vix',
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
