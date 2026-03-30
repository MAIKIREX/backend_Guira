import { Module } from '@nestjs/common';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { BridgeCustomerService } from './bridge-customer.service';

@Module({
  controllers: [OnboardingController],
  providers: [OnboardingService, BridgeCustomerService],
  exports: [OnboardingService, BridgeCustomerService],
})
export class OnboardingModule {}
