import { deepStrictEqual, ok, rejects, strictEqual } from 'node:assert';
import { describe, it } from 'node:test';
import { parseSearchParams } from 'ohnejs/utils';

import type {
  API,
  CallOptions,
  LoginOutcome,
  ResponseOf,
  RouteMap,
  UntypedRoutes,
  UserOf,
} from '../index.d.ts';
import type { Same } from './same.ts';

import { APIError, createAPI } from '../index.js';

/**
 * A `fetch` that records each request and answers with what `answer` builds.
 */
function fakeFetch(answer: () => Response = () => Response.json({})) {
  const calls: { url: string; headers: Headers; init: RequestInit }[] = [];
  const fetch = async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), headers: new Headers(init.headers), init });
    return answer();
  };
  return { calls, fetch: fetch as typeof globalThis.fetch };
}

/**
 * A `fetch` that never gets an answer.
 */
const offline = (async () => {
  throw new TypeError('fetch failed');
}) as typeof globalThis.fetch;

/**
 * A `204` as a browser's `fetch` hands it over, with a non-null `body` Node's constructor refuses.
 */
function browserNoContent() {
  const response = new Response(new ReadableStream());
  Object.defineProperty(response, 'status', { value: 204 });
  return response;
}

interface User {
  UUID: string;
  email: string;
  roles: string[];
}

interface Site {
  code: string;
}

type Routes = {
  'POST /auth/login': {
    body: { email: string; password: string; remember?: boolean };
    response: User;
  };
  'POST /auth/logout': { response: { ok: true } };
  'GET /auth/me': { response: User | null };
  'PATCH /auth/me': { body: { firstName?: string | null }; response: User };
  'GET /sites': { query: { client: string; page?: number }; response: Site[] };
  'GET /sites/[code]': { response: Site };
  'GET /files/[...path]': {};
  'GET /search': { query?: { q: string } };
  '/health': { response: { ok: true } };
};

const USER = { UUID: 'u1', email: 'ada@example.com', roles: ['admin'] };

describe('createAPI call', () => {
  it('sends the route method to the filled path with credentials', async () => {
    const { calls, fetch } = fakeFetch();
    const api = createAPI<Routes>({ api: 'http://api.test/api/', fetch });
    await api.call('GET /sites/[code]', { params: { code: 'a b' } });
    strictEqual(calls[0]?.url, 'http://api.test/api/sites/a%20b');
    strictEqual(calls[0]?.init.method, 'GET');
    strictEqual(calls[0]?.init.credentials, 'include');
  });

  it('fills a catch-all with each segment encoded on its own', async () => {
    const { calls, fetch } = fakeFetch();
    await createAPI<Routes>({ api: '/api', fetch }).call('GET /files/[...path]', {
      params: { path: 'maps/über.png' },
    });
    strictEqual(calls[0]?.url, '/api/files/maps/%C3%BCber.png');
  });

  it('refuses a param that would change the path without a request', async () => {
    const { calls, fetch } = fakeFetch();
    const api = createAPI<Routes>({ api: '/api', fetch });
    await rejects(api.call('GET /sites/[code]', { params: { code: '..' } }), /Invalid route param/);
    await rejects(
      api.call('GET /sites/[code]', { params: { code: 'a/b' } }),
      /Invalid route param/,
    );
    await rejects(api.call('GET /files/[...path]', { params: { path: 'a//b' } }), /Invalid/);
    // @ts-expect-error
    await rejects(api.call('GET /sites/[code]', { params: {} }), /Missing route param `code`/);
    strictEqual(calls.length, 0);
  });

  it('sends the query in the URL grammar ohne reads back', async () => {
    const { calls, fetch } = fakeFetch();
    const query = { client: '1', page: 2, where: { tag: 'a&b' }, 'a=b': true, skip: undefined };
    await createAPI({ api: '/api', fetch }).call('GET /sites', { query });
    const search = (calls[0]?.url ?? '').split('?')[1] ?? '';
    deepStrictEqual(parseSearchParams(search), {
      client: '1',
      page: 2,
      where: { tag: 'a&b' },
      'a=b': true,
    });
  });

  it('keeps a key with a leading `?` as data', async () => {
    const { calls, fetch } = fakeFetch();
    await createAPI({ api: '/api', fetch }).call('GET /sites', { query: { '?q': 'x' } });
    const search = (calls[0]?.url ?? '').split('?').slice(1).join('?');
    deepStrictEqual(parseSearchParams(search), { '?q': 'x' });
  });

  it('sends no query mark when every value is undefined', async () => {
    const { calls, fetch } = fakeFetch();
    await createAPI({ api: '/api', fetch }).call('GET /sites', { query: { client: undefined } });
    strictEqual(calls[0]?.url, '/api/sites');
  });

  it('sends a body as JSON, and lets its headers win over `fetchInit`', async () => {
    const { calls, fetch } = fakeFetch();
    const fetchInit = { cache: 'no-store' as const, headers: { cookie: 'c=1', 'x-a': 'old' } };
    await createAPI<Routes>({ api: '/api', fetch, fetchInit }).call('PATCH /auth/me', {
      body: { firstName: 'Ada' },
      headers: { 'x-a': 'new', 'content-type': 'text/plain' },
    });
    strictEqual(calls[0]?.init.method, 'PATCH');
    strictEqual(calls[0]?.init.body, '{"firstName":"Ada"}');
    strictEqual(calls[0]?.init.cache, 'no-store');
    strictEqual(calls[0]?.headers.get('cookie'), 'c=1');
    strictEqual(calls[0]?.headers.get('x-a'), 'new');
    strictEqual(calls[0]?.headers.get('content-type'), 'application/json');
  });

  it('sends no body and no content type without a body', async () => {
    const { calls, fetch } = fakeFetch();
    await createAPI<Routes>({ api: '/api', fetch }).call('POST /auth/logout');
    strictEqual(calls[0]?.init.body, undefined);
    strictEqual(calls[0]?.headers.get('content-type'), null);
  });

  it('lets `fetchInit` pick other credentials', async () => {
    const { calls, fetch } = fakeFetch();
    const fetchInit = { credentials: 'omit' as const };
    await createAPI<Routes>({ api: '/api', fetch, fetchInit }).call('GET /auth/me');
    strictEqual(calls[0]?.init.credentials, 'omit');
  });

  it('sends a bare-path id with the given method, else the default one', async () => {
    const { calls, fetch } = fakeFetch();
    const api = createAPI<Routes>({ api: '/api', fetch });
    await api.call('/health', { method: 'HEAD' });
    await api.call('/health');
    strictEqual(calls[0]?.init.method, 'HEAD');
    strictEqual(calls[1]?.init.method, undefined);
  });

  it('answers the parsed JSON body', async () => {
    const { fetch } = fakeFetch(() => Response.json([{ code: 'a' }]));
    deepStrictEqual(
      await createAPI<Routes>({ api: '/api', fetch }).call('GET /sites', {
        query: { client: 'c' },
      }),
      [{ code: 'a' }],
    );
  });

  it('answers `null` for an empty answer', async () => {
    const answers = [
      () => new Response(null, { status: 204 }),
      browserNoContent,
      () => new Response(null, { status: 205 }),
      () => new Response('', { status: 201, headers: { 'content-length': '0' } }),
    ];
    for (const answer of answers) {
      const { fetch } = fakeFetch(answer);
      strictEqual(await createAPI({ api: '/api', fetch }).call('POST /things'), null);
    }
  });

  it('answers the raw `Response` for a body that is not JSON', async () => {
    const page = new Response('<p>hi</p>', { headers: { 'content-type': 'text/html' } });
    const { fetch } = fakeFetch(() => page);
    strictEqual(await createAPI({ api: '/api', fetch }).call('GET /page'), page);
  });

  it('reads a `+json` media type as JSON', async () => {
    const answer = () =>
      new Response('{"a":1}', { headers: { 'content-type': 'application/problem+json' } });
    const { fetch } = fakeFetch(answer);
    deepStrictEqual(await createAPI({ api: '/api', fetch }).call('GET /a'), { a: 1 });
  });

  it('throws an `APIError` with the field messages of a `422`', async () => {
    const body = {
      statusCode: 422,
      message: 'Invalid input',
      data: { errors: { email: 'Required' } },
    };
    const { fetch } = fakeFetch(() => Response.json(body, { status: 422 }));
    const api = createAPI<Routes>({ api: '/api', fetch });
    await rejects(api.call('PATCH /auth/me', { body: {} }), (error) => {
      ok(error instanceof APIError);
      ok(error instanceof Error);
      strictEqual(error.name, 'APIError');
      strictEqual(error.status, 422);
      strictEqual(error.message, 'Invalid input');
      deepStrictEqual(error.data, { errors: { email: 'Required' } });
      deepStrictEqual(error.errors, { email: 'Required' });
      return true;
    });
  });

  it('throws an `APIError` naming the route when the answer carries no message', async () => {
    const { fetch } = fakeFetch(() => new Response('<h1>Bad gateway</h1>', { status: 502 }));
    const api = createAPI<Routes>({ api: '/api', fetch });
    await rejects(api.call('GET /sites/[code]', { params: { code: 'x' } }), {
      name: 'APIError',
      status: 502,
      message: 'ohne answered 502 for GET /sites/x',
      data: undefined,
      errors: {},
    });
  });

  it('throws an `APIError` with status `0` when no answer arrives', async () => {
    await rejects(createAPI({ api: '/api', fetch: offline }).call('GET /a'), (error) => {
      ok(error instanceof APIError);
      strictEqual(error.status, 0);
      strictEqual(error.message, 'fetch failed');
      ok(error.cause instanceof TypeError);
      return true;
    });
  });

  it('rejects an aborted call with the abort error itself', async () => {
    const fetch = (async (_: unknown, init: RequestInit) => {
      init.signal?.throwIfAborted();
      return Response.json({});
    }) as typeof globalThis.fetch;
    const controller = new AbortController();
    controller.abort();
    const call = createAPI({ api: '/api', fetch }).call('GET /a', { signal: controller.signal });
    await rejects(call, (error) => {
      ok(!(error instanceof APIError));
      strictEqual((error as Error).name, 'AbortError');
      return true;
    });
  });
});

describe('createAPI session', () => {
  it('signs in with the user the API answers', async () => {
    const { calls, fetch } = fakeFetch(() => Response.json(USER));
    const outcome = await createAPI<Routes>({ api: '/api', fetch }).login({
      email: 'ada@example.com',
      password: 'secret',
    });
    deepStrictEqual(outcome, { kind: 'signed-in', user: USER });
    strictEqual(calls[0]?.url, '/api/auth/login');
    strictEqual(calls[0]?.init.method, 'POST');
    strictEqual(calls[0]?.init.credentials, 'include');
    deepStrictEqual(JSON.parse(String(calls[0]?.init.body)), {
      email: 'ada@example.com',
      password: 'secret',
      remember: false,
    });
  });

  it('reads each refusal as its outcome', async () => {
    const cases: [Response, LoginOutcome][] = [
      [new Response(null, { status: 401 }), { kind: 'invalid' }],
      [
        new Response(null, { status: 429, headers: { 'Retry-After': '30' } }),
        { kind: 'throttled', retryAfter: 30 },
      ],
      [new Response(null, { status: 503 }), { kind: 'throttled', retryAfter: 0 }],
      [new Response(null, { status: 500 }), { kind: 'failed', status: 500 }],
    ];
    for (const [answer, outcome] of cases) {
      const { fetch } = fakeFetch(() => answer);
      const login = createAPI({ api: '/api', fetch }).login({
        email: 'a@b.c',
        password: 'x',
        remember: true,
      });
      deepStrictEqual(await login, outcome);
    }
  });

  it('reads a success whose body is no JSON as failed', async () => {
    const answers = [
      () => new Response('<html>', { headers: { 'content-type': 'text/html' } }),
      () => new Response(null, { status: 200 }),
    ];
    for (const answer of answers) {
      const { fetch } = fakeFetch(answer);
      const outcome = await createAPI({ api: '/api', fetch }).login({ email: 'a', password: 'b' });
      deepStrictEqual(outcome, { kind: 'failed', status: 200 });
    }
  });

  it('reads no answer as unreachable', async () => {
    const outcome = await createAPI({ api: '/api', fetch: offline }).login({
      email: 'a',
      password: 'b',
    });
    deepStrictEqual(outcome, { kind: 'unreachable' });
  });

  it('answers the signed-in user, or `null` when nobody is', async () => {
    const signedIn = fakeFetch(() => Response.json(USER));
    deepStrictEqual(await createAPI<Routes>({ api: '/api', fetch: signedIn.fetch }).user(), USER);
    strictEqual(signedIn.calls[0]?.url, '/api/auth/me');
    strictEqual(signedIn.calls[0]?.init.method, 'GET');
    const signedOut = fakeFetch(browserNoContent);
    strictEqual(await createAPI<Routes>({ api: '/api', fetch: signedOut.fetch }).user(), null);
  });

  it('throws when the user cannot be read, so an outage never reads as signed out', async () => {
    const { fetch } = fakeFetch(() => Response.json({ message: 'Down' }, { status: 500 }));
    await rejects(createAPI({ api: '/api', fetch }).user(), { name: 'APIError', status: 500 });
    await rejects(createAPI({ api: '/api', fetch: offline }).user(), {
      name: 'APIError',
      status: 0,
    });
  });

  it('signs out, and throws when the API cannot be reached', async () => {
    const { calls, fetch } = fakeFetch(() => Response.json({ ok: true }));
    strictEqual(await createAPI({ api: '/api', fetch }).logout(), undefined);
    strictEqual(calls[0]?.url, '/api/auth/logout');
    strictEqual(calls[0]?.init.method, 'POST');
    await rejects(createAPI({ api: '/api', fetch: offline }).logout(), {
      name: 'APIError',
      status: 0,
    });
  });
});

describe('APIError', () => {
  it('reads field messages only on a `422`', () => {
    const data = { errors: { email: 'Required' } };
    deepStrictEqual(new APIError('x', { status: 422, data }).errors, { email: 'Required' });
    deepStrictEqual(new APIError('x', { status: 400, data }).errors, {});
    deepStrictEqual(new APIError('x', { status: 422, data: { errors: 'no' } }).errors, {});
  });

  it('carries a cause only when given one', () => {
    ok(!('cause' in new APIError('x', { status: 500 })));
    strictEqual(new APIError('x', { status: 0, cause: 'c' }).cause, 'c');
  });
});

describe('createAPI<Routes> types', () => {
  const api = createAPI<Routes>({ api: '/api', fetch: fakeFetch().fetch });

  it('answers each route its contract response, and `unknown` without one', async () => {
    const sites = await api.call('GET /sites', { query: { client: 'c' } });
    const site = await api.call('GET /sites/[code]', { params: { code: 'a' } });
    const file = await api.call('GET /files/[...path]', { params: { path: 'a/b' } });
    const same: [
      Same<typeof sites, Site[]>,
      Same<typeof site, Site>,
      Same<typeof file, unknown>,
      Same<ResponseOf<Routes, 'GET /auth/me'>, User | null>,
    ] = [true, true, true, true];
    ok(same.every((check) => check));
  });

  it('requires what a route declares, and takes any body or query it does not', () => {
    const refused = [
      // @ts-expect-error
      () => api.call('GET /sites'),
      // @ts-expect-error
      () => api.call('GET /sites', { query: {} }),
      // @ts-expect-error
      () => api.call('GET /sites/[code]'),
      // @ts-expect-error
      () => api.call('GET /sites/[code]', { params: { id: 'a' } }),
      // @ts-expect-error
      () => api.call('POST /auth/login'),
      // @ts-expect-error
      () => api.call('POST /auth/login', { body: { email: 'a' } }),
      // @ts-expect-error
      () => api.call('GET /nope'),
      // @ts-expect-error
      () => api.call('GET /sites/[code]', { params: { code: 'a' }, method: 'POST' }),
    ];
    ok(refused.length > 0);
    ok(() => api.call('GET /search'));
    ok(() => api.call('GET /search', { query: { q: 'x' } }));
    ok(() => api.call('/health', { method: 'POST' }));
    ok(() => api.call('GET /files/[...path]', { params: { path: 'a' }, query: {}, body: 1 }));
  });

  it('builds the options of each route', () => {
    const same: [
      Same<CallOptions<Routes, 'GET /sites/[code]'>['params'], { code: string }>,
      Same<CallOptions<Routes, 'GET /files/[...path]'>['params'], { path: string }>,
      Same<CallOptions<Routes, 'POST /auth/login'>['body'], Routes['POST /auth/login']['body']>,
    ] = [true, true, true];
    ok(same.every((check) => check));
  });

  it('types the session by `GET /auth/me`', async () => {
    const user = await api.user();
    const outcome = await api.login({ email: 'a', password: 'b' });
    const same: [Same<typeof user, User | null>, Same<typeof outcome, LoginOutcome<User>>] = [
      true,
      true,
    ];
    ok(same.every((check) => check));
  });

  it('takes any route untyped, answering `unknown`', async () => {
    const untyped = createAPI({ api: '/api', fetch: fakeFetch().fetch });
    const answer = await untyped.call('GET /anything/[id]', {
      params: { id: '1' },
      query: { a: 1 },
    });
    const user = await untyped.user();
    const same: [
      Same<typeof answer, unknown>,
      Same<UserOf<UntypedRoutes>, unknown>,
      Same<typeof user, unknown>,
    ] = [true, true, true];
    ok(same.every((check) => check));
    // @ts-expect-error
    ok(() => untyped.call('GET /anything/[id]'));
    const typed: RouteMap = {} as Routes;
    const loose: API = untyped;
    ok(typed && loose);
  });
});
