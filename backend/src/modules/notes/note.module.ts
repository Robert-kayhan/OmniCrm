import { Module } from '@nestjs/common';
import { ConversationModule } from '../conversations/conversation.module';
import { CustomerModule } from '../customers/customer.module';
import {
  ConversationNoteController,
  CustomerNoteController,
  NoteController,
} from './note.controller';
import { NoteService } from './note.service';

@Module({
  imports: [CustomerModule, ConversationModule],
  controllers: [NoteController, CustomerNoteController, ConversationNoteController],
  providers: [NoteService],
  exports: [NoteService],
})
export class NoteModule {}
