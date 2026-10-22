import { ImageResponse } from 'next/og';
import { site } from '@/lib/site';

// The preview card shown when any page is shared on social or in chat apps.
export const alt = `${site.name}: ${site.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 80,
          background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
          color: 'white',
        }}
      >
        <div style={{ fontSize: 36, fontWeight: 600, opacity: 0.85 }}>{site.name}</div>
        <div style={{ marginTop: 24, fontSize: 72, fontWeight: 700, lineHeight: 1.1, maxWidth: 900 }}>
          {site.tagline}
        </div>
        <div style={{ marginTop: 32, fontSize: 30, opacity: 0.85 }}>
          Facebook Messenger · Instagram Direct · one shared inbox
        </div>
      </div>
    ),
    size,
  );
}
