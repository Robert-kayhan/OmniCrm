'use client';

import * as React from 'react';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cn } from '@/lib/utils';
import { initials } from '@/lib/format';

export function Avatar({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        'relative flex size-9 shrink-0 overflow-hidden rounded-full bg-muted',
        className,
      )}
      {...props}
    />
  );
}

export function AvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image className={cn('aspect-square size-full object-cover', className)} {...props} />
  );
}

export function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      className={cn(
        'flex size-full items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

/**
 * The avatar used everywhere a person appears.
 *
 * `delayMs` on the fallback stops initials from flashing before a cached image
 * paints, which otherwise makes every list look like it is loading twice.
 */
export function UserAvatar({
  name,
  src,
  className,
}: {
  name: string | null | undefined;
  src?: string | null;
  className?: string;
}) {
  return (
    <Avatar className={className}>
      {src ? <AvatarImage src={src} alt={name ?? ''} /> : null}
      <AvatarFallback delayMs={src ? 300 : 0}>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
