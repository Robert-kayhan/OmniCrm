import { Module } from '@nestjs/common';
import { AssignmentLedgerService } from './assignment-ledger.service';

@Module({
  providers: [AssignmentLedgerService],
  exports: [AssignmentLedgerService],
})
export class AssignmentLedgerModule {}
