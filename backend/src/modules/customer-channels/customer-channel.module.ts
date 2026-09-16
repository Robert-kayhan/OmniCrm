import { Module } from '@nestjs/common';
import { CustomerModule } from '../customers/customer.module';
import { CustomerChannelController } from './customer-channel.controller';
import { CustomerChannelService } from './customer-channel.service';

@Module({
  imports: [CustomerModule],
  controllers: [CustomerChannelController],
  providers: [CustomerChannelService],
  exports: [CustomerChannelService],
})
export class CustomerChannelModule {}
