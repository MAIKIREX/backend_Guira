import { Injectable } from '@nestjs/common';
const PdfPrinter = require('pdfmake');
import { TDocumentDefinitions } from 'pdfmake/interfaces';

@Injectable()
export class PdfService {
  private printer: any;

  constructor() {
    // Usaremos las fuentes estándar de PDF (Standard 14 Fonts) para no requerir archivos TTF externos.
    const fonts = {
      Helvetica: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        italics: 'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique',
      },
    };
    this.printer = new PdfPrinter(fonts);
  }

  generatePaymentPdf(order: any, supplier: any | null): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const metadata = order.metadata ?? {};

        const orderType = order.flow_type ?? order.order_type ?? 'N/D';
        const rail = order.flow_category ?? order.processing_rail ?? 'N/D';
        const amountOrigin = order.amount_origin ?? order.amount ?? 0;
        const originCurrency = order.origin_currency ?? order.currency ?? '';
        const amountDest = order.amount_converted ?? order.amount_destination ?? 0;
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
          return date.toLocaleString('es-BO');
        };

        const completedAtFallback = readString(metadata, 'completed_at');
        const completedRender = order.completed_at
          ? formatDateTime(order.completed_at)
          : completedAtFallback
          ? formatDateTime(completedAtFallback)
          : 'N/D';

        const docDefinition: TDocumentDefinitions = {
          defaultStyle: {
            font: 'Helvetica',
            fontSize: 10,
          },
          content: [
            {
              text: 'COMPROBANTE OPERATIVO',
              style: 'header',
              alignment: 'center',
              margin: [0, 0, 0, 20],
            },
            {
              text: 'Detalles de la Orden',
              style: 'subheader',
              margin: [0, 0, 0, 10],
            },
            {
              layout: 'lightHorizontalLines',
              table: {
                headerRows: 1,
                widths: ['35%', '65%'],
                body: [
                  [{ text: 'Campo', style: 'tableHeader' }, { text: 'Valor', style: 'tableHeader' }],
                  ['Expediente', toDisplayValue(order.id)],
                  ['Estado', toDisplayValue(order.status)],
                  ['Tipo', toDisplayValue(orderType)],
                  ['Rail', toDisplayValue(rail)],
                  ['Monto origen', `${amountOrigin} ${originCurrency}`],
                  ['Monto destino', `${amountDest} ${destCurrency}`],
                  ['Tipo de cambio', toDisplayValue(order.exchange_rate_applied)],
                  ['Fee total', toDisplayValue(fee)],
                  ['Propósito', toDisplayValue(order.business_purpose ?? readString(metadata, 'payment_reason'))],
                  ['Método entrega', toDisplayValue(readString(metadata, 'delivery_method'))],
                  ['Dirección destino', toDisplayValue(order.destination_address ?? readString(metadata, 'destination_address'))],
                  ['Stablecoin', toDisplayValue(readString(metadata, 'stablecoin'))],
                  ['Proveedor', toDisplayValue(supplier?.name ?? 'No asignado')],
                  ['Referencia', toDisplayValue(order.provider_reference ?? readString(metadata, 'reference'))],
                  ['Motivo rechazo', toDisplayValue(order.failure_reason ?? readString(metadata, 'rejection_reason'))],
                  ['Creado', formatDateTime(order.created_at)],
                  ['Actualizado', formatDateTime(order.updated_at)],
                  ['Completado', completedRender],
                ],
              },
            },
          ],
          styles: {
            header: {
              fontSize: 18,
              bold: true,
              color: '#333333',
            },
            subheader: {
              fontSize: 14,
              bold: true,
              color: '#555555',
            },
            tableHeader: {
              bold: true,
              fontSize: 10,
              color: '#000000',
            },
          },
        };

        const pdfDoc = this.printer.createPdfKitDocument(docDefinition);
        const chunks: any[] = [];

        pdfDoc.on('data', (chunk) => {
          chunks.push(chunk);
        });

        pdfDoc.on('end', () => {
          resolve(Buffer.concat(chunks));
        });

        pdfDoc.on('error', (err) => {
          reject(err);
        });

        pdfDoc.end();
      } catch (error) {
        reject(error);
      }
    });
  }
}
