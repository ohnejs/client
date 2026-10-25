import { deepStrictEqual, ok, rejects, strictEqual } from 'node:assert';
import { describe, it } from 'node:test';
import { toKebabCase } from 'ohnejs/utils';

import type { CreatableOf, CreateInputOf, CreateResult, Ohne, UntypedSchema } from '../index.d.ts';
import type { Same } from './same.ts';

import { createOhne } from '../index.js';

/**
 * A `fetch` that records each request and answers `body` as is with `status`.
 */
function fakeFetch(body: string, status = 201) {
  const calls: { url: string; headers: Headers; init: RequestInit | undefined }[] = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), headers: new Headers(init?.headers), init });
    return new Response(body, { status });
  };
  return { calls, fetch: fetch as typeof globalThis.fetch };
}

type Message = { name: string; email: string; message: string; topic?: string | null };

interface CMS {
  protocol: 1;
  locale: 'en';
  pages: {};
  notFound: {};
  records: { Posts: { UUID: string; title: string }; Settings: { UUID: string } };
  singletons: 'Settings';
  creatable: { Messages: Message; BlogPosts: { title: string } };
}

/**
 * A types file from a cms that names no `creatable`.
 */
type OldCMS = Omit<CMS, 'creatable'>;

const UUID = '0192f0c4-7e1a-7c3b-9d2e-5f6a7b8c9d0e';
const MESSAGE = { name: 'Ada', email: 'ada@example.com', message: 'Hi' };

describe('create', () => {
  it('posts the input as JSON to the collection kebab segment', async () => {
    const { calls, fetch } = fakeFetch(JSON.stringify({ UUID }));
    await createOhne<CMS>({ api: 'http://api.test/', fetch }).create('BlogPosts', { title: 'Hi' });
    strictEqual(calls[0]?.url, 'http://api.test/collections/blog-posts');
    strictEqual(calls[0]?.init?.method, 'POST');
    strictEqual(calls[0]?.headers.get('content-type'), 'application/json');
    strictEqual(calls[0]?.init?.body, '{"title":"Hi"}');
  });

  it('names each collection by the segment the API routes', async () => {
    const names = ['Messages', 'BlogPosts', 'FAQEntries', 'HTML5Parser', 'User2FA', 'Top10Lists'];
    names.push('V2Posts', 'A', 'APIKeys', 'Item3D');
    const { calls, fetch } = fakeFetch('{}');
    const ohne = createOhne({ api: 'http://api.test', fetch });
    for (const name of names) await ohne.create(name, {});
    const segments = calls.map(({ url }) => url.slice('http://api.test/collections/'.length));
    deepStrictEqual(segments, names.map(toKebabCase));
  });

  it('throws for a name that is no collection without a request', async () => {
    const { calls, fetch } = fakeFetch('{}');
    const ohne = createOhne({ api: 'http://api.test', fetch });
    for (const name of ['', '..', '../Messages', 'messages', 'Blog-Posts', 'Messages/x']) {
      await rejects(ohne.create(name, {}), /ohne has no collection/);
    }
    strictEqual(calls.length, 0);
  });

  it('merges `fetchInit`, lets its own headers win, and always sends JSON', async () => {
    const { calls, fetch } = fakeFetch('{}');
    const fetchInit = {
      cache: 'no-store' as const,
      headers: { cookie: 'ohne_sandbox=abc', 'recaptcha-token': 'old' },
    };
    await createOhne<CMS>({ api: 'http://api.test', fetch, fetchInit }).create(
      'Messages',
      MESSAGE,
      {
        headers: { 'recaptcha-token': 'fresh', 'content-type': 'text/plain' },
      },
    );
    strictEqual(calls[0]?.init?.cache, 'no-store');
    strictEqual(calls[0]?.headers.get('cookie'), 'ohne_sandbox=abc');
    strictEqual(calls[0]?.headers.get('recaptcha-token'), 'fresh');
    strictEqual(calls[0]?.headers.get('content-type'), 'application/json');
    strictEqual(calls[0]?.headers.get('ohne-preview'), null);
    strictEqual(calls[0]?.url, 'http://api.test/collections/messages');
  });

  it('resolves the new record UUID only', async () => {
    const created = JSON.stringify({ UUID, name: 'Ada', secret: 'x' });
    const ohne = createOhne<CMS>({ api: 'http://api.test', fetch: fakeFetch(created).fetch });
    deepStrictEqual(await ohne.create('Messages', MESSAGE), { ok: true, UUID });
  });

  it('resolves no `UUID` key when the access leaves it out', async () => {
    const ohne = createOhne<CMS>({ api: 'http://api.test', fetch: fakeFetch('{}').fetch });
    const result = await ohne.create('Messages', MESSAGE);
    deepStrictEqual(result, { ok: true });
    ok(!('UUID' in result));
  });

  it('resolves an invalid input with its message and field messages', async () => {
    const body = {
      statusCode: 422,
      message: 'Invalid input',
      data: { errors: { email: 'Enter an email address', 'items[0].name': 'Required' } },
    };
    const { fetch } = fakeFetch(JSON.stringify(body), 422);
    deepStrictEqual(await createOhne({ api: 'http://api.test', fetch }).create('Messages', {}), {
      ok: false,
      status: 422,
      message: 'Invalid input',
      errors: { email: 'Enter an email address', 'items[0].name': 'Required' },
    });
  });

  it('resolves each refusal a visitor can act on with no field messages', async () => {
    for (const status of [401, 403, 413, 429]) {
      const body = JSON.stringify({ statusCode: status, message: `refused ${status}` });
      const { fetch } = fakeFetch(body, status);
      deepStrictEqual(await createOhne({ api: 'http://api.test', fetch }).create('Messages', {}), {
        ok: false,
        status,
        message: `refused ${status}`,
        errors: {},
      });
    }
  });

  it('resolves a refusal that is not JSON with an empty message', async () => {
    const { fetch } = fakeFetch('<h1>Forbidden</h1>', 403);
    deepStrictEqual(await createOhne({ api: 'http://api.test', fetch }).create('Messages', {}), {
      ok: false,
      status: 403,
      message: '',
      errors: {},
    });
  });

  it('throws on any other failed answer', async () => {
    for (const status of [400, 404, 405, 415, 500, 503]) {
      const { fetch } = fakeFetch(JSON.stringify({ statusCode: status, message: 'no' }), status);
      await rejects(
        createOhne({ api: 'http://api.test', fetch }).create('Messages', {}),
        new RegExp(`ohne answered ${status} for /collections/messages`),
      );
    }
  });

  it('throws when the request fails', async () => {
    const fetch = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof globalThis.fetch;
    await rejects(createOhne({ api: 'http://api.test', fetch }).create('Messages', {}), {
      message: 'fetch failed',
    });
  });
});

describe('createOhne<CMS> creates', () => {
  const ohne = createOhne<CMS>({ api: 'http://api.test', fetch: fakeFetch('{}').fetch });

  it('takes the creatable collections and their input', async () => {
    const same: [
      Same<CreatableOf<CMS>, 'Messages' | 'BlogPosts'>,
      Same<CreateInputOf<CMS, 'Messages'>, Message>,
    ] = [true, true];
    ok(same.every((check) => check));
    ok(await ohne.create('Messages', MESSAGE));
    ok(await ohne.create('Messages', { ...MESSAGE, topic: null }));
  });

  it('narrows a refusal to its field messages', async () => {
    const result = await ohne.create('Messages', MESSAGE);
    if (!result.ok) {
      const email: Same<typeof result.errors.email, string | undefined> = true;
      ok(email);
    }
    const same: Same<typeof result, CreateResult> = true;
    ok(same);
  });

  it('refuses a wrong collection or input', () => {
    const refused = [
      // @ts-expect-error
      () => ohne.create('Posts', { title: 'Hi' }),
      // @ts-expect-error
      () => ohne.create('Settings', {}),
      // @ts-expect-error
      () => ohne.create('Messages', { name: 'Ada', email: 'ada@example.com' }),
      // @ts-expect-error
      () => ohne.create('Messages', { ...MESSAGE, nope: 1 }),
      // @ts-expect-error
      () => ohne.create('Messages', { ...MESSAGE, email: 1 }),
    ];
    ok(refused.length > 0);
  });

  it('refuses every collection under a types file without `creatable`', () => {
    const old = createOhne<OldCMS>({ api: 'http://api.test' });
    const same: Same<CreatableOf<OldCMS>, never> = true;
    ok(same);
    // @ts-expect-error
    ok(() => old.create('Messages', MESSAGE));
    const untyped: Ohne = old;
    ok(untyped);
  });

  it('takes any collection and any input untyped', () => {
    const untyped = createOhne({ api: 'http://api.test' });
    const same: [
      Same<CreatableOf<UntypedSchema>, string>,
      Same<CreateInputOf<UntypedSchema, 'Anything'>, Record<string, unknown>>,
    ] = [true, true];
    ok(same.every((check) => check));
    ok(() => untyped.create('Anything', { any: 1 }));
  });
});
