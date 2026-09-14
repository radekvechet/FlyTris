import { headers } from 'next/headers';
import Script from 'next/script';
import site from '../.generated/site.json';

export const dynamic = 'force-dynamic';
export default async function Home() {
  const nonce = (await headers()).get('x-nonce');
  return <>
    <div dangerouslySetInnerHTML={{ __html: site.markup }} />
    <noscript><p>Enable JavaScript to play FlyTris. The experiment summary is available above.</p></noscript>
    <Script src={site.script} nonce={nonce} strategy="afterInteractive" />
  </>;
}
