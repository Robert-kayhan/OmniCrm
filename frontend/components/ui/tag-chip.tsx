import { X } from 'lucide-react';
import type { Tag } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * A tag rendered in its own colour.
 *
 * The colour is user-chosen and arbitrary, so the label sits on a translucent
 * wash of it rather than on the raw colour — a dark tag with dark text would
 * otherwise be unreadable.
 */
export function TagChip({
  tag,
  onRemove,
  className,
}: {
  tag: Tag;
  onRemove?: () => void;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        className,
      )}
      style={{ backgroundColor: `${tag.color}1f`, color: tag.color }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: tag.color }} aria-hidden />
      {tag.name}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 rounded-full opacity-60 transition-opacity hover:opacity-100"
          aria-label={`Remove tag ${tag.name}`}
        >
          <X className="size-3" />
        </button>
      ) : null}
    </span>
  );
}
