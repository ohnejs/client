import { ok, strictEqual } from 'node:assert';
import { describe, it } from 'node:test';

import type {
  Alternate,
  ConnectOptions,
  Link,
  Ohne,
  Resolved,
  ResolvedNotFound,
  ResolvedPage,
  ResolvedRedirect,
  RichText,
  SEO,
} from '../index.d.ts';
import type { Same } from './same.ts';

import { createOhne, richTextToHTML } from '../index.js';

type Locale = 'de' | 'en';

interface Upload {
  UUID: string;
  kind: 'file';
  private: false;
  name: string;
  description: string | null;
  url: string;
}

interface Blocks {
  Hero: { heading: string; image: Upload | null; body: RichText<'Pages'> };
}

type Block<B extends keyof Blocks = keyof Blocks> = {
  [K in B]: { block: K; UUID: string; fields: Blocks[K] };
}[B];

interface CMS {
  protocol: 1;
  locale: Locale;
  pages: {
    Pages: { UUID: string; _updatedAt: number; title: string | null; content: Block[] };
    Posts: { UUID: string; _updatedAt: number; headline: string; cover: Upload | null };
  };
  notFound: CMS['pages']['Pages'] | CMS['pages']['Posts'];
}

type Page<C extends keyof CMS['pages'] = keyof CMS['pages']> = CMS['pages'][C];

const SEO_TAGS: SEO = { title: 'About', canonical: 'https://site.test/about' };

const ABOUT: Resolved<CMS> = {
  kind: 'page',
  collection: 'Pages',
  UUID: 'u1',
  locale: 'en',
  path: '/about',
  seo: SEO_TAGS,
  alternates: [{ hreflang: 'x-default', href: 'https://site.test/about' }],
  record: {
    UUID: 'u1',
    _updatedAt: 1,
    title: 'About',
    content: [
      {
        block: 'Hero',
        UUID: 'b1',
        fields: {
          heading: 'Hi',
          image: null,
          body: [{ kind: 'paragraph', content: [{ text: 'Home', link: { url: '/' } }] }],
        },
      },
    ],
  },
};

const MISSING: Resolved<CMS> = {
  kind: 'notFound',
  page: { UUID: 'p404', _updatedAt: 1, headline: 'Gone', cover: null },
};

/**
 * A `fetch` that answers every request with `body`.
 */
function answer(body: unknown): typeof fetch {
  return async () => new Response(JSON.stringify(body));
}

/**
 * `ResolvedPage` spelled out for a client created without a type.
 */
interface UntypedPage {
  kind: 'page';
  collection: string;
  UUID: string;
  locale: string;
  path: string;
  record: Record<string, unknown>;
  seo: SEO;
  alternates: { hreflang: string; href: string }[];
}

/**
 * `ResolvedNotFound` spelled out for a client created without a type.
 */
interface UntypedNotFound {
  kind: 'notFound';
  page?: Record<string, unknown>;
}

describe('createOhne<CMS>', () => {
  it('narrows the record by its collection', async () => {
    const ohne = createOhne<CMS>({ api: 'http://api.test', fetch: answer(ABOUT) });
    const page = await ohne.resolve('/about');
    ok(page.kind === 'page' && page.collection === 'Pages');
    const { record, locale, alternates } = page;
    const same: [
      Same<typeof record, Page<'Pages'>>,
      Same<typeof locale, Locale>,
      Same<typeof alternates, Alternate<Locale>[]>,
    ] = [true, true, true];
    ok(same.every((check) => check));
    // @ts-expect-error
    ok(record.headline === undefined);
    strictEqual(record.content[0]?.fields.heading, 'Hi');
    ok(ohne.renderHead(page).startsWith('<title>About</title>'));
  });

  it('types the not-found page as the union of the catch-all collections', async () => {
    const ohne = createOhne<CMS>({ api: 'http://api.test', fetch: answer(MISSING) });
    const page = await ohne.resolve('/nope');
    ok(page.kind === 'notFound');
    const same: Same<typeof page.page, Page<'Pages'> | Page<'Posts'> | undefined> = true;
    ok(same);
    ok(page.page && 'headline' in page.page);
    strictEqual(page.page.headline, 'Gone');
  });

  it('passes as an untyped client', async () => {
    const resolve = (client: Ohne, path: string) => client.resolve(path);
    const ohne = createOhne<CMS>({ api: 'http://api.test', fetch: answer(MISSING) });
    strictEqual((await resolve(ohne, '/nope')).kind, 'notFound');
  });

  it('rejects a type file of another protocol', () => {
    type Future = Omit<CMS, 'protocol'> & { protocol: 2 };
    // @ts-expect-error
    const ohne = createOhne<Future>({ api: 'http://api.test' });
    strictEqual(typeof ohne.resolve, 'function');
  });

  it('renders rich text narrowed to its link collections', () => {
    const body: RichText<'Pages'> = [
      {
        kind: 'paragraph',
        content: [{ text: 'About', link: { collection: 'Pages', record: 'u1', href: '/about' } }],
      },
    ];
    strictEqual(richTextToHTML(body), '<p><a href="/about">About</a></p>');
    // @ts-expect-error
    const post: Link<'Pages'> = { collection: 'Posts', record: 'u2' };
    ok(post);
  });
});

describe('createOhne', () => {
  it('keeps the untyped client as it was', () => {
    const ohne = createOhne({ api: 'http://api.test' });
    const same: [
      Same<ResolvedPage, UntypedPage>,
      Same<ResolvedNotFound, UntypedNotFound>,
      Same<Resolved, UntypedPage | ResolvedRedirect | UntypedNotFound>,
      Same<typeof ohne, Ohne>,
      Same<Parameters<NonNullable<ConnectOptions['onData']>>[0], Resolved>,
    ] = [true, true, true, true, true];
    ok(same.every((check) => check));
  });
});
