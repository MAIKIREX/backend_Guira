import { PdfService } from './src/core/pdf/pdf.service';
import * as fs from 'fs';

async function generateExample() {
  const service = new PdfService();

  const mockOrder = {
    id: 'ORD-9821-ABC',
    status: 'COMPLETED',
    flow_type: 'Transferencia Internacional',
    processing_rail: 'SWIFT',
    amount: 5000,
    currency: 'USD',
    amount_destination: 34500,
    destination_currency: 'BOB',
    exchange_rate_applied: 6.90,
    fee_amount: 15.00,
    destination_address: 'Banco Mercantil SCZ - Cta 4012398401',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    completed_at: new Date().toISOString(),
    metadata: {
      payment_reason: 'Pago a proveedores de servicios digitales',
      delivery_method: 'Abono en Cuenta'
    }
  };

  const mockSupplier = {
    name: 'Tech Solutions Bolivia SRL'
  };

  console.log('Generando PDF...');
  try {
    const buffer = await service.generatePaymentPdf(mockOrder, mockSupplier);
    fs.writeFileSync('ejemplo_guira_comprobante.pdf', buffer);
    console.log('¡PDF generado exitosamente en: ejemplo_guira_comprobante.pdf!');
  } catch (err) {
    console.error('Error:', err);
  }
}

generateExample();
