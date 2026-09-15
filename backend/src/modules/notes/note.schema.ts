import { z } from 'zod';
import { pageQuerySchema } from '../../utils/pagination';

export const listNotesQuerySchema = pageQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const createNoteSchema = z.object({
  /**
   * Kept as raw text and never rendered as HTML by the client, so the note body
   * needs no sanitiser — only a length bound.
   */
  content: z.string().trim().min(1, 'Note cannot be empty').max(5000),
});

export type ListNotesQuery = z.infer<typeof listNotesQuerySchema>;
export type CreateNoteInput = z.infer<typeof createNoteSchema>;
