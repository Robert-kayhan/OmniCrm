import { Module } from '@nestjs/common';
import { TagModule } from '../tags/tag.module';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';

@Module({
  // TagModule, because attaching a tag to a customer must first prove the tag
  // belongs to the caller's organization.
  imports: [TagModule],
  controllers: [CustomerController],
  providers: [CustomerService],
  exports: [CustomerService],
})
export class CustomerModule {}
