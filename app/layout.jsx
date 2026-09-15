import { Analytics } from '@vercel/analytics/next';
import site from '../.generated/site.json';
export const metadata = {
  metadataBase: new URL('https://flytris.net'),
  title: 'FlyTris — Play Tetris against a fly brain',
  description: 'Challenge a fly-inspired neural circuit to a two-minute Tetris match. Play, watch its wired 3D fly, and compare human and fly scores.',
  alternates: { canonical: '/' },
  icons: { icon: '/favicon.ico' },
  openGraph: { title: 'FlyTris — You vs. a fly brain', description: 'Two minutes. One tiny opponent. Play Tetris against a fly-inspired neural circuit.', url: '/', siteName: 'FlyTris', type: 'website', images: [{ url: '/social-preview.png', width: 968, height: 904, alt: 'FlyTris: a wired fly playing Tetris on a handheld console' }] },
  twitter: { card: 'summary_large_image', creator: '@radekvechet', images: [{ url: '/social-preview.png', alt: 'FlyTris: a wired fly playing Tetris on a handheld console' }] },
};
export default function RootLayout({ children }) {
  return <html lang="en"><head><link rel="stylesheet" href={site.style} /></head><body>{children}{process.env.NODE_ENV === 'production' && <Analytics />}</body></html>;
}
