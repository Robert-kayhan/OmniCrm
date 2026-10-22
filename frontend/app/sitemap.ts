import type { MetadataRoute } from 'next';
import { site } from '@/lib/site';

/** Public pages only — everything behind sign-in is excluded in robots.ts. */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: site.url, lastModified, changeFrequency: 'weekly', priority: 1 },
    { url: `${site.url}/about`, lastModified, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${site.url}/contact`, lastModified, changeFrequency: 'yearly', priority: 0.7 },
  ];
}
