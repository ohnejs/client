import { deepStrictEqual, rejects, strictEqual } from 'node:assert';
import { describe, it } from 'node:test';

import { createOhne, escapeHTML } from '../index.js';

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

  it('passes the locale and the extra fetch options', async () => {
    const { calls, fetch } = fakeFetch({ kind: 'notFound' });
    const ohne = createOhne({ api: 'http://api.test', fetch, fetchInit: { cache: 'no-store' } });
    await ohne.resolve('/über uns', { locale: 'de' });
    strictEqual(
      calls[0]?.url,
      'http://api.test/cms/routes/resolve?path=%2F%C3%BCber+uns&locale=de',
    );
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
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });

  it('turns nullish into an empty string and stringifies the rest', () => {
    strictEqual(escapeHTML(null), '');
    strictEqual(escapeHTML(undefined), '');
    strictEqual(escapeHTML(42), '42');
  });
});
