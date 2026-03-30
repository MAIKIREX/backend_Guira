import { Module } from '@nestjs/common';
import { WalletsController, AdminWalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';

@Module({
  controllers: [WalletsController, AdminWalletsController],
  providers: [WalletsService],
  exports: [WalletsService],
})
export class WalletsModule {}
