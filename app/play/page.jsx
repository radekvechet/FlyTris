import Home from '../page';
import { metadata as siteMetadata } from '../layout';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Play against the fly — FlyTris',
  alternates: { canonical: '/play' },
  openGraph: { ...siteMetadata.openGraph, title: 'Play against the fly — FlyTris', url: '/play' },
};
export default function Play() { return <Home gamePage />; }
