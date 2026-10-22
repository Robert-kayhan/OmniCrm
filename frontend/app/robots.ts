import type { MetadataRoute } from 'next';
import { site } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // The product itself: auth-gated, per-tenant, and worthless to a crawler.
      disallow: ['/login', '/inbox', '/customers', '/analytics', '/settings'],
    },
    sitemap: `${site.url}/sitemap.xml`,
    host: site.url,
  };
}
