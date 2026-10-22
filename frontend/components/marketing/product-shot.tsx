import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * A real screenshot of the product, swapped for its dark-mode capture when the
 * page is in dark mode. Files live in /public/marketing as `<name>-light.jpg`
 * and `<name>-dark.jpg`; recapture both whenever the inbox UI changes.
 */
export function ProductShot({
  name,
  alt,
  width,
  height,
  priority = false,
  sizes,
  className,
  imageClassName,
}: {
  name: 'inbox' | 'thread' | 'profile';
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
  sizes: string;
  className?: string;
  imageClassName?: string;
}) {
  const shared = { width, height, sizes, quality: 85 };
  return (
    <div className={className}>
      <Image
        {...shared}
        src={`/marketing/${name}-light.jpg`}
        alt={alt}
        priority={priority}
        className={cn('dark:hidden', imageClassName)}
      />
      <Image
        {...shared}
        src={`/marketing/${name}-dark.jpg`}
        alt={alt}
        className={cn('hidden dark:block', imageClassName)}
      />
    </div>
  );
}
