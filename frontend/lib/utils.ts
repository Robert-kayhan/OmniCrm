import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges class names so a caller's utility always beats the component's own.
 * Without twMerge, `<Button className="px-8">` loses to the variant's `px-4`
 * depending on stylesheet order rather than intent.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
