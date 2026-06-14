import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import logoEbisaUrl from '../../assets/LOGO_EBISA_ENGENHARIA.png'
import { isPLSg, fmtMoeda as fmtPDF, periodoLabel, type CalcDFResult } from './dfUtils'
import type { DFParams } from './dfData'

export type { DFParams }

async function loadBase64(url: string): Promise<string> {
  const resp = await fetch(url)
  const blob = await resp.blob()
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.readAsDataURL(blob)
  })
}

export async function addHeader(doc: jsPDF, params: DFParams, title: string): Promise<number> {
  const isEbisa = params.empresa.abreviacao.toLowerCase().includes('ebisa')
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 15
  let y = 15

  if (isEbisa) {
    const imgData = await loadBase64(logoEbisaUrl)
    doc.addImage(imgData, 'PNG', margin, y, 40, 15)
  } else {
    doc.setDrawColor(180)
    doc.setFillColor(240, 240, 240)
    doc.rect(margin, y, 40, 15, 'FD')
    doc.setFontSize(7)
    doc.setTextColor(160)
    doc.text('LOGO', margin + 20, y + 9, { align: 'center' })
  }
  y += 22

  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 30, 30)
  doc.text(params.empresa.razao_social, margin, y)
  y += 6

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(80, 80, 80)
  const vigenciaText = params.periodo1 && params.periodo1.anoVigencia !== params.periodo2.anoVigencia
    ? `Vigências: ${params.periodo1.anoVigencia} / ${params.periodo2.anoVigencia}`
    : `Vigência: ${params.periodo2.anoVigencia}`
  doc.text(vigenciaText, margin, y)
  y += 5

  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(20, 20, 120)
  doc.text(title, pageW / 2, y, { align: 'center' })

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(80, 80, 80)
  const periodoText = params.periodo1
    ? `${periodoLabel(params.periodo1)} a ${periodoLabel(params.periodo2)}`
    : periodoLabel(params.periodo2)
  doc.text(`Período: ${periodoText}`, pageW / 2, y + 5, { align: 'center' })
  y += 12

  const dataGeracao = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  doc.setFontSize(7)
  doc.setTextColor(150, 150, 150)
  doc.text(`Gerado em ${dataGeracao}`, pageW - margin, y - 2, { align: 'right' })

  doc.setDrawColor(180, 180, 200)
  doc.line(margin, y + 1, pageW - margin, y + 1)
  y += 7

  return y
}

export async function gerarDRE(params: DFParams, df1: CalcDFResult, df2?: CalcDFResult): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const margin = 15
  const pageW = doc.internal.pageSize.getWidth()
  const tableW = pageW - margin * 2
  const hasDual = !!df2

  const startY = await addHeader(doc, params, 'DRE — Demonstração do Resultado do Exercício')

  const colDesc = hasDual ? tableW * 0.55 : tableW * 0.65
  const colVal = hasDual ? tableW * 0.225 : tableW * 0.35

  type CellDef = string | { content: string; colSpan?: number; styles?: object }
  type Row = CellDef[]

  const body: Row[] = []
  for (const g of df1.gruposResultado) {
    for (const item of g.itens) {
      if (hasDual) {
        const saldo2 = df2!.gruposResultado.flatMap(g2 => g2.itens).find(i => i.id === item.id)?.saldo ?? 0
        body.push([item.desc_bp_dre, fmtPDF(item.saldo), fmtPDF(saldo2)])
      } else {
        body.push([item.desc_bp_dre, fmtPDF(item.saldo)])
      }
    }
  }

  const head = hasDual
    ? [['Descrição', periodoLabel(params.periodo1!), periodoLabel(params.periodo2)]]
    : [['Descrição', periodoLabel(params.periodo2)]]

  const foot: Row[] = []
  if (hasDual) {
    foot.push([
      { content: 'RESULTADO', styles: { fontStyle: 'bold' } },
      { content: fmtPDF(df1.totalResultado), styles: { fontStyle: 'bold' } },
      { content: fmtPDF(df2!.totalResultado), styles: { fontStyle: 'bold' } },
    ])
  } else {
    foot.push([
      { content: 'RESULTADO', styles: { fontStyle: 'bold' } },
      { content: fmtPDF(df1.totalResultado), styles: { fontStyle: 'bold' } },
    ])
  }

  const colStyles: Record<number, object> = {
    0: { cellWidth: colDesc },
    1: { cellWidth: colVal, halign: 'right' },
  }
  if (hasDual) colStyles[2] = { cellWidth: colVal, halign: 'right' }

  autoTable(doc, {
    startY,
    head,
    body,
    foot,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 30, 120], textColor: [255, 255, 255], fontStyle: 'bold' },
    footStyles: { fillColor: [220, 230, 255], textColor: [20, 20, 100] },
    columnStyles: colStyles,
  })

  doc.save(`DRE_${params.empresa.abreviacao}_${params.periodo2.anoVigencia}.pdf`)
}

export async function gerarBP(params: DFParams, df1: CalcDFResult, df2?: CalcDFResult): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const margin = 15
  const pageW = doc.internal.pageSize.getWidth()
  const tableW = pageW - margin * 2
  const hasDual = !!df2

  const startY = await addHeader(doc, params, 'BP — Balanço Patrimonial')

  const colDesc = hasDual ? tableW * 0.55 : tableW * 0.65
  const colVal = hasDual ? tableW * 0.225 : tableW * 0.35
  const numCols = hasDual ? 3 : 2

  type CellDef = string | { content: string; colSpan?: number; styles?: object }
  type Row = CellDef[]
  const body: Row[] = []

  for (const g of df1.gruposBP) {
    const label = g.subgrupo.desc_subgrupo
      ? `${g.subgrupo.sigla_subgrupo} — ${g.subgrupo.desc_subgrupo}`
      : g.subgrupo.sigla_subgrupo
    body.push([{ content: label, colSpan: numCols, styles: { fillColor: [210, 215, 235], fontStyle: 'bold', fontSize: 8 } }])

    for (const item of g.itens) {
      if (hasDual) {
        const saldo2 = df2!.gruposBP.flatMap(g2 => g2.itens).find(i => i.id === item.id)?.saldo ?? 0
        body.push([item.desc_bp_dre, fmtPDF(item.saldo), fmtPDF(saldo2)])
      } else {
        body.push([item.desc_bp_dre, fmtPDF(item.saldo)])
      }
    }

    if (isPLSg(g.subgrupo)) {
      if (hasDual) {
        body.push([
          { content: 'Resultado do Período', styles: { textColor: [40, 60, 140], fontStyle: 'italic' } },
          { content: fmtPDF(df1.totalResultado), styles: { textColor: [40, 60, 140], fontStyle: 'italic' } },
          { content: fmtPDF(df2!.totalResultado), styles: { textColor: [40, 60, 140], fontStyle: 'italic' } },
        ])
      } else {
        body.push([
          { content: 'Resultado do Período', styles: { textColor: [40, 60, 140], fontStyle: 'italic' } },
          { content: fmtPDF(df1.totalResultado), styles: { textColor: [40, 60, 140], fontStyle: 'italic' } },
        ])
      }
    }

    const subtotal1 = isPLSg(g.subgrupo) ? g.subtotal + df1.totalResultado : g.subtotal
    const g2 = df2?.gruposBP.find(x => x.subgrupo.id === g.subgrupo.id)
    const subtotal2 = g2 ? (isPLSg(g.subgrupo) ? g2.subtotal + df2!.totalResultado : g2.subtotal) : 0

    if (hasDual) {
      body.push([
        { content: `Subtotal ${g.subgrupo.sigla_subgrupo}`, styles: { fontStyle: 'bold', fillColor: [240, 242, 248] } },
        { content: fmtPDF(subtotal1), styles: { fontStyle: 'bold', fillColor: [240, 242, 248] } },
        { content: fmtPDF(subtotal2), styles: { fontStyle: 'bold', fillColor: [240, 242, 248] } },
      ])
    } else {
      body.push([
        { content: `Subtotal ${g.subgrupo.sigla_subgrupo}`, styles: { fontStyle: 'bold', fillColor: [240, 242, 248] } },
        { content: fmtPDF(subtotal1), styles: { fontStyle: 'bold', fillColor: [240, 242, 248] } },
      ])
    }
  }

  const head = hasDual
    ? [['Descrição', periodoLabel(params.periodo1!), periodoLabel(params.periodo2)]]
    : [['Descrição', periodoLabel(params.periodo2)]]

  const foot: Row[] = []
  if (hasDual) {
    foot.push(
      [
        { content: 'Total Ativo', styles: { fontStyle: 'bold' } },
        { content: fmtPDF(df1.totalAtivo), styles: { fontStyle: 'bold' } },
        { content: fmtPDF(df2!.totalAtivo), styles: { fontStyle: 'bold' } },
      ],
      [
        { content: 'Total Passivo + PL', styles: { fontStyle: 'bold' } },
        { content: fmtPDF(df1.totalPassivoEPL), styles: { fontStyle: 'bold' } },
        { content: fmtPDF(df2!.totalPassivoEPL), styles: { fontStyle: 'bold' } },
      ],
    )
  } else {
    foot.push(
      [
        { content: 'Total Ativo', styles: { fontStyle: 'bold' } },
        { content: fmtPDF(df1.totalAtivo), styles: { fontStyle: 'bold' } },
      ],
      [
        { content: 'Total Passivo + PL', styles: { fontStyle: 'bold' } },
        { content: fmtPDF(df1.totalPassivoEPL), styles: { fontStyle: 'bold' } },
      ],
    )
  }

  const colStyles: Record<number, object> = {
    0: { cellWidth: colDesc },
    1: { cellWidth: colVal, halign: 'right' },
  }
  if (hasDual) colStyles[2] = { cellWidth: colVal, halign: 'right' }

  autoTable(doc, {
    startY,
    head,
    body,
    foot,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 30, 120], textColor: [255, 255, 255], fontStyle: 'bold' },
    footStyles: { fillColor: [220, 230, 255], textColor: [20, 20, 100] },
    columnStyles: colStyles,
  })

  doc.save(`BP_${params.empresa.abreviacao}_${params.periodo2.anoVigencia}.pdf`)
}
