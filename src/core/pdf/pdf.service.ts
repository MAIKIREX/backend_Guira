import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
const pdfmake = require('pdfmake');
import { TDocumentDefinitions } from 'pdfmake/interfaces';

// ═══════════════════════════════════════════════════════════
//  Guira "Oceanic Trust" PDF Palette
//  Matches the frontend design system identically.
// ═══════════════════════════════════════════════════════════
const COLORS = {
  navy: '#050036',        // brand dark / headings
  primary: '#0055FF',     // brand blue
  accent: '#00D6FF',      // brand cyan/teal
  white: '#FFFFFF',
  surface: '#F4F6FF',     // light background
  muted: '#6B6E9E',       // muted foreground
  border: '#D5D8EE',      // light border
  borderLight: '#ECEFFE', // very subtle divider
  success: '#1DB87A',
  warning: '#F5A623',
  destructive: '#E84040',
  text: '#050036',        // body text
  textSecondary: '#6B6E9E',
};

// Human-readable labels per flow_type
const FLOW_LABELS: Record<string, string> = {
  fiat_bo_to_bridge_wallet: 'Depósito BOB → Billetera Bridge',
  crypto_to_bridge_wallet: 'Depósito Crypto → Billetera Bridge',
  fiat_us_to_bridge_wallet: 'Depósito USD → Billetera Bridge',
  bridge_wallet_to_fiat_bo: 'Retiro Bridge → Cuenta BOB',
  bridge_wallet_to_fiat_us: 'Retiro Bridge → Cuenta USD',
  bridge_wallet_to_crypto: 'Retiro Bridge → Wallet Crypto',
  bolivia_to_world: 'Bolivia → Exterior',
  bolivia_to_wallet: 'Bolivia → Wallet Crypto',
  wallet_to_wallet: 'Wallet → Wallet (Crypto)',
  world_to_bolivia: 'Exterior → Bolivia',
  va_deposit: 'Depósito Cuenta Virtual',
};

const STATUS_LABELS: Record<string, string> = {
  CREATED: 'Creado',
  PENDING: 'Pendiente',
  WAITING_DEPOSIT: 'Esperando Depósito',
  DEPOSIT_RECEIVED: 'Depósito Validado',
  PROCESSING: 'En Proceso',
  SENT: 'Enviado',
  COMPLETED: 'Completado',
  CANCELLED: 'Cancelado',
  FAILED: 'Fallido',
  REJECTED: 'Rechazado',
  APPROVED: 'Aprobado',
  SWEPT_EXTERNAL: 'Liquidado Externo',
  REFUNDED: 'Reembolsado',
};

@Injectable()
export class PdfService {
  private printer: any;
  private readonly logger = new Logger(PdfService.name);

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

  // ─── Helpers ──────────────────────────────────────────

  private toDisplay(val: any): string {
    return val === null || val === undefined || val === '' ? 'N/D' : String(val);
  }

  private readMeta(meta: any, key: string): string {
    if (!meta || typeof meta !== 'object') return '';
    const val = meta[key];
    return typeof val === 'string' || typeof val === 'number' ? String(val) : '';
  }

  private fmtDate(val: string): string {
    if (!val) return 'N/D';
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return val;
    return d.toLocaleString('es-BO', {
      hour12: true,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private fmtAmount(val: any): string {
    const n = Number(val);
    if (Number.isNaN(n)) return String(val ?? '0.00');
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private statusColor(status: string): string {
    const s = status.toUpperCase();
    if (s === 'COMPLETED' || s === 'APPROVED') return COLORS.success;
    if (s === 'FAILED' || s === 'REJECTED' || s === 'CANCELLED') return COLORS.destructive;
    if (s === 'PENDING' || s === 'WAITING_DEPOSIT') return COLORS.warning;
    if (s === 'PROCESSING' || s === 'SENT') return COLORS.primary;
    return COLORS.muted;
  }

  private loadLogo(): any {
    try {
      const logoPath = path.join(process.cwd(), 'assets', 'LOGO GUIRRA CON LETRA VERTICAL.svg');
      if (fs.existsSync(logoPath)) {
        return { svg: fs.readFileSync(logoPath, 'utf-8'), width: 60, alignment: 'left' as const };
      }
    } catch (err) {
      this.logger.warn('No se pudo cargar el logo para el PDF', err);
    }
    return { text: 'GUIRA', style: 'brandFallback' };
  }

  /** Builds a label → value row for the detail table */
  private row(label: string, value: string, opts?: { color?: string }): any[] {
    return [
      { text: label, style: 'tLabel' },
      { text: value, style: 'tValue', color: opts?.color ?? COLORS.text },
    ];
  }

  /** Horizontal divider line */
  private divider(width = 515): any {
    return {
      canvas: [{ type: 'line', x1: 0, y1: 0, x2: width, y2: 0, lineWidth: 0.75, lineColor: COLORS.border }],
      margin: [0, 0, 0, 0],
    };
  }

  // ─── Origin details (per service) ─────────────────────

  private buildOriginRows(order: any, metadata: any, clientWallet: any): any[][] {
    const originCcy = (order.origin_currency ?? order.currency ?? '').toUpperCase();
    const rows: any[][] = [
      this.row('Monto Origen', `${this.fmtAmount(order.amount_origin ?? order.amount)} ${originCcy}`),
      this.row('Comisión', `${this.fmtAmount(order.fee_total ?? order.fee_amount)} ${originCcy}`),
      this.row('Tipo de Cambio', this.toDisplay(order.exchange_rate_applied)),
    ];

    const ft = order.flow_type;

    // Off-ramp flows: show source wallet
    if (['bridge_wallet_to_fiat_bo', 'bridge_wallet_to_fiat_us', 'bridge_wallet_to_crypto'].includes(ft)) {
      rows.push(
        this.row('Billetera Origen', this.toDisplay(clientWallet?.address)),
        this.row('Red Origen', this.toDisplay(clientWallet?.network)),
      );
    }

    // Crypto on-ramp: show source network/currency from metadata
    if (ft === 'crypto_to_bridge_wallet') {
      rows.push(
        this.row('Red de Depósito', this.toDisplay(this.readMeta(metadata, 'source_network') || order.origin_currency)),
      );
    }

    // Wallet-to-wallet: show source wallet info
    if (ft === 'wallet_to_wallet') {
      rows.push(
        this.row('Red Origen', this.toDisplay(clientWallet?.network ?? this.readMeta(metadata, 'source_network'))),
        this.row('Billetera Origen', this.toDisplay(clientWallet?.address)),
      );
    }

    return rows;
  }

  // ─── Destination details (per service) ────────────────

  private buildDestinationRows(order: any, metadata: any, supplier: any, clientWallet: any): any[][] {
    const rows: any[][] = [];
    const ft = order.flow_type;

    // Purpose (common to all)
    const purpose = order.business_purpose ?? this.readMeta(metadata, 'payment_reason');
    if (purpose) rows.push(this.row('Propósito', this.toDisplay(purpose)));

    // Delivery method (common)
    const delivery = this.readMeta(metadata, 'delivery_method');
    if (delivery) rows.push(this.row('Método de Entrega', delivery));

    // ── bolivia_to_world ─────────────────────────────────
    if (ft === 'bolivia_to_world') {
      rows.push(this.row('Proveedor', this.toDisplay(supplier?.name ?? 'No asignado')));
      const ext = supplier?.external_accounts?.find((a: any) => a.id === order.external_account_id);
      if (ext) {
        rows.push(
          this.row('Banco Destino', this.toDisplay(ext.bank_name)),
          this.row('Cuenta Destino', this.toDisplay(ext.account_number)),
          this.row('Titular', this.toDisplay(ext.account_holder_name)),
        );
      } else {
        rows.push(this.row('Dirección Destino', this.toDisplay(order.destination_address ?? this.readMeta(metadata, 'destination_address'))));
      }
    }

    // ── world_to_bolivia ─────────────────────────────────
    // FIX H1: was falling to generic else — now explicit
    else if (ft === 'world_to_bolivia') {
      rows.push(this.row('Proveedor', this.toDisplay(supplier?.name ?? 'No asignado')));
      const ext = supplier?.external_accounts?.find((a: any) => a.id === order.external_account_id);
      if (ext) {
        rows.push(
          this.row('Banco Destino', this.toDisplay(ext.bank_name)),
          this.row('Cuenta Destino', this.toDisplay(ext.account_number)),
          this.row('Titular', this.toDisplay(ext.account_holder_name)),
        );
      } else {
        // Fallback: try metadata or supplier bank_details for BOB destination
        const bankName = supplier?.bank_details?.bank_name ?? this.readMeta(metadata, 'destination_bank');
        const acctNum = supplier?.bank_details?.account_number ?? this.readMeta(metadata, 'destination_account');
        if (bankName || acctNum) {
          rows.push(
            this.row('Banco Destino', this.toDisplay(bankName)),
            this.row('Cuenta Destino', this.toDisplay(acctNum)),
          );
        } else {
          rows.push(this.row('Dirección Destino', this.toDisplay(order.destination_address ?? this.readMeta(metadata, 'destination_address'))));
        }
      }
    }

    // ── bolivia_to_wallet / wallet_to_wallet ─────────────
    else if (['bolivia_to_wallet', 'wallet_to_wallet'].includes(ft)) {
      rows.push(
        this.row('Proveedor', this.toDisplay(supplier?.name ?? 'No asignado')),
        this.row('Wallet Destino', this.toDisplay(supplier?.bank_details?.wallet_address ?? order.destination_address)),
        this.row('Red Destino', this.toDisplay(supplier?.bank_details?.wallet_network)),
        this.row('Moneda Destino', this.toDisplay(supplier?.bank_details?.wallet_currency ?? order.destination_currency)),
      );
    }

    // ── On-ramps: fiat/crypto → bridge_wallet ────────────
    else if (['fiat_bo_to_bridge_wallet', 'fiat_us_to_bridge_wallet', 'crypto_to_bridge_wallet'].includes(ft)) {
      rows.push(
        this.row('Billetera Destino', this.toDisplay(clientWallet?.address)),
        this.row('Red Destino', this.toDisplay(clientWallet?.network)),
      );
    }

    // ── bridge_wallet_to_fiat_bo ─────────────────────────
    // FIX H2a: was falling to generic else — now shows BOB bank details
    else if (ft === 'bridge_wallet_to_fiat_bo') {
      const bankName = this.readMeta(metadata, 'destination_bank') || this.readMeta(metadata, 'bank_name');
      const acctNum = order.destination_address ?? this.readMeta(metadata, 'destination_account') ?? this.readMeta(metadata, 'account_number');
      const holder = this.readMeta(metadata, 'account_holder') || this.readMeta(metadata, 'beneficiary_name');
      rows.push(
        this.row('Banco Destino', this.toDisplay(bankName)),
        this.row('Cuenta Destino', this.toDisplay(acctNum)),
      );
      if (holder) rows.push(this.row('Titular', holder));
      rows.push(this.row('Moneda Destino', this.toDisplay(order.destination_currency ?? 'BOB')));
    }

    // ── bridge_wallet_to_fiat_us ─────────────────────────
    // FIX H2b: was falling to generic else — now shows USD bank details
    else if (ft === 'bridge_wallet_to_fiat_us') {
      const bankName = this.readMeta(metadata, 'destination_bank') || this.readMeta(metadata, 'bank_name');
      const acctNum = order.destination_address ?? this.readMeta(metadata, 'destination_account') ?? this.readMeta(metadata, 'account_number');
      const routing = this.readMeta(metadata, 'routing_number');
      const holder = this.readMeta(metadata, 'account_holder') || this.readMeta(metadata, 'beneficiary_name');
      rows.push(
        this.row('Banco Destino', this.toDisplay(bankName)),
        this.row('Cuenta Destino', this.toDisplay(acctNum)),
      );
      if (routing) rows.push(this.row('Routing Number', routing));
      if (holder) rows.push(this.row('Titular', holder));
      rows.push(this.row('Moneda Destino', this.toDisplay(order.destination_currency ?? 'USD')));
    }

    // ── bridge_wallet_to_crypto ──────────────────────────
    // FIX H2c: was falling to generic else — now shows crypto destination
    else if (ft === 'bridge_wallet_to_crypto') {
      const destAddr = order.destination_address ?? this.readMeta(metadata, 'destination_address');
      const destNet = this.readMeta(metadata, 'destination_network') || this.readMeta(metadata, 'dest_network');
      rows.push(
        this.row('Wallet Destino', this.toDisplay(destAddr)),
        this.row('Red Destino', this.toDisplay(destNet)),
        this.row('Moneda Destino', this.toDisplay(order.destination_currency)),
      );
    }

    // ── Generic fallback ─────────────────────────────────
    else {
      rows.push(
        this.row('Dirección Destino', this.toDisplay(order.destination_address ?? this.readMeta(metadata, 'destination_address'))),
      );
      if (order.destination_currency) {
        rows.push(this.row('Moneda Destino', order.destination_currency.toUpperCase()));
      }
    }

    return rows;
  }

  // ─── Stablecoin resolution ────────────────────────────

  private resolveStablecoin(order: any, metadata: any): string {
    const fromMeta = this.readMeta(metadata, 'stablecoin');
    if (fromMeta) return fromMeta;
    if ([
      'crypto_to_bridge_wallet', 'bridge_wallet_to_crypto',
      'wallet_to_wallet', 'bolivia_to_wallet',
      'fiat_bo_to_bridge_wallet', 'fiat_us_to_bridge_wallet',
    ].includes(order.flow_type)) {
      return order.destination_currency ?? order.currency ?? 'N/D';
    }
    return 'N/D';
  }

  // ─── Table layout helper ──────────────────────────────

  private cleanTableLayout(): any {
    return {
      hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length ? 0 : 0.5),
      vLineWidth: () => 0,
      hLineColor: () => COLORS.borderLight,
      paddingLeft: () => 8,
      paddingRight: () => 8,
      paddingTop: () => 7,
      paddingBottom: () => 7,
    };
  }

  // ─── Merge two 2-col row arrays into 4-col rows ───────

  private mergeColumns(left: any[][], right: any[][]): any[][] {
    const maxLen = Math.max(left.length, right.length);
    const merged: any[][] = [];
    const empty = { text: '', style: 'tLabel' };
    for (let i = 0; i < maxLen; i++) {
      const l = left[i] ?? [empty, empty];
      const r = right[i] ?? [empty, empty];
      merged.push([l[0], l[1], r[0], r[1]]);
    }
    return merged;
  }

  // ═══════════════════════════════════════════════════════
  //  MAIN PDF GENERATION
  // ═══════════════════════════════════════════════════════

  async generatePaymentPdf(
    order: any,
    supplier: any | null,
    client?: any,
    clientWallet?: any,
  ): Promise<Buffer> {
    try {
      const metadata = order.metadata ?? {};
      const ft = order.flow_type ?? order.order_type ?? 'N/D';
      const destCcy = (order.destination_currency ?? order.currency ?? '').toUpperCase();
      const amountDest = order.amount_converted ?? order.amount_destination ?? 0;
      const statusUpper = this.toDisplay(order.status).toUpperCase();
      const statusLabel = STATUS_LABELS[statusUpper] ?? statusUpper;
      const flowLabel = FLOW_LABELS[ft] ?? ft.toUpperCase();
      const stColor = this.statusColor(statusUpper);
      const logo = this.loadLogo();

      const completedAtFb = this.readMeta(metadata, 'completed_at');
      const completedRender = order.completed_at
        ? this.fmtDate(order.completed_at)
        : completedAtFb
          ? this.fmtDate(completedAtFb)
          : 'Pendiente';

      const stablecoin = this.resolveStablecoin(order, metadata);
      const rail = order.flow_category ?? order.processing_rail ?? 'N/D';
      const originRows = this.buildOriginRows(order, metadata, clientWallet);
      const destRows = this.buildDestinationRows(order, metadata, supplier, clientWallet);

      // ── Traceability rows ──
      const traceRows: any[][] = [
        this.row('Categoría', this.toDisplay(rail)),
        this.row('Stablecoin', this.toDisplay(stablecoin)),
        this.row('Ref. Proveedor', this.toDisplay(order.provider_reference ?? this.readMeta(metadata, 'reference'))),
        this.row('Completado', completedRender),
      ];
      const failReason = order.failure_reason ?? this.readMeta(metadata, 'rejection_reason');
      if (failReason) {
        traceRows.push(this.row('Motivo Rechazo', this.toDisplay(failReason), { color: COLORS.destructive }));
      }

      // ── Build document ────────────────────────────────

      // Formal bordered-table layout for sections
      const borderedLayout = {
        hLineWidth: (i: number, node: any) => 0.6,
        vLineWidth: (i: number, node: any) => (i === 0 || i === node.table.widths.length ? 0.6 : 0),
        hLineColor: () => COLORS.border,
        vLineColor: () => COLORS.border,
        paddingLeft: () => 10,
        paddingRight: () => 10,
        paddingTop: () => 6,
        paddingBottom: () => 6,
      };

      // Section header row (navy bg, white text, spans full table)
      const sectionHeader = (title: string, cols: number) => {
        const cells: any[] = [{ text: title, style: 'sectionHeader', colSpan: cols }];
        for (let i = 1; i < cols; i++) cells.push({});
        return cells;
      };

      // ── Client table ──
      const clientTable = {
        table: {
          headerRows: 1,
          widths: ['25%', '25%', '25%', '25%'],
          body: [
            sectionHeader('DATOS DEL CLIENTE', 4),
            [
              { text: 'Nombre / Razón Social', style: 'cellLabel' },
              { text: this.toDisplay(client?.full_name), style: 'cellValue', colSpan: 3 },
              {}, {},
            ],
            [
              { text: 'Correo Electrónico', style: 'cellLabel' },
              { text: this.toDisplay(client?.email), style: 'cellValue' },
              { text: 'Teléfono', style: 'cellLabel' },
              { text: this.toDisplay(client?.phone), style: 'cellValue' },
            ],
          ],
        },
        layout: borderedLayout,
        margin: [0, 0, 0, 14] as [number, number, number, number],
      };

      // ── Origin / Destination side-by-side ──
      const operationTable = {
        table: {
          headerRows: 1,
          widths: ['25%', '25%', '25%', '25%'],
          body: [
            sectionHeader('DETALLES DE LA OPERACIÓN', 4),
            // Sub-headers
            [
              { text: 'ORIGEN', style: 'subHeader', colSpan: 2 }, {},
              { text: 'DESTINO', style: 'subHeader', colSpan: 2 }, {},
            ],
            // Merge origin and destination rows side by side
            ...this.mergeColumns(originRows, destRows),
          ],
        },
        layout: {
          ...borderedLayout,
          // Add a subtle vertical line between origin and destination
          vLineWidth: (i: number, node: any) => {
            if (i === 0 || i === node.table.widths.length) return 0.6;
            if (i === 2) return 0.4; // center divider
            return 0;
          },
          vLineColor: (i: number) => i === 2 ? COLORS.borderLight : COLORS.border,
        },
        margin: [0, 0, 0, 14] as [number, number, number, number],
      };

      // ── Traceability table ──
      const traceTable = {
        table: {
          headerRows: 1,
          widths: ['30%', '70%'],
          body: [
            sectionHeader('TRAZABILIDAD Y REFERENCIAS', 2),
            ...traceRows,
          ],
        },
        layout: borderedLayout,
        margin: [0, 0, 0, 20] as [number, number, number, number],
      };

      const docDefinition: TDocumentDefinitions = {
        pageSize: 'A4',
        pageMargins: [36, 36, 36, 60],
        defaultStyle: { font: 'Helvetica', fontSize: 9, color: COLORS.text },

        content: [
          // ═══ HEADER BAND (navy) ═══
          {
            table: {
              widths: ['*'],
              body: [[
                {
                  columns: [
                    { ...logo, margin: [0, 2, 0, 0] },
                    {
                      stack: [
                        { text: 'COMPROBANTE DE TRANSACCIÓN', style: 'headerTitle' },
                        { text: flowLabel, style: 'headerSubtitle', margin: [0, 3, 0, 0] },
                      ],
                      alignment: 'right' as const,
                    },
                  ],
                  fillColor: COLORS.navy,
                  margin: [20, 16, 20, 16],
                },
              ]],
            },
            layout: 'noBorders',
            margin: [0, 0, 0, 0],
          },

          // ═══ ACCENT STRIPE (thin teal line) ═══
          {
            canvas: [{ type: 'rect', x: 0, y: 0, w: 523, h: 3, color: COLORS.accent }],
            margin: [0, 0, 0, 14],
          },

          // ═══ META ROW — bordered cells ═══
          {
            table: {
              widths: ['40%', '30%', '30%'],
              body: [[
                {
                  stack: [
                    { text: 'N° DE OPERACIÓN', style: 'metaLabel' },
                    { text: order.id ?? 'N/D', style: 'metaId' },
                  ],
                  margin: [8, 6, 8, 6],
                },
                {
                  stack: [
                    { text: 'FECHA DE EMISIÓN', style: 'metaLabel' },
                    { text: this.fmtDate(order.created_at), style: 'metaValue' },
                  ],
                  margin: [8, 6, 8, 6],
                },
                {
                  stack: [
                    { text: 'ESTADO', style: 'metaLabel' },
                    { text: statusLabel, style: 'metaValue', color: stColor, bold: true, fontSize: 11 },
                  ],
                  margin: [8, 6, 8, 6],
                  alignment: 'right' as const,
                },
              ]],
            },
            layout: {
              hLineWidth: () => 0.5,
              vLineWidth: (i: number, node: any) => (i === 0 || i === node.table.widths.length ? 0.5 : 0.3),
              hLineColor: () => COLORS.border,
              vLineColor: () => COLORS.border,
            },
            margin: [0, 0, 0, 14],
          },

          // ═══ AMOUNT PANEL ═══
          {
            table: {
              widths: ['*'],
              body: [[
                {
                  columns: [
                    {
                      stack: [
                        { text: 'MONTO ACREDITADO', style: 'amountLabel' },
                        { text: `${this.fmtAmount(amountDest)} ${destCcy}`, style: 'amountValue' },
                      ],
                      width: '*',
                    },
                    {
                      stack: [
                        { text: 'TIPO DE SERVICIO', style: 'amountLabel' },
                        { text: flowLabel, style: 'amountType' },
                      ],
                      width: 'auto',
                      alignment: 'right' as const,
                    },
                  ],
                  fillColor: COLORS.surface,
                  margin: [16, 12, 16, 12],
                },
              ]],
            },
            layout: {
              hLineWidth: () => 0.6,
              vLineWidth: () => 0.6,
              hLineColor: () => COLORS.border,
              vLineColor: () => COLORS.border,
            },
            margin: [0, 0, 0, 16],
          },

          // ═══ SECTION TABLES ═══
          clientTable,
          operationTable,
          traceTable,

          // ═══ ACCENT BOTTOM LINE ═══
          {
            canvas: [{ type: 'rect', x: 0, y: 0, w: 523, h: 2, color: COLORS.accent }],
            margin: [0, 0, 0, 12],
          },

          // ═══ LEGAL DISCLAIMER ═══
          {
            text: [
              { text: 'Aviso Legal: ', bold: true },
              'Este comprobante es generado de forma automática por la plataforma Guira y constituye un registro ',
              'operativo de la transacción aquí descrita. No sustituye documentación fiscal, tributaria ni contable ',
              'requerida por las autoridades competentes. La información contenida es confidencial y de uso exclusivo ',
              'del titular de la cuenta. Ante cualquier discrepancia, comuníquese con soporte@guira.com.',
            ],
            style: 'disclaimer',
            alignment: 'justify' as const,
          },
        ],

        // ═══ FOOTER ═══
        footer: (currentPage, pageCount) => ({
          columns: [
            {
              stack: [
                { text: 'Guira — Plataforma de Operaciones Financieras', style: 'footerBrand' },
                { text: 'www.guira.com  |  soporte@guira.com', style: 'footerContact' },
              ],
              alignment: 'left' as const,
            },
            {
              text: `Página ${currentPage} de ${pageCount}`,
              style: 'footerPage',
              alignment: 'right' as const,
            },
          ],
          margin: [36, 0, 36, 0],
        }),

        // ═══ STYLES ═══
        styles: {
          // Header
          brandFallback: { fontSize: 20, bold: true, color: COLORS.white },
          headerTitle: { fontSize: 14, bold: true, color: COLORS.white, characterSpacing: 1.2 },
          headerSubtitle: { fontSize: 9, color: COLORS.accent, characterSpacing: 0.3 },

          // Meta cells
          metaLabel: { fontSize: 7.5, bold: true, color: COLORS.muted, characterSpacing: 0.8, margin: [0, 0, 0, 3] },
          metaId: { fontSize: 7.5, color: COLORS.text, characterSpacing: 0.2 },
          metaValue: { fontSize: 9.5, color: COLORS.text },

          // Amount panel
          amountLabel: { fontSize: 7.5, bold: true, color: COLORS.muted, characterSpacing: 0.8, margin: [0, 0, 0, 4] },
          amountValue: { fontSize: 20, bold: true, color: COLORS.navy },
          amountType: { fontSize: 9, color: COLORS.primary, bold: true, margin: [0, 4, 0, 0] },

          // Section tables
          sectionHeader: { fontSize: 9, bold: true, color: COLORS.white, fillColor: COLORS.navy, characterSpacing: 1 },
          subHeader: { fontSize: 8, bold: true, color: COLORS.primary, characterSpacing: 0.6, margin: [0, 2, 0, 2] },
          cellLabel: { fontSize: 8, color: COLORS.muted },
          cellValue: { fontSize: 9, color: COLORS.text, bold: true },

          // Detail tables (origin, dest, trace)
          tLabel: { fontSize: 8.5, color: COLORS.muted },
          tValue: { fontSize: 9, color: COLORS.text, bold: true },

          // Legal / Footer
          disclaimer: { fontSize: 7, color: COLORS.muted, lineHeight: 1.4, margin: [0, 0, 0, 0] },
          footerBrand: { fontSize: 7.5, bold: true, color: COLORS.navy },
          footerContact: { fontSize: 7, color: COLORS.muted, margin: [0, 1, 0, 0] },
          footerPage: { fontSize: 7.5, color: COLORS.muted },
        },
      };

      const pdf = this.printer.createPdf(docDefinition);
      return await pdf.getBuffer();
    } catch (error) {
      this.logger.error('Error generando PDF', error);
      throw error;
    }
  }
}
