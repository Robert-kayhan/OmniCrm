import { MessagesSquare } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

/**
 * Shown beside the conversation list when nothing is selected. The list lives
 * in the layout, so navigating between threads never remounts it.
 */
export default function InboxIndexPage() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <EmptyState
        icon={MessagesSquare}
        title="No conversation selected"
        description="Pick a conversation from the list to read the thread and reply."
      />
    </div>
  );
}
