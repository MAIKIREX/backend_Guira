import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
const pdfmake = require('pdfmake');
import { TDocumentDefinitions } from 'pdfmake/interfaces';

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

  async generatePaymentPdf(
    order: any,
    supplier: any | null,
    client?: any,
    clientWallet?: any,
  ): Promise<Buffer> {
    try {
      const metadata = order.metadata ?? {};

      const orderType = order.flow_type ?? order.order_type ?? 'N/D';
      const rail = order.flow_category ?? order.processing_rail ?? 'N/D';
      const amountOrigin = order.amount_origin ?? order.amount ?? 0;
      const originCurrency = order.origin_currency ?? order.currency ?? '';
      const amountDest =
        order.amount_converted ?? order.amount_destination ?? 0;
      const destCurrency = order.destination_currency ?? order.currency ?? '';
      const fee = order.fee_total ?? order.fee_amount ?? 0;

      const toDisplayValue = (val: any) =>
        val === null || val === undefined || val === '' ? 'N/D' : String(val);

      const readString = (meta: any, key: string) => {
        if (!meta || typeof meta !== 'object') return '';
        const val = meta[key];
        return typeof val === 'string' || typeof val === 'number'
          ? String(val)
          : '';
      };

      const formatDateTime = (val: string) => {
        if (!val) return 'N/D';
        const date = new Date(val);
        if (Number.isNaN(date.getTime())) return val;
        return date.toLocaleString('es-BO', {
          hour12: true,
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      };

      const completedAtFallback = readString(metadata, 'completed_at');
      const completedRender = order.completed_at
        ? formatDateTime(order.completed_at)
        : completedAtFallback
          ? formatDateTime(completedAtFallback)
          : 'Pendiente';

      let stablecoin = readString(metadata, 'stablecoin');
      if (!stablecoin) {
        if (
          [
            'crypto_to_bridge_wallet',
            'bridge_wallet_to_crypto',
            'wallet_to_wallet',
            'bolivia_to_wallet',
          ].includes(order.flow_type)
        ) {
          stablecoin = order.destination_currency ?? order.currency ?? 'N/D';
        } else {
          stablecoin = 'N/D';
        }
      }

      // Load logo if exists
      let logoBlock: any = {
        text: 'Guira\n',
        style: 'brandName',
        alignment: 'left',
      };
      try {
        const logoPath = path.join(process.cwd(), 'assets', 'logo.png');
        if (fs.existsSync(logoPath)) {
          const logoBase64 = fs.readFileSync(logoPath).toString('base64');
          logoBlock = {
            image: `data:image/png;base64,${logoBase64}`,
            width: 70,
            alignment: 'left',
            margin: [0, 0, 0, 10],
          };
        }
      } catch (err) {
        this.logger.warn('No se pudo cargar el logo para el PDF', err);
      }

      // Definir color principal y estado
      const primaryColor = '#1e293b'; // Slate-800
      const accentColor = '#3b82f6'; // Blue-500

      let statusColor = '#64748b'; // default slate-500
      const statusUpper = toDisplayValue(order.status).toUpperCase();
      if (statusUpper === 'COMPLETED' || statusUpper === 'APPROVED')
        statusColor = '#10b981'; // emerland-500
      if (statusUpper === 'FAILED' || statusUpper === 'REJECTED' || statusUpper === 'CANCELLED')
        statusColor = '#ef4444'; // red-500
      if (statusUpper === 'PENDING') statusColor = '#f59e0b'; // amber-500

      let originDetails: any[] = [
        { text: 'DATOS DE ORIGEN', style: 'groupTitle' },
        { text: 'Monto Original:', style: 'label' },
        { text: `${amountOrigin} ${originCurrency.toUpperCase()}`, style: 'value' },
        { text: 'Tarifa (Fee):', style: 'label' },
        { text: `${fee} ${originCurrency.toUpperCase()}`, style: 'value' },
        { text: 'Tipo de Cambio Aplicado:', style: 'label' },
        { text: toDisplayValue(order.exchange_rate_applied), style: 'value' },
        { text: 'Tipo de Operación:', style: 'label' },
        { text: orderType.toUpperCase(), style: 'value' }
      ];

      if (['bridge_wallet_to_fiat_bo', 'bridge_wallet_to_fiat_us', 'bridge_wallet_to_crypto', 'wallet_to_fiat'].includes(order.flow_type)) {
        originDetails.push(
          { text: 'Billetera de Origen:', style: 'label' },
          { text: toDisplayValue(clientWallet?.address), style: 'value' },
          { text: 'Red de Origen:', style: 'label' },
          { text: toDisplayValue(clientWallet?.network), style: 'value' }
        );
      }

      let destinationDetails: any[] = [
        { text: 'DATOS DE DESTINO', style: 'groupTitle' },
        { text: 'Propósito:', style: 'label' },
        { text: toDisplayValue(order.business_purpose ?? readString(metadata, 'payment_reason')), style: 'value' }
      ];

      const deliveryMethod = readString(metadata, 'delivery_method');
      if (deliveryMethod) {
        destinationDetails.push(
          { text: 'Método de Entrega:', style: 'label' },
          { text: toDisplayValue(deliveryMethod), style: 'value' }
        );
      }

      if (order.flow_type === 'bolivia_to_world') {
        destinationDetails.push(
          { text: 'Proveedor Asignado:', style: 'label' },
          { text: toDisplayValue(supplier?.name ?? 'No asignado'), style: 'value' }
        );
        const extAccount = supplier?.external_accounts?.find((acc: any) => acc.id === order.external_account_id);
        if (extAccount) {
          destinationDetails.push(
             { text: 'Banco Destino:', style: 'label' },
             { text: toDisplayValue(extAccount.bank_name), style: 'value' },
             { text: 'Cuenta Destino:', style: 'label' },
             { text: toDisplayValue(extAccount.account_number), style: 'value' }
          );
        } else {
          destinationDetails.push(
             { text: 'Dirección Destino / Cuenta:', style: 'label' },
             { text: toDisplayValue(order.destination_address ?? readString(metadata, 'destination_address')), style: 'value' }
          );
        }
      } else if (['bolivia_to_wallet', 'wallet_to_wallet'].includes(order.flow_type)) {
        destinationDetails.push(
          { text: 'Proveedor Asignado:', style: 'label' },
          { text: toDisplayValue(supplier?.name ?? 'No asignado'), style: 'value' },
          { text: 'Dirección de Destino:', style: 'label' },
          { text: toDisplayValue(supplier?.bank_details?.wallet_address ?? order.destination_address), style: 'value' },
          { text: 'Red de Destino:', style: 'label' },
          { text: toDisplayValue(supplier?.bank_details?.wallet_network), style: 'value' }
        );
      } else if (['fiat_bo_to_bridge_wallet', 'fiat_us_to_bridge_wallet', 'crypto_to_bridge_wallet'].includes(order.flow_type)) {
        destinationDetails.push(
          { text: 'Billetera de Destino:', style: 'label' },
          { text: toDisplayValue(clientWallet?.address), style: 'value' },
          { text: 'Red de Destino:', style: 'label' },
          { text: toDisplayValue(clientWallet?.network), style: 'value' }
        );
      } else {
        destinationDetails.push(
          { text: 'Dirección Destino / Cuenta:', style: 'label' },
          { text: toDisplayValue(order.destination_address ?? readString(metadata, 'destination_address')), style: 'value' }
        );
      }

      const docDefinition: TDocumentDefinitions = {
        pageSize: 'A4',
        pageMargins: [40, 60, 40, 60],
        defaultStyle: {
          font: 'Helvetica',
          fontSize: 10,
          color: '#334155',
        },
        content: [
          // HEADER (Logo + Company info / Receipt info)
          {
            columns: [
              logoBlock,
              {
                text: [
                  { text: 'COMPROBANTE DE TRANSACCIÓN\n', style: 'docTitle' },
                  {
                    text: `ID: ${toDisplayValue(order.id)}\n`,
                    style: 'docMeta',
                  },
                  {
                    text: `Fecha: ${formatDateTime(order.created_at)}`,
                    style: 'docMeta',
                  },
                ],
                alignment: 'right',
              },
            ],
            margin: [0, 0, 0, 30],
          },

          // STATUS & AMOUNT BANNER
          {
            table: {
              widths: ['*'],
              body: [
                [
                  {
                    columns: [
                      {
                        width: '*',
                        text: [
                          {
                            text: 'MONTO TRANSFERIDO\n',
                            style: 'sectionLabel',
                            color: '#94a3b8',
                          },
                          {
                            text: `${amountDest} ${destCurrency.toUpperCase()}`,
                            style: 'mainAmount',
                          },
                        ],
                      },
                      {
                        width: 'auto',
                        text: statusUpper,
                        style: 'statusBadge',
                        color: statusColor,
                        alignment: 'right',
                        margin: [0, 10, 0, 0],
                      },
                    ],
                    fillColor: '#f8fafc',
                    margin: [20, 20, 20, 20],
                  },
                ],
              ],
            },
            layout: 'noBorders',
            margin: [0, 0, 0, 20],
          },

          {
            text: 'Datos del Cliente',
            style: 'sectionTitle',
            margin: [0, 15, 0, 10],
          },
          {
            canvas: [
              {
                type: 'line',
                x1: 0,
                y1: 0,
                x2: 515,
                y2: 0,
                lineWidth: 1,
                lineColor: '#e2e8f0',
              },
            ],
            margin: [0, 0, 0, 15],
          },
          {
            columns: [
              {
                width: '50%',
                stack: [
                  { text: 'Nombre / Razón Social:', style: 'label' },
                  { text: toDisplayValue(client?.full_name), style: 'value' },
                ],
              },
              {
                width: '50%',
                stack: [
                  { text: 'Correo Electrónico:', style: 'label' },
                  { text: toDisplayValue(client?.email), style: 'value' },
                  { text: 'Teléfono:', style: 'label' },
                  { text: toDisplayValue(client?.phone), style: 'value' },
                ],
              },
            ],
            columnGap: 20,
            margin: [0, 0, 0, 20],
          },

          {
            text: 'Detalles de la Operación',
            style: 'sectionTitle',
            margin: [0, 15, 0, 10],
          },
          {
            canvas: [
              {
                type: 'line',
                x1: 0,
                y1: 0,
                x2: 515,
                y2: 0,
                lineWidth: 1,
                lineColor: '#e2e8f0',
              },
            ],
            margin: [0, 0, 0, 15],
          },

          // INFORMATION COLUMNS
          {
            columns: [
              // Columna Izquierda (Origen)
              {
                width: '50%',
                stack: originDetails,
              },
              // Columna Derecha (Destino)
              {
                width: '50%',
                stack: destinationDetails,
              },
            ],
            columnGap: 20,
            margin: [0, 0, 0, 20],
          },

          {
            text: 'Trazabilidad y Referencias',
            style: 'sectionTitle',
            margin: [0, 15, 0, 10],
          },
          {
            canvas: [
              {
                type: 'line',
                x1: 0,
                y1: 0,
                x2: 515,
                y2: 0,
                lineWidth: 1,
                lineColor: '#e2e8f0',
              },
            ],
            margin: [0, 0, 0, 15],
          },

          {
            layout: {
              hLineWidth: function (i, node) {
                return i === 0 || i === node.table.body.length ? 0 : 1;
              },
              vLineWidth: function (i, node) {
                return 0;
              },
              hLineColor: function (i, node) {
                return '#f1f5f9';
              },
              paddingLeft: function (i, node) {
                return 0;
              },
              paddingRight: function (i, node) {
                return 0;
              },
              paddingTop: function (i, node) {
                return 8;
              },
              paddingBottom: function (i, node) {
                return 8;
              },
            },
            table: {
              headerRows: 0,
              widths: ['30%', '70%'],
              body: [
                [
                  { text: 'Red de Procesamiento (Rail)', style: 'label' },
                  { text: toDisplayValue(rail), style: 'value' },
                ],
                [
                  { text: 'Stablecoin de Ref.', style: 'label' },
                  {
                    text: toDisplayValue(stablecoin),
                    style: 'value',
                  },
                ],
                [
                  { text: 'Referencia Proveedor', style: 'label' },
                  {
                    text: toDisplayValue(
                      order.provider_reference ??
                        readString(metadata, 'reference'),
                    ),
                    style: 'value',
                  },
                ],
                [
                  { text: 'Motivo Rechazo', style: 'label' },
                  {
                    text: toDisplayValue(
                      order.failure_reason ??
                        readString(metadata, 'rejection_reason'),
                    ),
                    color: '#ef4444',
                    style: 'value',
                  },
                ],
                [
                  { text: 'Fecha de Completado', style: 'label' },
                  { text: completedRender, style: 'value' },
                ],
              ],
            },
          },
        ],
        footer: function (currentPage, pageCount) {
          return {
            columns: [
              {
                text: 'Guira - Operaciones Financieras Seguras',
                style: 'footerText',
                alignment: 'left',
              },
              {
                text: `Página ${currentPage} de ${pageCount}`,
                style: 'footerText',
                alignment: 'right',
              },
            ],
            margin: [40, 10, 40, 0],
          };
        },
        styles: {
          brandName: {
            fontSize: 24,
            bold: true,
            color: primaryColor,
          },
          docTitle: {
            fontSize: 16,
            bold: true,
            color: primaryColor,
          },
          docMeta: {
            fontSize: 10,
            color: '#64748b',
          },
          sectionLabel: {
            fontSize: 9,
            bold: true,
            characterSpacing: 1,
          },
          mainAmount: {
            fontSize: 24,
            bold: true,
            color: primaryColor,
          },
          statusBadge: {
            fontSize: 14,
            bold: true,
          },
          sectionTitle: {
            fontSize: 12,
            bold: true,
            color: accentColor,
            characterSpacing: 0.5,
          },
          groupTitle: {
            fontSize: 10,
            bold: true,
            color: primaryColor,
            margin: [0, 0, 0, 10],
          },
          label: {
            fontSize: 9,
            color: '#64748b',
            margin: [0, 0, 0, 2],
          },
          value: {
            fontSize: 10,
            color: '#0f172a',
            margin: [0, 0, 0, 10],
            bold: true,
          },
          footerText: {
            fontSize: 8,
            color: '#94a3b8',
          },
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
