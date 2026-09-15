import { headers } from 'next/headers';
import Script from 'next/script';
import site from '../.generated/site.json';

export const dynamic = 'force-dynamic';
export default async function Home({ gamePage = false }) {
  const nonce = (await headers()).get('x-nonce');
  return <>
    <div data-flytris-route={gamePage ? 'play' : 'dashboard'} dangerouslySetInnerHTML={{ __html: gamePage ? site.markup.replace('<main>', '<main hidden>').replace('<section id="versus" hidden', '<section id="versus"') : site.markup }} />
    <noscript><p>Enable JavaScript to play FlyTris. The experiment summary is available above.</p></noscript>
    <Script src={site.script} nonce={nonce} strategy="afterInteractive" />
  </>;
}
