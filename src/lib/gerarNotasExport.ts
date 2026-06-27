import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, VerticalAlign, WidthType, BorderStyle, HeightRule, TableLayoutType } from 'docx'
import { fmtMoeda, isAtivoSg, periodoLabel, type NotaQuadro } from './dfUtils'
import type { DFParams } from './dfData'
import type { TipoNota } from './notasExplicativasData'
import { addHeader } from './gerarDFpdf'
import { buildPageHeader, buildDocxBodyHeader, dataExtenso, cell, downloadBlob } from './gerarDFdocx'
import { addHtmlToPdf, htmlToDocxBlocks, lastAutoTableFinalY } from './richTextExport'

type CellDef = string | { content: string; styles: { fontStyle?: 'bold' | 'normal'; halign?: 'left' | 'center' | 'right' } }


export interface NotaParaImpressao {
  id: number
  numeroNota: number | null
  titulo: string
  tipo: TipoNota
  textoAntes: string
  textoDepois: string
  quadros: NotaQuadro[]
}

/** Espaço de uma linha em branco entre os elementos da nota (título, textos e quadro), em mm. */
const BLANK_LINE = 5

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const NO_BORDERS = {
  top: NO_BORDER,
  bottom: NO_BORDER,
  left: NO_BORDER,
  right: NO_BORDER,
  insideHorizontal: NO_BORDER,
  insideVertical: NO_BORDER,
}

// 0,6cm em twips (1cm = 566,929 twips)
const ROW_HEIGHT = { value: 340, rule: HeightRule.ATLEAST }

// Larguras de coluna fixas em DXA para A4 com margens 2cm (conteúdo = 9638 DXA).
// Garante que todos os quadros de uma mesma nota tenham colunas idênticas.
const TOTAL_DXA  = 9638                                                                       // largura total do conteúdo
const SPACER_DXA = 170                                                                        // 0,30cm
const VAL_DXA    = 1587                                                                       // 2,80cm
const COL_WIDTHS_DUAL   = [TOTAL_DXA - SPACER_DXA - VAL_DXA * 2, VAL_DXA, SPACER_DXA, VAL_DXA] // [6294,1587,170,1587]
const COL_WIDTHS_SINGLE = [TOTAL_DXA - VAL_DXA, VAL_DXA]                                    // [8051,1587]

// Célula espaçadora estreita entre colunas de valores de períodos distintos
function spacerCell(): TableCell {
  return new TableCell({
    width: { size: SPACER_DXA, type: WidthType.DXA },
    borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
    children: [new Paragraph({ text: '' })],
  })
}

// Célula de cabeçalho de data: alinhamento inferior-direito + borda inferior de 1,5pt
function dateHeaderCell(text: string, widthDxa?: number): TableCell {
  return new TableCell({
    width: widthDxa ? { size: widthDxa, type: WidthType.DXA } : undefined,
    verticalAlign: VerticalAlign.BOTTOM,
    borders: {
      top: NO_BORDER,
      left: NO_BORDER,
      right: NO_BORDER,
      bottom: { style: BorderStyle.SINGLE, size: 12, color: '000000' },
    },
    children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text, bold: true, size: 24, font: 'Arial' })],
    })],
  })
}

// Célula de total com borda superior e inferior de 1,5pt
function subtotalCell(text: string, opts: { align?: typeof AlignmentType.RIGHT; widthDxa?: number; italics?: boolean } = {}): TableCell {
  return new TableCell({
    width: opts.widthDxa ? { size: opts.widthDxa, type: WidthType.DXA } : undefined,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 12, color: '000000' },
      bottom: { style: BorderStyle.SINGLE, size: 12, color: '000000' },
      left: NO_BORDER,
      right: NO_BORDER,
    },
    children: [new Paragraph({
      alignment: opts.align,
      children: [new TextRun({ text, bold: !opts.italics, italics: opts.italics, size: 24, font: 'Arial' })],
    })],
  })
}

function tituloNota(nota: NotaParaImpressao): string {
  return nota.numeroNota != null ? `${nota.numeroNota} — ${nota.titulo}` : nota.titulo
}

function fmtLiquido(v: number, fmt: (n: number) => string): string {
  return v < 0 ? `(${fmt(Math.abs(v))})` : fmt(v)
}

function resumoAtivoPassivo(quadros: NotaQuadro[]): { ativoFinal: number; ativoInicial: number; passivoFinal: number; passivoInicial: number } {
  let ativoFinal = 0, ativoInicial = 0, passivoFinal = 0, passivoInicial = 0
  for (const q of quadros) {
    if (isAtivoSg(q.subgrupo)) {
      ativoFinal += q.subtotalFinal
      ativoInicial += q.subtotalInicial ?? 0
    } else {
      passivoFinal += q.subtotalFinal
      passivoInicial += q.subtotalInicial ?? 0
    }
  }
  return { ativoFinal, ativoInicial, passivoFinal, passivoInicial }
}

/** O resumo só faz sentido se houver valores tanto no lado do ATIVO quanto no do PASSIVO. */
function deveExibirResumo(quadros: NotaQuadro[]): boolean {
  const { ativoFinal, ativoInicial, passivoFinal, passivoInicial } = resumoAtivoPassivo(quadros)
  const temAtivo = ativoFinal !== 0 || ativoInicial !== 0
  const temPassivo = passivoFinal !== 0 || passivoInicial !== 0
  return temAtivo && temPassivo
}

// ── PDF ──────────────────────────────────────────────────────────────────

function renderQuadroPdf(doc: jsPDF, quadro: NotaQuadro, params: DFParams, x: number, maxWidth: number, startY: number, fmt: (v: number) => string): number {
  const hasDual = !!params.periodo1
  let y = startY

  const head = hasDual
    ? [['', periodoLabel(params.periodo1!), periodoLabel(params.periodo2)]]
    : [['', periodoLabel(params.periodo2)]]

  const body = quadro.linhas.map(l => hasDual
    ? [l.desc_ne, fmt(l.saldoInicial ?? 0), fmt(l.saldoFinal)]
    : [l.desc_ne, fmt(l.saldoFinal)])

  const foot: CellDef[][] = hasDual
    ? [[
        { content: '', styles: { fontStyle: 'bold' } },
        { content: fmt(quadro.subtotalInicial ?? 0), styles: { fontStyle: 'bold', halign: 'right' } },
        { content: fmt(quadro.subtotalFinal), styles: { fontStyle: 'bold', halign: 'right' } },
      ]]
    : [[
        { content: '', styles: { fontStyle: 'bold' } },
        { content: fmt(quadro.subtotalFinal), styles: { fontStyle: 'bold', halign: 'right' } },
      ]]

  const colStyles: Record<number, object> = hasDual
    ? { 0: { cellWidth: maxWidth * 0.5 }, 1: { cellWidth: maxWidth * 0.25, halign: 'right' as const }, 2: { cellWidth: maxWidth * 0.25, halign: 'right' as const } }
    : { 0: { cellWidth: maxWidth * 0.65 }, 1: { cellWidth: maxWidth * 0.35, halign: 'right' as const } }

  const pageW = doc.internal.pageSize.getWidth()
  autoTable(doc, {
    startY: y,
    head,
    body,
    foot,
    theme: 'plain',
    styles: { fontSize: 12, cellPadding: 1.5 },
    headStyles: { fontStyle: 'bold' },
    columnStyles: colStyles,
    margin: { left: x, right: pageW - x - maxWidth },
  })
  return lastAutoTableFinalY(doc) + 4
}

function renderResumoPdf(doc: jsPDF, quadros: NotaQuadro[], params: DFParams, x: number, maxWidth: number, startY: number, fmt: (v: number) => string): number {
  const hasDual = !!params.periodo1
  const { ativoFinal, ativoInicial, passivoFinal, passivoInicial } = resumoAtivoPassivo(quadros)

  const head = hasDual
    ? [['', periodoLabel(params.periodo1!), periodoLabel(params.periodo2)]]
    : [['', periodoLabel(params.periodo2)]]

  const liquidoFinal = ativoFinal - passivoFinal
  const liquidoInicial = ativoInicial - passivoInicial

  const body = hasDual
    ? [
        [{ content: 'ATIVO', styles: { fontStyle: 'bold' } }, { content: fmt(ativoInicial), styles: { fontStyle: 'bold', halign: 'right' } }, { content: fmt(ativoFinal), styles: { fontStyle: 'bold', halign: 'right' } }],
        [{ content: 'PASSIVO', styles: { fontStyle: 'bold' } }, { content: fmt(passivoInicial), styles: { fontStyle: 'bold', halign: 'right' } }, { content: fmt(passivoFinal), styles: { fontStyle: 'bold', halign: 'right' } }],
        [{ content: 'LÍQUIDO', styles: { fontStyle: 'italic' } }, { content: fmtLiquido(liquidoInicial, fmt), styles: { fontStyle: 'italic', halign: 'right' } }, { content: fmtLiquido(liquidoFinal, fmt), styles: { fontStyle: 'italic', halign: 'right' } }],
      ]
    : [
        [{ content: 'ATIVO', styles: { fontStyle: 'bold' } }, { content: fmt(ativoFinal), styles: { fontStyle: 'bold', halign: 'right' } }],
        [{ content: 'PASSIVO', styles: { fontStyle: 'bold' } }, { content: fmt(passivoFinal), styles: { fontStyle: 'bold', halign: 'right' } }],
        [{ content: 'LÍQUIDO', styles: { fontStyle: 'italic' } }, { content: fmtLiquido(liquidoFinal, fmt), styles: { fontStyle: 'italic', halign: 'right' } }],
      ]

  const colStyles: Record<number, object> = hasDual
    ? { 0: { cellWidth: maxWidth * 0.5 }, 1: { cellWidth: maxWidth * 0.25, halign: 'right' as const }, 2: { cellWidth: maxWidth * 0.25, halign: 'right' as const } }
    : { 0: { cellWidth: maxWidth * 0.65 }, 1: { cellWidth: maxWidth * 0.35, halign: 'right' as const } }

  const pageW = doc.internal.pageSize.getWidth()
  autoTable(doc, {
    startY,
    head,
    body: body as unknown as CellDef[][],
    theme: 'plain',
    styles: { fontSize: 12, cellPadding: 1.5 },
    headStyles: { fontStyle: 'bold' },
    columnStyles: colStyles,
    margin: { left: x, right: pageW - x - maxWidth },
  })
  return lastAutoTableFinalY(doc) + 4
}

export async function gerarNotasPdf(params: DFParams, notas: NotaParaImpressao[], emMilhares = false): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const margin = 15
  const pageW = doc.internal.pageSize.getWidth()
  const maxWidth = pageW - margin * 2
  const fmt = (v: number) => fmtMoeda(emMilhares ? v / 1000 : v, emMilhares ? 0 : 2)

  let first = true
  for (const nota of notas) {
    if (!first) doc.addPage()
    first = false

    let y = await addHeader(doc, params, 'Notas Explicativas')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(20, 20, 20)
    const linhasTitulo = doc.splitTextToSize(tituloNota(nota), maxWidth) as string[]
    for (const linha of linhasTitulo) {
      doc.text(linha, margin, y)
      y += 5.5
    }
    y += BLANK_LINE

    const temTextoAntes = !!nota.textoAntes && nota.textoAntes !== '<p></p>'
    if (temTextoAntes) {
      y = addHtmlToPdf(doc, nota.textoAntes, margin, maxWidth, y, margin)
      y += BLANK_LINE
    }

    if (nota.tipo === 'quadro') {
      for (const quadro of nota.quadros) {
        y = renderQuadroPdf(doc, quadro, params, margin, maxWidth, y, fmt)
      }
      if (deveExibirResumo(nota.quadros)) {
        y = renderResumoPdf(doc, nota.quadros, params, margin, maxWidth, y, fmt)
        y += BLANK_LINE
      }
    }

    const temTextoDepois = !!nota.textoDepois && nota.textoDepois !== '<p></p>'
    if (temTextoDepois) {
      y = addHtmlToPdf(doc, nota.textoDepois, margin, maxWidth, y, margin)
    }
  }

  doc.save(`Notas_Explicativas_${params.empresa.abreviacao}_${params.periodo2.anoVigencia}.pdf`)
}

// ── DOCX ─────────────────────────────────────────────────────────────────

function quadroToDocx(quadro: NotaQuadro, params: DFParams, showLabel = false, fmt: (v: number) => string = fmtMoeda): (Paragraph | Table)[] {
  const hasDual = !!params.periodo1
  const cw = hasDual ? COL_WIDTHS_DUAL : COL_WIDTHS_SINGLE
  // cw[0]=desc, cw[1]=val1, cw[2]=spacer (dual only), cw[3]=val2 (dual only)

  const headCells = hasDual
    ? [
        cell('', { size: 24, font: 'Arial', width: cw[0] }),
        dateHeaderCell(periodoLabel(params.periodo1!), cw[1]),
        spacerCell(),
        dateHeaderCell(periodoLabel(params.periodo2), cw[3]),
      ]
    : [
        cell('', { size: 24, font: 'Arial', width: cw[0] }),
        dateHeaderCell(periodoLabel(params.periodo2), cw[1]),
      ]
  const rows: TableRow[] = [new TableRow({ height: ROW_HEIGHT, children: headCells })]

  for (const linha of quadro.linhas) {
    const cells = hasDual
      ? [
          cell(linha.desc_ne, { size: 24, font: 'Arial', width: cw[0] }),
          cell(fmt(linha.saldoInicial ?? 0), { align: AlignmentType.RIGHT, size: 24, font: 'Arial', width: cw[1] }),
          spacerCell(),
          cell(fmt(linha.saldoFinal), { align: AlignmentType.RIGHT, size: 24, font: 'Arial', width: cw[3] }),
        ]
      : [
          cell(linha.desc_ne, { size: 24, font: 'Arial', width: cw[0] }),
          cell(fmt(linha.saldoFinal), { align: AlignmentType.RIGHT, size: 24, font: 'Arial', width: cw[1] }),
        ]
    rows.push(new TableRow({ height: ROW_HEIGHT, children: cells }))
  }

  const subtotalCells = hasDual
    ? [
        cell('', { size: 24, font: 'Arial', width: cw[0] }),
        subtotalCell(fmt(quadro.subtotalInicial ?? 0), { align: AlignmentType.RIGHT, widthDxa: cw[1] }),
        spacerCell(),
        subtotalCell(fmt(quadro.subtotalFinal), { align: AlignmentType.RIGHT, widthDxa: cw[3] }),
      ]
    : [
        cell('', { size: 24, font: 'Arial', width: cw[0] }),
        subtotalCell(fmt(quadro.subtotalFinal), { align: AlignmentType.RIGHT, widthDxa: cw[1] }),
      ]
  rows.push(new TableRow({ height: ROW_HEIGHT, children: subtotalCells }))

  const result: (Paragraph | Table)[] = []
  if (showLabel) {
    const sg = quadro.subgrupo
    const labelText = sg.desc_subgrupo
      ? `${sg.sigla_subgrupo} — ${sg.desc_subgrupo}`
      : sg.sigla_subgrupo
    result.push(new Paragraph({
      children: [new TextRun({ text: labelText, size: 18, font: 'Arial', color: '888888', italics: true })],
    }))
  }
  result.push(new Table({ width: { size: TOTAL_DXA, type: WidthType.DXA }, layout: TableLayoutType.FIXED, columnWidths: cw, borders: NO_BORDERS, rows, alignment: AlignmentType.RIGHT }))
  result.push(new Paragraph({ text: '' }))
  return result
}

function resumoToDocx(quadros: NotaQuadro[], params: DFParams, fmt: (v: number) => string = fmtMoeda): Table {
  const hasDual = !!params.periodo1
  const cw = hasDual ? COL_WIDTHS_DUAL : COL_WIDTHS_SINGLE
  const { ativoFinal, ativoInicial, passivoFinal, passivoInicial } = resumoAtivoPassivo(quadros)

  const headCells = hasDual
    ? [
        cell('', { size: 24, font: 'Arial', width: cw[0] }),
        dateHeaderCell(periodoLabel(params.periodo1!), cw[1]),
        spacerCell(),
        dateHeaderCell(periodoLabel(params.periodo2), cw[3]),
      ]
    : [
        cell('', { size: 24, font: 'Arial', width: cw[0] }),
        dateHeaderCell(periodoLabel(params.periodo2), cw[1]),
      ]
  const rows: TableRow[] = [new TableRow({ height: ROW_HEIGHT, children: headCells })]

  const ativoCells = hasDual
    ? [
        cell('ATIVO', { bold: true, size: 24, font: 'Arial', width: cw[0] }),
        cell(fmt(ativoInicial), { bold: true, align: AlignmentType.RIGHT, size: 24, font: 'Arial', width: cw[1] }),
        spacerCell(),
        cell(fmt(ativoFinal), { bold: true, align: AlignmentType.RIGHT, size: 24, font: 'Arial', width: cw[3] }),
      ]
    : [
        cell('ATIVO', { bold: true, size: 24, font: 'Arial', width: cw[0] }),
        cell(fmt(ativoFinal), { bold: true, align: AlignmentType.RIGHT, size: 24, font: 'Arial', width: cw[1] }),
      ]
  const passivoCells = hasDual
    ? [
        cell('PASSIVO', { bold: true, size: 24, font: 'Arial', width: cw[0] }),
        cell(fmt(passivoInicial), { bold: true, align: AlignmentType.RIGHT, size: 24, font: 'Arial', width: cw[1] }),
        spacerCell(),
        cell(fmt(passivoFinal), { bold: true, align: AlignmentType.RIGHT, size: 24, font: 'Arial', width: cw[3] }),
      ]
    : [
        cell('PASSIVO', { bold: true, size: 24, font: 'Arial', width: cw[0] }),
        cell(fmt(passivoFinal), { bold: true, align: AlignmentType.RIGHT, size: 24, font: 'Arial', width: cw[1] }),
      ]
  const liquidoFinal = ativoFinal - passivoFinal
  const liquidoInicial = ativoInicial - passivoInicial

  const liquidoCells = hasDual
    ? [
        cell('LÍQUIDO', { italics: true, size: 24, font: 'Arial', width: cw[0] }),
        subtotalCell(fmtLiquido(liquidoInicial, fmt), { align: AlignmentType.RIGHT, widthDxa: cw[1], italics: true }),
        spacerCell(),
        subtotalCell(fmtLiquido(liquidoFinal, fmt), { align: AlignmentType.RIGHT, widthDxa: cw[3], italics: true }),
      ]
    : [
        cell('LÍQUIDO', { italics: true, size: 24, font: 'Arial', width: cw[0] }),
        subtotalCell(fmtLiquido(liquidoFinal, fmt), { align: AlignmentType.RIGHT, widthDxa: cw[1], italics: true }),
      ]

  rows.push(new TableRow({ height: ROW_HEIGHT, children: ativoCells }))
  rows.push(new TableRow({ height: ROW_HEIGHT, children: passivoCells }))
  rows.push(new TableRow({ height: ROW_HEIGHT, children: liquidoCells }))

  return new Table({ width: { size: TOTAL_DXA, type: WidthType.DXA }, layout: TableLayoutType.FIXED, columnWidths: cw, borders: NO_BORDERS, rows, alignment: AlignmentType.RIGHT })
}

export async function gerarNotasDocx(params: DFParams, notas: NotaParaImpressao[], emMilhares = false): Promise<void> {
  const fmt = (v: number) => fmtMoeda(emMilhares ? v / 1000 : v, emMilhares ? 0 : 2)
  const pageHeader = await buildPageHeader(params)
  const tituloNotas = params.periodo1
    ? `Notas Explicativas às Demonstrações Financeiras dos exercícios findos em ${dataExtenso(params.periodo1.mes, params.periodo1.ano)} e ${dataExtenso(params.periodo2.mes, params.periodo2.ano)}`
    : `Notas Explicativas às Demonstrações Financeiras do exercício findo em ${dataExtenso(params.periodo2.mes, params.periodo2.ano)}`
  const children: (Paragraph | Table)[] = buildDocxBodyHeader(params, tituloNotas)

  for (const nota of notas) {
    children.push(new Paragraph({ children: [new TextRun({ text: tituloNota(nota), bold: true, size: 24, font: 'Arial' })] }))
    children.push(new Paragraph({ text: '' }))

    const temTextoAntes = !!nota.textoAntes && nota.textoAntes !== '<p></p>'
    if (temTextoAntes) {
      children.push(...htmlToDocxBlocks(nota.textoAntes))
      children.push(new Paragraph({ text: '' }))
    }

    if (nota.tipo === 'quadro') {
      const multiQuadro = nota.quadros.length > 1
      for (const quadro of nota.quadros) {
        children.push(...quadroToDocx(quadro, params, multiQuadro, fmt))
      }
      if (deveExibirResumo(nota.quadros)) {
        children.push(resumoToDocx(nota.quadros, params, fmt))
        children.push(new Paragraph({ text: '' }))
      }
    }

    const temTextoDepois = !!nota.textoDepois && nota.textoDepois !== '<p></p>'
    if (temTextoDepois) {
      children.push(...htmlToDocxBlocks(nota.textoDepois))
    }

    children.push(new Paragraph({ text: '' }))
  }

  const doc = new Document({ sections: [{ properties: { page: { margin: { top: 1276, bottom: 1276, left: 1134, right: 1134 } } }, headers: pageHeader ? { default: pageHeader } : undefined, children }] })
  const blob = await Packer.toBlob(doc)
  downloadBlob(blob, `Notas_Explicativas_${params.empresa.abreviacao}_${params.periodo2.anoVigencia}.docx`)
}
