import {
  Document,
  Header,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  ImageRun,
  WidthType,
  AlignmentType,
  ShadingType,
  BorderStyle,
} from 'docx'
import { isPLSg, fmtMoeda, periodoLabel, type CalcDFResult } from './dfUtils'
import type { DFParams } from './dfData'
import { getLogoUrl } from './logoUtils'

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

async function loadArrayBuffer(url: string): Promise<ArrayBuffer> {
  const resp = await fetch(url)
  return resp.arrayBuffer()
}

const MESES_PT = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']

export function dataExtenso(mes: number, ano: number): string {
  const ultimoDia = new Date(ano, mes, 0).getDate()
  return `${ultimoDia} de ${MESES_PT[mes - 1]} de ${ano}`
}

export async function buildPageHeader(params: DFParams): Promise<Header | undefined> {
  const logoUrl = getLogoUrl(params.empresa.nome_logo)
  if (!logoUrl) return undefined
  const imgData = await loadArrayBuffer(logoUrl)
  return new Header({
    children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new ImageRun({ type: 'png', data: imgData, transformation: { width: 148, height: 56 } })],
    })],
  })
}

export function buildDocxBodyHeader(params: DFParams, titulo: string, emMilhares = false): Paragraph[] {
  const notaValores = emMilhares ? '(valores expressos em R$ mil)' : '(valores expressos em R$)'
  return [
    new Paragraph({
      children: [new TextRun({ text: params.empresa.razao_social.toUpperCase(), bold: true, size: 24, font: 'Arial' })],
    }),
    new Paragraph({
      alignment: AlignmentType.BOTH,
      children: [new TextRun({ text: titulo, bold: true, size: 22, font: 'Arial' })],
    }),
    new Paragraph({
      alignment: AlignmentType.BOTH,
      children: [new TextRun({ text: notaValores, size: 22, font: 'Arial' })],
    }),
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' } },
      children: [],
    }),
    new Paragraph({ text: '' }),
  ]
}

export function cell(text: string, opts: { bold?: boolean; align?: typeof AlignmentType.RIGHT; shading?: string; italics?: boolean; color?: string; colSpan?: number; size?: number; font?: string } = {}): TableCell {
  return new TableCell({
    columnSpan: opts.colSpan,
    shading: opts.shading ? { type: ShadingType.SOLID, color: opts.shading, fill: opts.shading } : undefined,
    children: [new Paragraph({
      alignment: opts.align,
      children: [new TextRun({ text, bold: opts.bold, italics: opts.italics, color: opts.color, size: opts.size ?? 18, font: opts.font })],
    })],
  })
}

function headerRow(cols: string[]): TableRow {
  return new TableRow({
    children: cols.map(c => cell(c, { bold: true, shading: '1E1E78', color: 'FFFFFF', align: cols.indexOf(c) > 0 ? AlignmentType.RIGHT : undefined })),
  })
}

export async function gerarDREdocx(params: DFParams, df1: CalcDFResult, df2?: CalcDFResult, emMilhares = false): Promise<void> {
  const hasDual = !!df2
  const tituloDRE = params.periodo1
    ? `Demonstração do Resultado dos exercícios findos em ${dataExtenso(params.periodo1.mes, params.periodo1.ano)} e ${dataExtenso(params.periodo2.mes, params.periodo2.ano)}`
    : `Demonstração do Resultado do exercício findo em ${dataExtenso(params.periodo2.mes, params.periodo2.ano)}`
  const bodyHeader = buildDocxBodyHeader(params, tituloDRE, emMilhares)
  const pageHeader = await buildPageHeader(params)

  const F = 'Arial'
  const S = 24 // 12pt em half-points
  const fmt = (v: number) => fmtMoeda(emMilhares ? v / 1000 : v, 0)

  // Estrutura: [Descrição | Nota Explicativa | spacer | período1 | (spacer | período2 — só hasDual)]
  const hdrChildren = [
    cell('Descrição', { bold: true, shading: '1E1E78', color: 'FFFFFF', font: F, size: S }),
    cell('Nota Explicativa', { bold: true, shading: '1E1E78', color: 'FFFFFF', font: F, size: 18 }),
    cell('', { shading: '1E1E78', font: F, size: S }),
    cell(hasDual ? periodoLabel(params.periodo1!) : periodoLabel(params.periodo2), { bold: true, shading: '1E1E78', color: 'FFFFFF', align: AlignmentType.RIGHT, font: F, size: S }),
    ...(hasDual ? [
      cell('', { shading: '1E1E78', font: F, size: S }),
      cell(periodoLabel(params.periodo2), { bold: true, shading: '1E1E78', color: 'FFFFFF', align: AlignmentType.RIGHT, font: F, size: S }),
    ] : []),
  ]
  const rows: TableRow[] = [new TableRow({ children: hdrChildren })]

  for (const g of df1.gruposResultado) {
    for (const item of g.itens) {
      const saldo2 = hasDual ? (df2!.gruposResultado.flatMap(g2 => g2.itens).find(i => i.id === item.id)?.saldo ?? 0) : 0
      if (item.saldo === 0 && saldo2 === 0) continue

      const rowChildren = [
        cell(item.desc_bp_dre, { font: F, size: S }),
        cell('', { font: F, size: S }),
        cell('', { font: F, size: S }),
        cell(fmt(item.saldo), { align: AlignmentType.RIGHT, font: F, size: S }),
        ...(hasDual ? [
          cell('', { font: F, size: S }),
          cell(fmt(saldo2), { align: AlignmentType.RIGHT, font: F, size: S }),
        ] : []),
      ]
      rows.push(new TableRow({ children: rowChildren }))
    }
  }

  const totalChildren = [
    cell('RESULTADO', { bold: true, shading: 'DCE6FF', font: F, size: S }),
    cell('', { shading: 'DCE6FF', font: F, size: S }),
    cell('', { shading: 'DCE6FF', font: F, size: S }),
    cell(fmt(df1.totalResultado), { bold: true, shading: 'DCE6FF', align: AlignmentType.RIGHT, font: F, size: S }),
    ...(hasDual ? [
      cell('', { shading: 'DCE6FF', font: F, size: S }),
      cell(fmt(df2!.totalResultado), { bold: true, shading: 'DCE6FF', align: AlignmentType.RIGHT, font: F, size: S }),
    ] : []),
  ]
  rows.push(new TableRow({ children: totalChildren }))

  // Larguras em twips — área útil A4: 11906 - 2×1134 = 9638
  // NE=2,0cm(1134), spacer=0,3cm(170), valor=3,3cm(1871), sep=0,3cm(170)
  const colWidths: number[] = hasDual
    ? [4422, 1134, 170, 1871, 170, 1871]  // soma = 9638
    : [6463, 1134, 170, 1871]              // soma = 9638

  const table = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: colWidths, rows })

  const doc = new Document({ sections: [{ properties: { page: { margin: { top: 1276, bottom: 1276, left: 1134, right: 1134 } } }, headers: pageHeader ? { default: pageHeader } : undefined, children: [...bodyHeader, table] }] })
  const blob = await Packer.toBlob(doc)
  downloadBlob(blob, `DRE_${params.empresa.abreviacao}_${params.periodo2.anoVigencia}.docx`)
}

export async function gerarBPdocx(params: DFParams, df1: CalcDFResult, df2?: CalcDFResult, emMilhares = false): Promise<void> {
  const hasDual = !!df2
  const numCols = hasDual ? 3 : 2
  const tituloBP = params.periodo1
    ? `Balanço Patrimonial em ${dataExtenso(params.periodo1.mes, params.periodo1.ano)} e ${dataExtenso(params.periodo2.mes, params.periodo2.ano)}`
    : `Balanço Patrimonial em ${dataExtenso(params.periodo2.mes, params.periodo2.ano)}`
  const header = buildDocxBodyHeader(params, tituloBP, emMilhares)
  const pageHeader = await buildPageHeader(params)
  const fmt = (v: number) => fmtMoeda(emMilhares ? v / 1000 : v, 0)

  const head = hasDual
    ? [periodoLabel(params.periodo1!), periodoLabel(params.periodo2)]
    : [periodoLabel(params.periodo2)]

  const rows: TableRow[] = [headerRow(['Descrição', ...head])]

  for (const g of df1.gruposBP) {
    const label = g.subgrupo.desc_subgrupo
      ? `${g.subgrupo.sigla_subgrupo} — ${g.subgrupo.desc_subgrupo}`
      : g.subgrupo.sigla_subgrupo
    rows.push(new TableRow({ children: [cell(label, { bold: true, shading: 'D2D7EB', colSpan: numCols })] }))

    for (const item of g.itens) {
      if (hasDual) {
        const saldo2 = df2!.gruposBP.flatMap(g2 => g2.itens).find(i => i.id === item.id)?.saldo ?? 0
        rows.push(new TableRow({ children: [cell(item.desc_bp_dre), cell(fmt(item.saldo), { align: AlignmentType.RIGHT }), cell(fmt(saldo2), { align: AlignmentType.RIGHT })] }))
      } else {
        rows.push(new TableRow({ children: [cell(item.desc_bp_dre), cell(fmt(item.saldo), { align: AlignmentType.RIGHT })] }))
      }
    }

    if (isPLSg(g.subgrupo)) {
      const resultCells = hasDual
        ? [cell('Resultado do Período', { italics: true, color: '283C8C' }), cell(fmt(df1.totalResultado), { italics: true, color: '283C8C', align: AlignmentType.RIGHT }), cell(fmt(df2!.totalResultado), { italics: true, color: '283C8C', align: AlignmentType.RIGHT })]
        : [cell('Resultado do Período', { italics: true, color: '283C8C' }), cell(fmt(df1.totalResultado), { italics: true, color: '283C8C', align: AlignmentType.RIGHT })]
      rows.push(new TableRow({ children: resultCells }))
    }

    const subtotal1 = isPLSg(g.subgrupo) ? g.subtotal + df1.totalResultado : g.subtotal
    const g2 = df2?.gruposBP.find(x => x.subgrupo.id === g.subgrupo.id)
    const subtotal2 = g2 ? (isPLSg(g.subgrupo) ? g2.subtotal + df2!.totalResultado : g2.subtotal) : 0

    const subtotalCells = hasDual
      ? [cell(`Subtotal ${g.subgrupo.sigla_subgrupo}`, { bold: true, shading: 'F0F2F8' }), cell(fmt(subtotal1), { bold: true, shading: 'F0F2F8', align: AlignmentType.RIGHT }), cell(fmt(subtotal2), { bold: true, shading: 'F0F2F8', align: AlignmentType.RIGHT })]
      : [cell(`Subtotal ${g.subgrupo.sigla_subgrupo}`, { bold: true, shading: 'F0F2F8' }), cell(fmt(subtotal1), { bold: true, shading: 'F0F2F8', align: AlignmentType.RIGHT })]
    rows.push(new TableRow({ children: subtotalCells }))
  }

  const totalAtivoCells = hasDual
    ? [cell('Total Ativo', { bold: true }), cell(fmt(df1.totalAtivo), { bold: true, align: AlignmentType.RIGHT }), cell(fmt(df2!.totalAtivo), { bold: true, align: AlignmentType.RIGHT })]
    : [cell('Total Ativo', { bold: true }), cell(fmt(df1.totalAtivo), { bold: true, align: AlignmentType.RIGHT })]
  const totalPassivoCells = hasDual
    ? [cell('Total Passivo + PL', { bold: true }), cell(fmt(df1.totalPassivoEPL), { bold: true, align: AlignmentType.RIGHT }), cell(fmt(df2!.totalPassivoEPL), { bold: true, align: AlignmentType.RIGHT })]
    : [cell('Total Passivo + PL', { bold: true }), cell(fmt(df1.totalPassivoEPL), { bold: true, align: AlignmentType.RIGHT })]
  rows.push(new TableRow({ children: totalAtivoCells }))
  rows.push(new TableRow({ children: totalPassivoCells }))

  const table = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows })

  const doc = new Document({ sections: [{ properties: { page: { margin: { top: 1276, bottom: 1276, left: 1134, right: 1134 } } }, headers: pageHeader ? { default: pageHeader } : undefined, children: [...header, table] }] })
  const blob = await Packer.toBlob(doc)
  downloadBlob(blob, `BP_${params.empresa.abreviacao}_${params.periodo2.anoVigencia}.docx`)
}
