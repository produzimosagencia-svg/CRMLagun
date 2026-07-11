// Ecossistema Privê — prévia do site (ainda sem domínio próprio), embutida
// aqui dentro do domínio do Lagun via iframe, sem redirecionar pra fora.
export default function InternoPrive() {
  return (
    <div
      className="-m-4 lg:-m-6"
      style={{ backgroundColor: '#050505', height: 'calc(100vh - 48px)' }}
    >
      <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <span
          className="text-[10px] tracking-[0.4em] uppercase"
          style={{ color: 'rgba(255,255,255,0.4)' }}
        >
          Privê — prévia do site
        </span>
        <a
          href="/prive-preview/index.html"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] tracking-[0.2em] uppercase hover:underline"
          style={{ color: 'rgba(255,255,255,0.4)' }}
        >
          Abrir em nova aba ↗
        </a>
      </div>
      <iframe
        src="/prive-preview/index.html"
        title="Privê — prévia do site"
        className="w-full border-0"
        style={{ height: 'calc(100% - 33px)' }}
      />
    </div>
  );
}
