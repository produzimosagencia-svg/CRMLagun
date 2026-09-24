import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

// A4 a 96 dpi. O relatório é montado fora da tela nessa largura e fatiado em páginas A4.
export const A4_W = 794;
export const A4_H = 1123;

const esperarImagens = (el: HTMLElement) =>
  Promise.all([...el.querySelectorAll('img')].map((img) => (img.complete
    ? Promise.resolve()
    : new Promise<void>((ok) => { img.onload = img.onerror = () => ok(); window.setTimeout(ok, 4000); }))));

/** Renderiza `pagina` fora da tela e baixa como PDF A4 (uma ou mais folhas). */
export async function baixarRelatorioPdf(pagina: ReactNode, arquivo: string) {
  const pdf = await montarPdf(pagina);
  pdf.save(`${arquivo}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

/** Mesmo PDF de `baixarRelatorioPdf`, devolvido como Blob (para abrir direto no navegador). */
export async function gerarRelatorioPdfBlob(pagina: ReactNode): Promise<Blob> {
  const pdf = await montarPdf(pagina);
  return pdf.output('blob');
}

async function montarPdf(pagina: ReactNode) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${A4_W}px;background:#fff;z-index:-1`;
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    root.render(pagina);
    await new Promise((r) => window.setTimeout(r, 60));
    await document.fonts?.ready;
    await esperarImagens(host);
    const alvo = host.firstElementChild as HTMLElement;
    const canvas = await html2canvas(alvo, { scale: 2, useCORS: true, backgroundColor: '#FFFFFF', width: A4_W, windowWidth: A4_W });
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [A4_W, A4_H], compress: true, hotfixes: ['px_scaling'] });
    const alturaPagina = A4_H * 2;
    // Quebra nos blocos marcados com data-bloco quando o conteúdo passa de uma folha.
    const cortes = [...alvo.querySelectorAll<HTMLElement>('[data-bloco]')].map((b) => (b.offsetTop + b.offsetHeight) * 2);
    let inicio = 0;
    while (inicio < canvas.height - 4) {
      let fim = Math.min(inicio + alturaPagina, canvas.height);
      if (fim < canvas.height) {
        const melhor = cortes.filter((c) => c > inicio + 200 && c <= fim).pop();
        if (melhor) fim = melhor;
      }
      const folha = document.createElement('canvas');
      folha.width = canvas.width; folha.height = alturaPagina;
      const ctx = folha.getContext('2d')!;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, folha.width, folha.height);
      ctx.drawImage(canvas, 0, inicio, canvas.width, fim - inicio, 0, 0, canvas.width, fim - inicio);
      if (inicio > 0) pdf.addPage([A4_W, A4_H], 'portrait');
      pdf.addImage(folha.toDataURL('image/jpeg', 0.93), 'JPEG', 0, 0, A4_W, A4_H);
      inicio = fim;
    }
    return pdf;
  } finally {
    root.unmount(); host.remove();
  }
}
