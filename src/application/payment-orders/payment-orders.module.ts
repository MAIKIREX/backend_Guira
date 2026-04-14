import { Module } from '@nestjs/common';
import {
  PaymentOrdersController,
  AdminPaymentOrdersController,
} from './payment-orders.controller';
import { PaymentOrdersService } from './payment-orders.service';
import { FeesModule } from '../fees/fees.module';
import { PsavModule } from '../psav/psav.module';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';
import { BridgeModule } from '../bridge/bridge.module';
import { ClientBankAccountsModule } from '../client-bank-accounts/client-bank-accounts.module';

@Module({
  imports: [FeesModule, PsavModule, ExchangeRatesModule, BridgeModule, ClientBankAccountsModule],
  controllers: [PaymentOrdersController, AdminPaymentOrdersController],
  providers: [PaymentOrdersService],
  exports: [PaymentOrdersService],
})
export class PaymentOrdersModule {}
