import { Injectable, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
const pdfmake = require('pdfmake');
import * as fs from 'fs';
import * as path from 'path';

// ── Tipos internos ──────────────────────────────────────────────────────────

interface ClientProfile {
  id: string;
  full_name: string | null;
  email: string;
  phone?: string | null;
}

interface Supplier {
  id: string;
  name: string;
}

interface PaymentOrder {
  id: string;
  created_at: string;
  status: string;
  flow_type?: string;
  supplier_id?: string | null;
  origin_currency?: string;
  currency?: string;
  amount_origin?: number;
  amount?: number;
  destination_currency?: string;
  amount_converted?: number;
  amount_destination?: number;
  fee_total?: number;
  fee_amount?: number;
  exchange_rate_applied?: number;
  [key: string]: unknown;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(isoStr: string): string {
  if (!isoStr) return 'N/D';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return isoStr;
  return d.toLocaleString('es-BO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

const STATUS_LABELS: Record<string, string> = {
  created: 'Orden creada',
  waiting_deposit: 'Esperando depósito',
  deposit_received: 'Depósito validado',
  processing: 'Procesando',
  sent: 'Enviado',
  completed: 'Completado',
  cancelled: 'Cancelado',
  failed: 'Fallido',
  swept_external: 'Swept external',
};

const FLOW_LABELS: Record<string, string> = {
  bolivia_to_world: 'Bolivia → Mundo',
  bolivia_to_wallet: 'Bolivia → Wallet',
  world_to_bolivia: 'Mundo → Bolivia',
  world_to_wallet: 'Mundo → Wallet',
  wallet_to_wallet: 'Wallet → Wallet',
  wallet_to_fiat: 'Wallet → Fiat',
  fiat_bo_to_bridge_wallet: 'Fiat BO → Bridge Wallet',
  crypto_to_bridge_wallet: 'Crypto → Bridge Wallet',
  bridge_wallet_to_fiat_bo: 'Bridge Wallet → Fiat BO',
  bridge_wallet_to_crypto: 'Bridge Wallet → Crypto',
  bridge_wallet_to_fiat_us: 'Bridge Wallet → Fiat US',
};

function buildRows(orders: PaymentOrder[], suppliersMap: Map<string, string>) {
  return orders.map((o) => ({
    id: o.id.slice(0, 8).toUpperCase(),
    fecha: formatDate(o.created_at),
    flujo: FLOW_LABELS[o.flow_type ?? ''] ?? o.flow_type ?? 'N/D',
    estado: STATUS_LABELS[o.status] ?? o.status,
    proveedor: o.supplier_id ? (suppliersMap.get(o.supplier_id) ?? 'N/D') : 'Sin proveedor',
    moneda_origen: (o.origin_currency ?? o.currency ?? '').toUpperCase(),
    monto_origen: o.amount_origin ?? o.amount ?? 0,
    moneda_destino: (o.destination_currency ?? '').toUpperCase(),
    monto_destino: o.amount_converted ?? o.amount_destination ?? 0,
    fee: o.fee_total ?? o.fee_amount ?? 0,
    tipo_cambio: o.exchange_rate_applied ?? 1,
  }));
}

// ── Servicio ──────────────────────────────────────────────────────────────────

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);
  private printer: any;

  constructor() {
    const fonts = {
      Helvetica: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        italics: 'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique',
      },
    };
    this.printer = pdfmake;
    this.printer.setFonts(fonts);
  }

  // ── EXCEL ──────────────────────────────────────────────────────────────────

  async generateExcel(
    orders: PaymentOrder[],
    suppliers: Supplier[],
    client: ClientProfile,
    filters: { status?: string },
  ): Promise<Buffer> {
    const suppliersMap = new Map(suppliers.map((s) => [s.id, s.name]));
    const rows = buildRows(orders, suppliersMap);
    const generatedAt = new Date().toLocaleString('es-BO', { hour12: false });
    const filterLabel = filters.status
      ? (STATUS_LABELS[filters.status] ?? filters.status)
      : 'Todos los estados';

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Guira';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Expedientes', {
      pageSetup: { orientation: 'landscape', fitToPage: true },
    });

    // ── Paleta de colores ──
    const BRAND_DARK   = '1E293B'; // Slate-800
    const BRAND_ACCENT = '3B82F6'; // Blue-500
    const HEADER_BG    = '1E40AF'; // Blue-800
    const HEADER_FG    = 'FFFFFF';
    const ROW_EVEN_BG  = 'F1F5F9'; // Slate-100
    const SECTION_BG   = 'EFF6FF'; // Blue-50
    const META_FG      = '64748B'; // Slate-500

    // ── BLOQUE DE CABECERA DEL REPORTE ──
    sheet.mergeCells('A1:K1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'GUIRA — Reporte de Expedientes';
    titleCell.font = { bold: true, size: 16, color: { argb: BRAND_DARK } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
    sheet.getRow(1).height = 36;

    // ── Datos del cliente ──
    sheet.mergeCells('A2:K2');
    sheet.getCell('A2').value = `Cliente: ${client.full_name ?? 'N/D'}   |   Email: ${client.email}   |   Teléfono: ${client.phone ?? 'N/D'}`;
    sheet.getCell('A2').font = { size: 10, color: { argb: META_FG } };
    sheet.getRow(2).height = 20;

    sheet.mergeCells('A3:K3');
    sheet.getCell('A3').value = `Filtro aplicado: ${filterLabel}   |   Generado: ${generatedAt}   |   Total de expedientes: ${orders.length}`;
    sheet.getCell('A3').font = { size: 9, color: { argb: META_FG }, italic: true };
    sheet.getRow(3).height = 18;

    // Fila vacía separadora
    sheet.getRow(4).height = 6;

    // ── Fila de encabezados de tabla ──
    const HEADERS = [
      { key: 'id',            label: 'ID',                width: 12 },
      { key: 'fecha',         label: 'Fecha',             width: 20 },
      { key: 'flujo',         label: 'Flujo',             width: 26 },
      { key: 'estado',        label: 'Estado',            width: 20 },
      { key: 'proveedor',     label: 'Proveedor',         width: 22 },
      { key: 'moneda_origen', label: 'Moneda Origen',     width: 15 },
      { key: 'monto_origen',  label: 'Monto Origen',      width: 16 },
      { key: 'moneda_destino',label: 'Moneda Destino',    width: 15 },
      { key: 'monto_destino', label: 'Monto Destino',     width: 16 },
      { key: 'fee',           label: 'Fee',               width: 14 },
      { key: 'tipo_cambio',   label: 'Tipo de Cambio',    width: 16 },
    ];

    const headerRow = sheet.getRow(5);
    HEADERS.forEach((h, idx) => {
      const col = idx + 1;
      sheet.getColumn(col).width = h.width;
      const cell = headerRow.getCell(col);
      cell.value = h.label;
      cell.font = { bold: true, color: { argb: HEADER_FG }, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
      cell.border = {
        bottom: { style: 'medium', color: { argb: BRAND_ACCENT } },
      };
    });
    headerRow.height = 24;

    // ── Filas de datos ──
    rows.forEach((row, rowIdx) => {
      const excelRow = sheet.getRow(6 + rowIdx);
      const isEven = rowIdx % 2 === 1;
      const values = [
        row.id,
        row.fecha,
        row.flujo,
        row.estado,
        row.proveedor,
        row.moneda_origen,
        row.monto_origen,
        row.moneda_destino,
        row.monto_destino,
        row.fee,
        row.tipo_cambio,
      ];

      values.forEach((val, colIdx) => {
        const cell = excelRow.getCell(colIdx + 1);
        cell.value = val;
        cell.font = { size: 9, color: { argb: BRAND_DARK } };
        cell.alignment = { vertical: 'middle', horizontal: colIdx === 0 ? 'center' : 'left' };
        if (isEven) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROW_EVEN_BG } };
        }
        // Formato numérico para montos y fee
        if ([6, 8, 9, 10].includes(colIdx)) {
          cell.numFmt = '#,##0.00';
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
        }
      });
      excelRow.height = 18;
    });

    // ── Fila de totales ──
    const totalsRowIdx = 6 + rows.length;
    const totalsRow = sheet.getRow(totalsRowIdx);
    sheet.mergeCells(`A${totalsRowIdx}:F${totalsRowIdx}`);
    totalsRow.getCell(1).value = `Total de registros: ${rows.length}`;
    totalsRow.getCell(1).font = { bold: true, size: 9, color: { argb: BRAND_DARK } };
    totalsRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SECTION_BG } };
    totalsRow.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };

    const sumMonto = rows.reduce((acc, r) => acc + r.monto_origen, 0);
    const sumDest  = rows.reduce((acc, r) => acc + r.monto_destino, 0);
    const sumFee   = rows.reduce((acc, r) => acc + r.fee, 0);

    [7, 9, 10].forEach((colIdx, i) => {
      const cell = totalsRow.getCell(colIdx);
      cell.value = [sumMonto, sumDest, sumFee][i];
      cell.numFmt = '#,##0.00';
      cell.font = { bold: true, size: 9, color: { argb: BRAND_DARK } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SECTION_BG } };
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
      cell.border = { top: { style: 'medium', color: { argb: BRAND_ACCENT } } };
    });
    totalsRow.height = 20;

    // ── Pie de página ──
    sheet.headerFooter.oddFooter = `&LGuira - Operaciones Financieras Seguras&RGenerado: ${generatedAt}`;

    return workbook.xlsx.writeBuffer() as unknown as Buffer;
  }

  // ── PDF ────────────────────────────────────────────────────────────────────

  async generatePdfReport(
    orders: PaymentOrder[],
    suppliers: Supplier[],
    client: ClientProfile,
    filters: { status?: string },
  ): Promise<Buffer> {
    const suppliersMap = new Map(suppliers.map((s) => [s.id, s.name]));
    const rows = buildRows(orders, suppliersMap);
    const generatedAt = new Date().toLocaleString('es-BO', { hour12: false });
    const filterLabel = filters.status
      ? (STATUS_LABELS[filters.status] ?? filters.status)
      : 'Todos los estados';

    const PRIMARY   = '#1e293b';
    const ACCENT    = '#3b82f6';
    const HEADER_BG = '#1e40af';
    const EVEN_BG   = '#f1f5f9';

    // Logo (reutilizando el mismo bloque de pdf.service.ts)
    let logoBlock: any = { text: 'Guira\n', style: 'brandName' };
    try {
      const logoPath = path.join(process.cwd(), 'assets', 'logo.png');
      if (fs.existsSync(logoPath)) {
        const base64 = fs.readFileSync(logoPath).toString('base64');
        logoBlock = { image: `data:image/png;base64,${base64}`, width: 60, margin: [0, 0, 0, 4] };
      }
    } catch {
      this.logger.warn('No se pudo cargar logo para el PDF de reporte');
    }

    const tableBody: any[][] = [
      // Cabecera de tabla
      [
        { text: 'ID',              style: 'th', fillColor: HEADER_BG },
        { text: 'Fecha',           style: 'th', fillColor: HEADER_BG },
        { text: 'Flujo',           style: 'th', fillColor: HEADER_BG },
        { text: 'Estado',          style: 'th', fillColor: HEADER_BG },
        { text: 'Proveedor',       style: 'th', fillColor: HEADER_BG },
        { text: 'Mon. Origen',     style: 'th', fillColor: HEADER_BG },
        { text: 'Monto Origen',    style: 'th', fillColor: HEADER_BG },
        { text: 'Mon. Destino',    style: 'th', fillColor: HEADER_BG },
        { text: 'Monto Destino',   style: 'th', fillColor: HEADER_BG },
        { text: 'Fee',             style: 'th', fillColor: HEADER_BG },
        { text: 'Tipo Cambio',     style: 'th', fillColor: HEADER_BG },
      ],
    ];

    rows.forEach((r, idx) => {
      const bg = idx % 2 === 1 ? EVEN_BG : null;
      const cell = (val: string | number, align = 'left') => ({
        text: String(val),
        style: 'td',
        alignment: align,
        ...(bg ? { fillColor: bg } : {}),
      });
      tableBody.push([
        cell(r.id, 'center'),
        cell(r.fecha),
        cell(r.flujo),
        cell(r.estado),
        cell(r.proveedor),
        cell(r.moneda_origen, 'center'),
        cell(r.monto_origen.toFixed(2), 'right'),
        cell(r.moneda_destino, 'center'),
        cell(r.monto_destino.toFixed(2), 'right'),
        cell(r.fee.toFixed(2), 'right'),
        cell(r.tipo_cambio?.toString() ?? '1', 'right'),
      ]);
    });

    const docDef: any = {
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [30, 50, 30, 50],
      defaultStyle: { font: 'Helvetica', fontSize: 7, color: '#334155' },
      content: [
        // Encabezado
        {
          columns: [
            logoBlock,
            {
              stack: [
                { text: 'REPORTE DE EXPEDIENTES', style: 'reportTitle' },
                { text: `Generado: ${generatedAt}`, style: 'meta' },
                { text: `Filtro: ${filterLabel}`, style: 'meta' },
              ],
              alignment: 'right',
            },
          ],
          margin: [0, 0, 0, 12],
        },
        // Datos del cliente
        {
          table: {
            widths: ['*'],
            body: [[{
              columns: [
                { text: [{ text: 'Cliente: ', bold: true }, client.full_name ?? 'N/D'], width: '*' },
                { text: [{ text: 'Email: ',   bold: true }, client.email],              width: '*' },
                { text: [{ text: 'Teléfono: ',bold: true }, client.phone ?? 'N/D'],     width: '*' },
                { text: [{ text: 'Expedientes: ', bold: true }, String(orders.length)], width: 'auto' },
              ],
              fillColor: '#eff6ff',
              margin: [8, 6, 8, 6],
            }]],
          },
          layout: 'noBorders',
          margin: [0, 0, 0, 14],
        },
        // Tabla de expedientes
        {
          table: {
            headerRows: 1,
            widths: [36, 52, 60, 52, 52, 28, 40, 32, 40, 32, 36],
            body: tableBody,
          },
          layout: {
            hLineWidth: (i: number) => (i === 0 || i === 1 ? 0 : 0.5),
            vLineWidth: () => 0,
            hLineColor: () => '#e2e8f0',
            paddingTop: () => 4,
            paddingBottom: () => 4,
            paddingLeft: () => 4,
            paddingRight: () => 4,
          },
        },
        // Totales
        {
          margin: [0, 8, 0, 0],
          columns: [
            { width: '*', text: '' },
            {
              width: 'auto',
              table: {
                body: [
                  [
                    { text: 'Total Monto Origen:', style: 'totalLabel' },
                    { text: rows.reduce((a, r) => a + r.monto_origen, 0).toFixed(2), style: 'totalValue' },
                  ],
                  [
                    { text: 'Total Monto Destino:', style: 'totalLabel' },
                    { text: rows.reduce((a, r) => a + r.monto_destino, 0).toFixed(2), style: 'totalValue' },
                  ],
                  [
                    { text: 'Total Fee:', style: 'totalLabel' },
                    { text: rows.reduce((a, r) => a + r.fee, 0).toFixed(2), style: 'totalValue' },
                  ],
                ],
              },
              layout: 'noBorders',
            },
          ],
        },
      ],
      footer: (currentPage: number, pageCount: number) => ({
        columns: [
          { text: 'Guira - Operaciones Financieras Seguras', style: 'footer', alignment: 'left' },
          { text: `Página ${currentPage} de ${pageCount}`, style: 'footer', alignment: 'right' },
        ],
        margin: [30, 8, 30, 0],
      }),
      styles: {
        brandName:   { fontSize: 18, bold: true, color: PRIMARY },
        reportTitle: { fontSize: 13, bold: true, color: PRIMARY },
        meta:        { fontSize: 8, color: '#64748b' },
        th: {
          fontSize: 7,
          bold: true,
          color: '#ffffff',
          alignment: 'center',
          margin: [2, 2, 2, 2],
        },
        td:          { fontSize: 7, color: '#1e293b', margin: [2, 2, 2, 2] },
        totalLabel:  { fontSize: 8, bold: true, color: PRIMARY, margin: [0, 2, 12, 2] },
        totalValue:  { fontSize: 8, bold: true, color: ACCENT, alignment: 'right', margin: [0, 2, 0, 2] },
        footer:      { fontSize: 7, color: '#94a3b8' },
      },
    };

    const pdf = this.printer.createPdf(docDef);
    return pdf.getBuffer();
  }
}
