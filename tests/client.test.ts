import { deepStrictEqual, rejects, strictEqual } from 'node:assert';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';

import { connect, createOhne, escapeHTML, verifyWebhook } from '../index.js';

/**
 * A `fetch` that records each request and answers `body` with `status`.
 */
function fakeFetch(body: unknown, status = 200) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status });
  };
  return { calls, fetch: fetch as typeof globalThis.fetch };
}

describe('createOhne', () => {
  it('resolves a path through the resolve endpoint', async () => {
    const page = {
      kind: 'page',
      collection: 'Pages',
      UUID: 'u1',
      locale: 'en',
      path: '/about',
      record: {},
    };
    const { calls, fetch } = fakeFetch(page);
    const ohne = createOhne({ api: 'http://api.test/', fetch });
    deepStrictEqual(await ohne.resolve('/about'), page);
    strictEqual(calls[0]?.url, 'http://api.test/cms/routes/resolve?path=%2Fabout');
  });

  it('encodes the path and passes the extra fetch options', async () => {
    const { calls, fetch } = fakeFetch({ kind: 'notFound' });
    const ohne = createOhne({ api: 'http://api.test', fetch, fetchInit: { cache: 'no-store' } });
    await ohne.resolve('/de/über uns');
    strictEqual(calls[0]?.url, 'http://api.test/cms/routes/resolve?path=%2Fde%2F%C3%BCber+uns');
    strictEqual(calls[0]?.init?.cache, 'no-store');
  });

  it('throws when the API fails', async () => {
    const { fetch } = fakeFetch({}, 500);
    await rejects(createOhne({ api: 'http://api.test', fetch }).resolve('/'), /ohne answered 500/);
  });
});

describe('escapeHTML', () => {
  it('escapes the characters that break out of text or a quoted attribute', () => {
    strictEqual(
      escapeHTML(`<a href="x">'&'</a>`),
      '&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;',
    );
  });

  it('escapes an apostrophe as `&apos;`', () => {
    strictEqual(escapeHTML("it's"), 'it&apos;s');
  });

  it('turns nullish into an empty string and stringifies the rest', () => {
    strictEqual(escapeHTML(null), '');
    strictEqual(escapeHTML(undefined), '');
    strictEqual(escapeHTML(42), '42');
  });
});

describe('connect and previewScript', () => {
  it('connects nothing outside a browser frame', () => {
    const preview = connect({ api: 'http://api.test' });
    preview.dispose();
  });

  it('prints a module script that connects on its own', () => {
    const ohne = createOhne({ api: 'http://api.test/' });
    strictEqual(
      ohne.previewScript(),
      '<script type="module" src="http://api.test/cms/preview.js?auto"></script>',
    );
  });
});

describe('preview helpers', () => {
  const ohne = createOhne({ api: 'http://api.test' });

  it('sends the preview token as a header', async () => {
    const { calls, fetch } = fakeFetch({ kind: 'notFound' });
    await createOhne({ api: 'http://api.test', fetch }).resolve('/', { token: 'tok' });
    strictEqual(new Headers(calls[0]?.init?.headers).get('ohne-preview'), 'tok');
  });

  it('reads the token from a request or a URL', () => {
    strictEqual(ohne.token(new Request('http://site.test/about?ohne-preview=tok')), 'tok');
    strictEqual(ohne.token('/about?ohne-preview=tok'), 'tok');
    strictEqual(ohne.token('/about'), undefined);
  });

  it('answers a preview with no caching and no indexing', () => {
    deepStrictEqual(ohne.previewHeaders(), {
      'cache-control': 'private, no-store',
      'x-robots-tag': 'noindex',
    });
  });
});

describe('renderHead', () => {
  const page = {
    kind: 'page' as const,
    collection: 'Pages',
    UUID: 'u1',
    locale: 'en',
    path: '/about',
    record: {},
    seo: {
      title: 'About "us" | Acme',
      description: 'Who we are',
      canonical: 'https://example.com/about',
    },
    alternates: [{ hreflang: 'de', href: 'https://example.com/de/ueber-uns' }],
  };

  it('renders the title, description, share tags, canonical, and alternates', () => {
    strictEqual(
      createOhne({ api: 'http://api.test' }).renderHead(page),
      '<title>About &quot;us&quot; | Acme</title>' +
        '<meta name="description" content="Who we are">' +
        '<meta property="og:title" content="About &quot;us&quot; | Acme">' +
        '<meta property="og:description" content="Who we are">' +
        '<link rel="canonical" href="https://example.com/about">' +
        '<link rel="alternate" hreflang="de" href="https://example.com/de/ueber-uns">',
    );
  });

  it('keeps a preview out of search engines', () => {
    const head = createOhne({ api: 'http://api.test' }).renderHead(page, { token: 'tok' });
    strictEqual(head.includes('<meta name="robots" content="noindex">'), true);
  });
});

describe('verifyWebhook', () => {
  const secret = 'a-webhook-secret-of-some-length';
  const body = JSON.stringify({ event: 'update', collection: 'Pages', uuids: ['u1'], at: 1 });

  const signed = (t: number, content = body) =>
    new Request('http://site.test/hook', {
      method: 'POST',
      headers: {
        'ohne-signature': `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('base64url')}`,
      },
      body: content,
    });

  it('answers the event of a fresh, correctly signed request', async () => {
    const event = await verifyWebhook(signed(Math.floor(Date.now() / 1000)), secret);
    deepStrictEqual(event, JSON.parse(body));
  });

  it('refuses a stale signature, a tampered body, and a wrong secret', async () => {
    const now = Math.floor(Date.now() / 1000);
    strictEqual(await verifyWebhook(signed(now - 600), secret), null);
    strictEqual(await verifyWebhook(signed(now, body.replace('u1', 'u2')), secret), null);
    strictEqual(await verifyWebhook(signed(now), 'another-secret-entirely'), null);
  });
});
