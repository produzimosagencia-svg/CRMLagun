// Ecossistema Privê — identidade visual própria: preto absoluto, monocromático escuro
export default function InternoPrive() {
  return (
    <div
      className="-m-4 lg:-m-6 p-8 md:p-12"
      style={{ backgroundColor: '#050505', minHeight: 'calc(100vh - 48px)' }}
    >
      {/* Cabeçalho do ecossistema */}
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-4 mb-2">
          <div className="flex-1 h-px" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />
          <span
            className="text-[10px] tracking-[0.5em] uppercase whitespace-nowrap"
            style={{ color: 'rgba(255,255,255,0.35)' }}
          >
            Lagun apresenta
          </span>
          <div className="flex-1 h-px" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />
        </div>

        <h1
          className="text-center text-5xl md:text-7xl font-bold tracking-[0.25em] uppercase mt-8"
          style={{
            color: '#EDEDED',
            textShadow: '0 0 40px rgba(255,255,255,0.12)',
          }}
        >
          Privê
        </h1>
        <p
          className="text-center text-xs tracking-[0.35em] uppercase mt-4"
          style={{ color: 'rgba(255,255,255,0.3)' }}
        >
          Ecossistema exclusivo
        </p>

        {/* Área reservada para os módulos do ecossistema */}
        <div
          className="mt-16 rounded-2xl border p-10 text-center"
          style={{
            borderColor: 'rgba(255,255,255,0.07)',
            backgroundColor: 'rgba(255,255,255,0.02)',
          }}
        >
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Os módulos do ecossistema Privê serão adicionados aqui.
          </p>
        </div>
      </div>
    </div>
  );
}
