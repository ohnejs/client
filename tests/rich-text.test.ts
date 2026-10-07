import type * as utils from 'ohnejs/utils';

import { ok, strictEqual } from 'node:assert';
import { describe, it } from 'node:test';
import { richTextToHTML as oracle } from 'ohnejs/utils';

import type {
  Link,
  RecordLink,
  RichText,
  RichTextBlock,
  RichTextHeading,
  RichTextHeadingLevel,
  RichTextList,
  RichTextListItem,
  RichTextMark,
  RichTextParagraph,
  RichTextQuote,
  RichTextRun,
  URLLink,
} from '../index.d.ts';

import { richTextToHTML } from '../index.js';

/**
 * `true` only when `A` and `B` are the same type, so an optional field added on one side fails too.
 */
type Same<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const MIRRORED: [
  Same<RichTextMark, utils.RichTextMark>,
  Same<RichTextHeadingLevel, utils.RichTextHeadingLevel>,
  Same<RecordLink, utils.RecordLink>,
  Same<URLLink, utils.URLLink>,
  Same<Link, utils.Link>,
  Same<RichTextRun, utils.RichTextRun>,
  Same<RichTextParagraph, utils.RichTextParagraph>,
  Same<RichTextHeading, utils.RichTextHeading>,
  Same<RichTextQuote, utils.RichTextQuote>,
  Same<RichTextList, utils.RichTextList>,
  Same<RichTextListItem, utils.RichTextListItem>,
  Same<RichTextBlock, utils.RichTextBlock>,
  Same<RichText, utils.RichText>,
] = [true, true, true, true, true, true, true, true, true, true, true, true, true];

const PAGE = '019f3c1a-8b2d-7f4e-9a6b-1c2d3e4f5a6b';

const HREFS = [
  'https://x.y',
  'HTTP://X.Y',
  'https://x.y/?a=1&b="2"',
  'mailto:a@b.c?subject=x',
  'tel:+1-555',
  '/',
  '/a?b#c',
  '#',
  '#top',
  'javascript:alert(1)',
  'java\tscript:x',
  'JaVaScRiPt:x',
  'ｊavascript:x',
  'data:text/html,x',
  'vbscript:x',
  'blob:x',
  'file:///etc/passwd',
  '//evil.com',
  '/\\evil.com',
  '/\t/evil.com',
  'https://u:p@x.y',
  'https://x.y@evil.com',
  'https://',
  '?q',
  '',
  ' https://x.y',
  'https://x.y ',
  'https://x.y/\n',
  'https://x.y/\u0000',
  '"><script>alert(1)</script>',
  'https://x.y/" onclick="x',
];

const TEXTS = [
  'a',
  'b c',
  '',
  '\n',
  'a\n\nb',
  'é',
  '<script>alert(1)</script>',
  `"'&`,
  '</a><a href="javascript:x">',
  'x > y',
  '&amp;',
];

function paragraph(...content: RichTextRun[]): RichTextParagraph {
  return { kind: 'paragraph', content };
}

function list(depth: number, limit: number): RichTextList {
  return {
    kind: 'list',
    ordered: depth % 2 === 1,
    items: [
      {
        content: [{ text: `${depth}` }],
        ...(depth < limit ? { list: list(depth + 1, limit) } : {}),
      },
    ],
  };
}

const CORPUS: Record<string, unknown> = {
  empty: [],
  'every kind': [
    { kind: 'heading', level: 2, content: [{ text: 'h2' }] },
    { kind: 'heading', level: 3, content: [{ text: 'h3' }] },
    { kind: 'heading', level: 4, content: [{ text: 'h4' }] },
    { kind: 'heading', level: 5, content: [{ text: 'h5' }] },
    { kind: 'heading', level: 6, content: [{ text: 'h6' }] },
    paragraph({ text: 'p' }),
    { kind: 'quote', content: [{ text: 'one\ntwo' }] },
    { kind: 'list', ordered: false, items: [{ content: [{ text: 'ul' }] }] },
    { kind: 'list', ordered: true, items: [{ content: [{ text: 'ol' }] }] },
  ],
  'every mark': [
    paragraph(
      { text: 'a', marks: ['strong'] },
      { text: 'b', marks: ['em'] },
      { text: 'c', marks: ['del'] },
      { text: 'd', marks: ['code'] },
      { text: 'e', marks: ['code', 'del', 'em', 'strong'] },
      { text: 'f', marks: ['em', 'em'] },
      { text: 'g', marks: [] },
      { text: 'h', marks: ['strong', 'code'], link: { url: '/h' } },
    ),
  ],
  'line breaks and empty leaves': [
    paragraph({ text: 'a\nb' }, { text: '\n' }, { text: '' }),
    paragraph(),
    { kind: 'heading', level: 3, content: [{ text: '' }] },
    { kind: 'quote', content: [] },
    { kind: 'list', ordered: false, items: [{ content: [] }] },
  ],
  'text escaping': [paragraph(...TEXTS.map((text) => ({ text })))],
  'every href': [
    ...HREFS.map((url) => paragraph({ text: url, link: { url } })),
    ...HREFS.map((href) =>
      paragraph({ text: href, link: { collection: 'Pages', record: PAGE, href } }),
    ),
  ],
  'new tab': [
    paragraph(
      { text: 'a', link: { url: '/a', newTab: true } },
      { text: 'b', link: { url: '/b', newTab: false } },
      { text: 'c', link: { collection: 'Pages', record: PAGE, href: '/c', newTab: true } },
    ),
  ],
  'record links': [
    paragraph(
      {
        text: 'resolved',
        link: { collection: 'Pages', record: PAGE, hash: 'team', href: '/about#team' },
      },
      { text: 'unresolved', link: { collection: 'Pages', record: PAGE, hash: 'team' } },
      { text: 'forged', link: { url: '/a', href: 'javascript:x' } },
    ),
  ],
  'shared anchors': [
    paragraph(
      { text: 'a', marks: ['strong'], link: { url: '/a' } },
      { text: 'b', link: { url: '/a' } },
      { text: 'c', link: { url: '/a', newTab: true } },
      { text: 'd' },
      { text: 'e', link: { url: '/a' } },
      { text: 'f', link: { collection: 'Pages', record: PAGE, href: '/f' } },
      { text: 'g', link: { record: PAGE, collection: 'Pages', href: '/f' } },
    ),
  ],
  'nested lists': [list(1, 4), list(1, 5)],
  'malformed nodes': [
    null,
    'x',
    1,
    [],
    {},
    { kind: 'aside', content: [{ text: 'a' }] },
    { kind: 'heading', level: 7, content: [{ text: 'b' }] },
    { kind: 'heading', level: '2', content: [{ text: 'c' }] },
    { kind: 'heading', content: [{ text: 'd' }] },
    { kind: 'paragraph', content: 'e' },
    { kind: 'paragraph', content: [null, 'f', { text: 1 }, { marks: ['em'] }, { text: 'g' }] },
    { kind: 'list', ordered: 'yes', items: [{ content: [{ text: 'h' }] }] },
    { kind: 'list', ordered: true, items: 'i' },
    { kind: 'list', ordered: false, items: [null, 'j', { content: [{ text: 'k' }] }] },
    {
      kind: 'list',
      ordered: false,
      items: [
        {
          content: [{ text: 'l' }],
          list: { kind: 'aside', items: [{ content: [{ text: 'm' }] }] },
        },
        { content: [{ text: 'n' }], list: { items: [{ content: [{ text: 'o' }] }] } },
      ],
    },
    paragraph(
      { text: 'p', marks: 'strong' as never },
      { text: 'q', marks: ['u', 1, 'em'] as never },
      { text: 'r', link: 'https://x.y' as never },
      { text: 's', link: { url: 1 } as never },
      { text: 't', link: { url: '/t', newTab: 'yes' } as never },
      { text: 'u', link: { collection: 'Pages' } as never },
      { text: 'v', link: null as never },
    ),
  ],
};

type Random = () => number;

function mulberry32(seed: number): Random {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rnd: Random, items: readonly T[]): T {
  return items[Math.floor(rnd() * items.length)] as T;
}

function chance(rnd: Random, probability: number): boolean {
  return rnd() < probability;
}

function times<T>(rnd: Random, max: number, make: () => T): T[] {
  return Array.from({ length: Math.floor(rnd() * (max + 1)) }, make);
}

const MARKS = ['strong', 'em', 'del', 'code', 'u', 1, null];
const GARBAGE = [null, 1, 'x', [], {}, { kind: 'aside', content: [{ text: '<' }] }];

function genLink(rnd: Random): unknown {
  if (chance(rnd, 0.2)) return pick(rnd, [null, 'x', 1, { url: 1 }, { collection: 'Pages' }]);
  const newTab = chance(rnd, 0.4) ? { newTab: pick(rnd, [true, false, 'yes']) } : {};
  const href = chance(rnd, 0.8) ? { href: pick(rnd, HREFS) } : {};
  if (chance(rnd, 0.5)) return { url: pick(rnd, HREFS), ...href, ...newTab };
  return { collection: 'Pages', record: PAGE, ...href, ...newTab };
}

function genRun(rnd: Random): unknown {
  if (chance(rnd, 0.1)) return pick(rnd, GARBAGE);
  const marks = chance(rnd, 0.1) ? 'strong' : times(rnd, 3, () => pick(rnd, MARKS));
  return {
    text: chance(rnd, 0.05) ? 1 : pick(rnd, TEXTS),
    ...(chance(rnd, 0.5) ? { marks } : {}),
    ...(chance(rnd, 0.5) ? { link: genLink(rnd) } : {}),
  };
}

function genContent(rnd: Random): unknown {
  return chance(rnd, 0.05) ? pick(rnd, GARBAGE) : times(rnd, 4, () => genRun(rnd));
}

function genList(rnd: Random, depth: number): unknown {
  const item = (): unknown =>
    chance(rnd, 0.1)
      ? pick(rnd, GARBAGE)
      : {
          content: genContent(rnd),
          ...(depth < 6 && chance(rnd, 0.5) ? { list: genList(rnd, depth + 1) } : {}),
        };
  return {
    kind: 'list',
    ordered: pick(rnd, [true, false, 'x']),
    items: chance(rnd, 0.05) ? 'x' : times(rnd, 3, item),
  };
}

function genBlock(rnd: Random): unknown {
  switch (pick(rnd, ['paragraph', 'heading', 'quote', 'list', 'garbage'])) {
    case 'paragraph':
      return { kind: 'paragraph', content: genContent(rnd) };
    case 'heading':
      return {
        kind: 'heading',
        level: pick(rnd, [2, 3, 4, 5, 6, 1, 7, 'x']),
        content: genContent(rnd),
      };
    case 'quote':
      return { kind: 'quote', content: genContent(rnd) };
    case 'list':
      return genList(rnd, 1);
    default:
      return pick(rnd, GARBAGE);
  }
}

function genDocument(rnd: Random): unknown {
  return chance(rnd, 0.05) ? pick(rnd, GARBAGE) : times(rnd, 6, () => genBlock(rnd));
}

/**
 * Renders `value` through both renderers, in both modes, and asserts the bytes match.
 * Returns the block-mode HTML, so a caller can check the corpus rendered something.
 */
function matchesOracle(value: unknown, name: string): string {
  const html = richTextToHTML(value as RichText);
  strictEqual(html, oracle(value), name);
  strictEqual(
    richTextToHTML(value as RichText, { inline: true }),
    oracle(value, { inline: true }),
    name,
  );
  return html;
}

describe('richTextToHTML', () => {
  it('mirrors the `ohnejs/utils` types exactly', () => {
    ok(MIRRORED.every((same) => same));
  });

  it("renders `null` and `undefined` as `''`", () => {
    for (const value of [null, undefined]) {
      strictEqual(richTextToHTML(value), '');
      strictEqual(richTextToHTML(value, { inline: true }), '');
    }
  });

  for (const [name, value] of Object.entries(CORPUS)) {
    it(`renders ${name} as \`ohnejs/utils\` does`, () => {
      matchesOracle(value, name);
    });
  }

  it('renders the corpus with links, marks and escaped text', () => {
    const html = Object.values(CORPUS)
      .map((value) => richTextToHTML(value as RichText))
      .join('');
    ok(html.includes('<a href="/a" target="_blank" rel="noopener noreferrer">'));
    ok(html.includes('<strong><em><del><code>e</code></del></em></strong>'));
    ok(html.includes('&lt;script&gt;'));
    ok(html.includes('&apos;'));
    ok(!html.includes('href="javascript:'));
  });

  it('renders 200 seeded documents as `ohnejs/utils` does', () => {
    const rnd = mulberry32(2026);
    let rendered = 0;
    for (let i = 0; i < 200; i++) {
      rendered += matchesOracle(genDocument(rnd), `document ${i}`).length;
    }
    ok(rendered > 0);
  });
});
