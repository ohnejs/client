import { deepStrictEqual, ok, rejects, strictEqual } from 'node:assert';
import { describe, it } from 'node:test';
import { parseSearchParams, type SearchParamValue, stringifySearchParams } from 'ohnejs/utils';

import type {
  CollectionOf,
  ListOptions,
  Ohne,
  Picked,
  ReadOptions,
  RecordPage,
  SingletonOf,
} from '../index.d.ts';
import type { Same } from './same.ts';

import { createOhne } from '../index.js';

/**
 * A `fetch` that records each request and answers `body` with `status`.
 */
function fakeFetch(body: unknown, status = 200) {
  const calls: { url: string; headers: Headers; init: RequestInit | undefined }[] = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), headers: new Headers(init?.headers), init });
    return new Response(JSON.stringify(body), { status });
  };
  return { calls, fetch: fetch as typeof globalThis.fetch };
}

/**
 * The query a recorded URL carries, read back as the cms reads it.
 */
function queryOf(url: string | undefined) {
  return parseSearchParams(url?.split('?')[1] ?? '');
}

type Locale = 'de' | 'en';

type Post = {
  UUID: string;
  path?: string;
  title: string;
  views: number;
  publishedAt: number | null;
};

type Settings = { UUID: string; menu: { label: string }[]; copyright: string | null };

interface CMS {
  protocol: 1;
  locale: Locale;
  pages: { Posts: Post };
  notFound: Post;
  records: { Posts: Post; Settings: Settings };
  singletons: 'Settings';
}

/**
 * A types file from a cms that names no `records`.
 */
interface OldCMS {
  protocol: 1;
  locale: Locale;
  pages: { Posts: Post };
  notFound: Post;
}

const UUID = '0192f0c4-7e1a-7c3b-9d2e-5f6a7b8c9d0e';
const PAGE = { records: [], total: 0, page: 1, perPage: 20, lastPage: 1 };

describe('read', () => {
  it('reads a singleton with no query', async () => {
    const settings = { UUID: 's1', menu: [], copyright: null };
    const { calls, fetch } = fakeFetch(settings);
    const ohne = createOhne<CMS>({ api: 'http://api.test/', fetch });
    deepStrictEqual(await ohne.read('Settings'), settings);
    strictEqual(calls[0]?.url, 'http://api.test/cms/records/Settings');
  });

  it('reads one record by its UUID with a locale and a select', async () => {
    const { calls, fetch } = fakeFetch({ UUID, title: 'Hi' });
    const ohne = createOhne<CMS>({ api: 'http://api.test', fetch });
    await ohne.read('Posts', UUID, { locale: 'de', select: ['title'] });
    strictEqual(
      calls[0]?.url,
      `http://api.test/cms/records/Posts/${UUID}?select=[title]&locale=de`,
    );
  });

  it('encodes the collection and the UUID as one path segment each', async () => {
    const { calls, fetch } = fakeFetch({});
    await createOhne({ api: 'http://api.test', fetch }).read('../Posts', 'a/../b?x');
    strictEqual(calls[0]?.url, 'http://api.test/cms/records/..%2FPosts/a%2F..%2Fb%3Fx');
  });

  it('answers `undefined` for an empty or dot-segment UUID without a request', async () => {
    const { calls, fetch } = fakeFetch(PAGE);
    const ohne = createOhne<CMS>({ api: 'http://api.test', fetch });
    for (const uuid of ['', '.', '..']) strictEqual(await ohne.read('Posts', uuid), undefined);
    strictEqual(calls.length, 0);
  });

  it('keeps an encoded dot in its own segment', async () => {
    const { calls, fetch } = fakeFetch({});
    await createOhne({ api: 'http://api.test', fetch }).read('Posts', '%2e');
    strictEqual(new Request(calls[0]?.url ?? '').url, 'http://api.test/cms/records/Posts/%252e');
  });

  it('throws for an empty or dot-segment collection without a request', async () => {
    const { calls, fetch } = fakeFetch(PAGE);
    const ohne = createOhne({ api: 'http://api.test', fetch });
    for (const collection of ['', '.', '..']) {
      await rejects(ohne.read(collection, UUID), /ohne has no collection/);
      await rejects(ohne.read(collection), /ohne has no collection/);
      await rejects(ohne.list(collection), /ohne has no collection/);
    }
    strictEqual(calls.length, 0);
  });

  it('sends only the read params', async () => {
    const { calls, fetch } = fakeFetch({});
    const options = { locale: 'en', page: 2, populate: ['author'] } as ReadOptions;
    await createOhne({ api: 'http://api.test', fetch }).read('Settings', options);
    strictEqual(calls[0]?.url, 'http://api.test/cms/records/Settings?locale=en');
  });

  it('answers `undefined` for a record a visitor may not see', async () => {
    const { fetch } = fakeFetch({ error: 'notFound' }, 404);
    strictEqual(
      await createOhne<CMS>({ api: 'http://api.test', fetch }).read('Posts', UUID),
      undefined,
    );
  });

  it('throws when a singleton is missing or the API fails', async () => {
    const missing = createOhne({ api: 'http://api.test', fetch: fakeFetch({}, 404).fetch });
    await rejects(missing.read('Settings'), /ohne answered 404 for \/cms\/records\/Settings/);
    const failing = createOhne({ api: 'http://api.test', fetch: fakeFetch({}, 500).fetch });
    await rejects(failing.read('Posts', UUID), /ohne answered 500/);
  });
});

describe('list', () => {
  it('reads the first page with no query', async () => {
    const { calls, fetch } = fakeFetch(PAGE);
    deepStrictEqual(await createOhne<CMS>({ api: 'http://api.test', fetch }).list('Posts'), PAGE);
    strictEqual(calls[0]?.url, 'http://api.test/cms/records/Posts');
  });

  it('writes each option in the URL grammar', async () => {
    const { calls, fetch } = fakeFetch(PAGE);
    await createOhne<CMS>({ api: 'http://api.test', fetch }).list('Posts', {
      where: { views: { atLeast: 10 } },
      order: ['-publishedAt', 'title'],
      select: ['title'],
      page: 2,
      perPage: 3,
      locale: 'de',
    });
    strictEqual(
      calls[0]?.url,
      'http://api.test/cms/records/Posts' +
        '?where={views:{atLeast:10}}&order=[-publishedAt,title]&select=[title]&page=2&perPage=3&locale=de',
    );
  });

  it('drops an option that is `undefined`', async () => {
    const { calls, fetch } = fakeFetch(PAGE);
    await createOhne({ api: 'http://api.test', fetch }).list('Posts', {
      page: undefined,
      perPage: 5,
    });
    strictEqual(calls[0]?.url, 'http://api.test/cms/records/Posts?perPage=5');
  });

  it('throws on a `404`', async () => {
    const { fetch } = fakeFetch({}, 404);
    await rejects(createOhne({ api: 'http://api.test', fetch }).list('Nope'), /ohne answered 404/);
  });

  it('merges `fetchInit` and sends no preview token', async () => {
    const { calls, fetch } = fakeFetch(PAGE);
    const fetchInit = { cache: 'no-store' as const, headers: { cookie: 'ohne_sandbox=abc' } };
    await createOhne({ api: 'http://api.test', fetch, fetchInit }).list('Posts');
    strictEqual(calls[0]?.init?.cache, 'no-store');
    strictEqual(calls[0]?.headers.get('cookie'), 'ohne_sandbox=abc');
    strictEqual(calls[0]?.headers.get('ohne-preview'), null);
  });
});

describe('the URL grammar', () => {
  const roundTrip = async (where: ListOptions['where']) => {
    const { calls, fetch } = fakeFetch(PAGE);
    await createOhne({ api: 'http://api.test', fetch }).list('Posts', { where });
    return queryOf(calls[0]?.url).where;
  };

  it('reads back strings that look like other values as strings', async () => {
    const where = {
      a: '1',
      b: 'true',
      c: 'null',
      d: 'a,b',
      e: '{x}',
      f: '[y]',
      g: '`tick',
      h: 'über 🦊',
      i: "it's 100% a&b=c #1",
      j: '',
      k: '-0.5e3',
      l: '9007199254740993',
    };
    deepStrictEqual(await roundTrip(where), where);
  });

  it('reads back numbers, booleans, `null`, and nested conditions', async () => {
    const where = {
      featured: true,
      views: { atLeast: 10, below: 1.5, not: null },
      big: 2 ** 60,
      or: [
        { title: { contains: 'a:b' } },
        { author: { has: { name: 'Anduin', tags: ['', 'x'] } } },
      ],
    };
    deepStrictEqual(await roundTrip(where), where);
  });

  it('writes the query as `stringifySearchParams` does', async () => {
    const options: { [key: string]: SearchParamValue } = {
      where: { title: { contains: "it's `1`" }, or: [{ views: 1e21 }, { tags: ['', 'ü'] }] },
      order: ['-publishedAt'],
      page: 2,
    };
    const { calls, fetch } = fakeFetch(PAGE);
    await createOhne({ api: 'http://api.test', fetch }).list('Posts', options as ListOptions);
    strictEqual(calls[0]?.url.split('?')[1], stringifySearchParams(options));
  });

  it('writes a non-finite number as `null` and drops an `undefined` field', async () => {
    deepStrictEqual(await roundTrip({ a: Number.NaN, b: undefined, c: [undefined] }), {
      a: null,
      c: [null],
    });
  });
});

describe('createOhne<CMS> reads', () => {
  const ohne = createOhne<CMS>({ api: 'http://api.test', fetch: fakeFetch({}).fetch });

  it('types a singleton read and a record read', async () => {
    const settings = await ohne.read('Settings');
    const post = await ohne.read('Posts', UUID, { select: ['title'] });
    const same: [
      Same<typeof settings, Settings>,
      Same<typeof post, Picked<Post, 'title'> | undefined>,
    ] = [true, true];
    ok(same.every((check) => check));
    const picked: Same<
      Picked<Post, 'title'>,
      { UUID: string; path?: string; title: string }
    > = true;
    ok(picked);
  });

  it('types a list page narrowed by `select`', async () => {
    const posts = await ohne.list('Posts', { select: ['title', 'views'], order: ['-views'] });
    const same: Same<
      typeof posts,
      RecordPage<Pick<Post, 'UUID' | 'path' | 'title' | 'views'>>
    > = true;
    ok(same);
  });

  it('refuses a wrong collection, field, or locale', () => {
    const refused = [
      // @ts-expect-error
      () => ohne.read('Posts'),
      // @ts-expect-error
      () => ohne.read('Settings', UUID),
      // @ts-expect-error
      () => ohne.list('Settings'),
      // @ts-expect-error
      () => ohne.list('Pages'),
      // @ts-expect-error
      () => ohne.list('Posts', { order: ['-nope'] }),
      // @ts-expect-error
      () => ohne.list('Posts', { select: ['nope'] }),
      // @ts-expect-error
      () => ohne.list('Posts', { where: { nope: 1 } }),
      // @ts-expect-error
      () => ohne.read('Settings', { locale: 'fr' }),
    ];
    ok(refused.length > 0);
  });

  it('refuses every collection under a types file without `records`', () => {
    const old = createOhne<OldCMS>({ api: 'http://api.test' });
    const same: [Same<SingletonOf<OldCMS>, never>, Same<CollectionOf<OldCMS>, never>] = [
      true,
      true,
    ];
    ok(same.every((check) => check));
    const refused = [
      // @ts-expect-error
      () => old.read('Settings'),
      // @ts-expect-error
      () => old.list('Posts'),
    ];
    ok(refused.length > 0);
    const untyped: Ohne = old;
    ok(untyped);
  });

  it('takes no singleton when the cms has none', () => {
    type Plain = Omit<CMS, 'singletons'> & { singletons: never };
    const same: [Same<SingletonOf<Plain>, never>, Same<CollectionOf<Plain>, 'Posts' | 'Settings'>] =
      [true, true];
    ok(same.every((check) => check));
  });
});

describe('createOhne reads', () => {
  it('takes any collection and any field untyped', async () => {
    const ohne = createOhne({ api: 'http://api.test', fetch: fakeFetch(PAGE).fetch });
    const page = await ohne.list('Anything', { where: { any: 1 }, order: ['-any'], select: ['x'] });
    const record = await ohne.read('Anything', UUID);
    const same: [
      Same<SingletonOf<UntypedOf<typeof ohne>>, string>,
      Same<ListOptions, ListOptions<UntypedOf<typeof ohne>>>,
    ] = [true, true];
    ok(same.every((check) => check));
    ok(page.records && record);
  });
});

/**
 * The schema an `Ohne` client reads.
 */
type UntypedOf<O> = O extends Ohne<infer S> ? S : never;
