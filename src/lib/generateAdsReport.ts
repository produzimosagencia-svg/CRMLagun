import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface SummaryData {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  roas: number;
  purchases: number;
  purchaseValue: number;
}

interface CampaignRow {
  name: string;
  objective: string;
  spend: number;
  impressions: number;
  clicks: number;
  returnValue: number;
}

interface ObjectiveGroup {
  label: string;
  icon: string;
  totalSpend: number;
  campaigns: CampaignRow[];
  type: 'sales' | 'engagement' | 'traffic' | 'other';
}

interface ReportData {
  summary: SummaryData;
  groups: ObjectiveGroup[];
  dateLabel: string;
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatNumber(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString('pt-BR');
}

export function generateAdsReport(data: ReportData) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth(); // 210
  const margin = 20;
  const contentW = pageW - margin * 2;

  // Colors
  const darkGray = '#333333';
  const medGray = '#666666';
  const lightGray = '#999999';
  const borderColor = '#E5E7EB';
  const greenColor = '#059669';
  const redBg = '#FEF2F2';
  const greenBg = '#F0FDF4';
  const blueBg = '#EFF6FF';
  const purpleBg = '#F5F3FF';

  let y = margin;

  // ── Header ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.setTextColor(darkGray);
  doc.text('Relatório de ADS', margin, y + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.setTextColor(medGray);
  doc.text('Lagun Vitória', margin, y + 16);

  // Logo text (top right)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(darkGray);
  doc.text('LAGUN', pageW - margin, y + 6, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(lightGray);
  doc.text('V I T Ó R I A · E S', pageW - margin, y + 10, { align: 'right' });

  // Date range subtitle
  doc.setFontSize(9);
  doc.setTextColor(lightGray);
  doc.text(data.dateLabel, margin, y + 24);

  y += 34;

  // ── Summary Cards ──
  const cardW = (contentW - 4 * 3) / 5; // 5 cards with 3mm gap
  const cardH = 28;

  const cards = [
    { label: 'Gasto total', value: formatCurrency(data.summary.spend), bg: redBg, iconColor: '#EF4444' },
    { label: 'Retorno', value: formatCurrency(data.summary.purchaseValue), bg: greenBg, iconColor: greenColor },
    { label: 'ROAS', value: data.summary.roas > 0 ? `${data.summary.roas.toFixed(2)}x` : '—', bg: greenBg, iconColor: greenColor },
    { label: 'Impressões', value: formatNumber(data.summary.impressions), subtitle: `Alcance: ${formatNumber(data.summary.reach)}`, bg: blueBg, iconColor: '#3B82F6' },
    { label: 'Cliques', value: formatNumber(data.summary.clicks), subtitle: data.summary.purchases > 0 ? `${data.summary.purchases} compras` : undefined, bg: purpleBg, iconColor: '#8B5CF6' },
  ];

  // Draw outer border for all cards
  doc.setDrawColor(borderColor);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, contentW, cardH, 2, 2, 'S');

  cards.forEach((card, i) => {
    const x = margin + i * (cardW + 3);

    // Vertical separator (except first)
    if (i > 0) {
      doc.setDrawColor(borderColor);
      doc.setLineWidth(0.2);
      doc.line(x - 1.5, y + 3, x - 1.5, y + cardH - 3);
    }

    // Icon dot
    doc.setFillColor(card.iconColor);
    doc.circle(x + 5, y + 6, 1.5, 'F');

    // Label
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(lightGray);
    doc.text(card.label, x + 3, y + 14);

    // Value
    const isLarge = card.label === 'Retorno' || card.label === 'ROAS';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(isLarge ? 12 : 10);
    doc.setTextColor(darkGray);
    doc.text(card.value, x + 3, y + 21);

    // Subtitle
    if (card.subtitle) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(lightGray);
      doc.text(card.subtitle, x + 3, y + 25);
    }
  });

  y += cardH + 8;

  // ── Objective Groups (tables) ──
  for (const group of data.groups) {
    // Check if we need a new page
    const estimatedHeight = 20 + group.campaigns.length * 10;
    if (y + estimatedHeight > 270) {
      doc.addPage();
      y = margin;
    }

    // Group header with border
    doc.setDrawColor(borderColor);
    doc.setLineWidth(0.3);

    const tableStartY = y;

    // Title row
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(darkGray);
    doc.text(`${group.icon} ${group.label}`, margin + 4, y + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(lightGray);
    doc.text(`${formatCurrency(group.totalSpend)} gastos`, pageW - margin - 4, y + 6, { align: 'right' });

    y += 10;

    // Column headers + rows using autoTable
    let head: string[][];
    let body: string[][];

    if (group.type === 'sales') {
      head = [['CAMPANHA', 'GASTO', 'RETORNO']];
      body = group.campaigns.map(c => [
        c.name,
        formatCurrency(c.spend),
        formatCurrency(c.returnValue),
      ]);
    } else if (group.type === 'engagement' || group.type === 'traffic') {
      head = [['CAMPANHA', 'IMPRESSÕES', 'CLIQUES', 'GASTO']];
      body = group.campaigns.map(c => [
        c.name,
        formatNumber(c.impressions),
        formatNumber(c.clicks),
        formatCurrency(c.spend),
      ]);
    } else {
      head = [['CAMPANHA', 'GASTO']];
      body = group.campaigns.map(c => [
        c.name,
        formatCurrency(c.spend),
      ]);
    }

    autoTable(doc, {
      startY: y,
      margin: { left: margin + 2, right: margin + 2 },
      head,
      body,
      theme: 'plain',
      styles: {
        fontSize: 8,
        cellPadding: { top: 3, bottom: 3, left: 2, right: 2 },
        textColor: medGray,
        lineWidth: 0,
      },
      headStyles: {
        fontSize: 6.5,
        textColor: lightGray,
        fontStyle: 'bold',
        cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
      },
      columnStyles: group.type === 'sales'
        ? {
            0: { cellWidth: 'auto', fontStyle: 'bold', textColor: darkGray },
            1: { halign: 'right', cellWidth: 30 },
            2: { halign: 'right', cellWidth: 30, fontStyle: 'bold', textColor: greenColor },
          }
        : group.type === 'engagement' || group.type === 'traffic'
        ? {
            0: { cellWidth: 'auto', fontStyle: 'bold', textColor: darkGray },
            1: { halign: 'right', cellWidth: 25 },
            2: { halign: 'right', cellWidth: 20 },
            3: { halign: 'right', cellWidth: 30, fontStyle: 'bold', textColor: darkGray },
          }
        : {
            0: { cellWidth: 'auto', fontStyle: 'bold', textColor: darkGray },
            1: { halign: 'right', cellWidth: 30, fontStyle: 'bold', textColor: darkGray },
          },
      didDrawCell: (hookData) => {
        // Draw separator lines between rows (except header)
        if (hookData.section === 'body' && hookData.row.index > 0 && hookData.column.index === 0) {
          doc.setDrawColor('#F3F4F6');
          doc.setLineWidth(0.2);
          doc.line(
            margin + 4,
            hookData.cell.y,
            pageW - margin - 4,
            hookData.cell.y
          );
        }
      },
    });

    // @ts-ignore - autoTable adds lastAutoTable
    const finalY = (doc as any).lastAutoTable.finalY || y + 20;

    // Draw rounded border around the whole group
    doc.setDrawColor(borderColor);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, tableStartY, contentW, finalY - tableStartY + 4, 2, 2, 'S');

    y = finalY + 10;
  }

  // ── Footer ──
  const footerY = doc.internal.pageSize.getHeight() - 15;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor('#BFBFBF');
  doc.text('lagunvitoria.com.br', pageW / 2, footerY, { align: 'center' });

  return doc;
}
