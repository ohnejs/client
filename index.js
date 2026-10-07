/** @import { ConnectOptions, Ohne, OhneOptions, Preview, Resolved, ResolveOptions, RichText, RichTextMark, WebhookEvent } from './index.d.ts' */

/**
 * @param {OhneOptions} options
 * @returns {Ohne}
 */
export function createOhne(options) {
  const api = options.api.replace(/\/+$/, '');
  const send = options.fetch ?? globalThis.fetch;

  return {
    /**
     * @param {string} path
     * @param {ResolveOptions} [resolveOptions]
     * @returns {Promise<Resolved>}
     */
    async resolve(path, resolveOptions = {}) {
      const query = new URLSearchParams({ path });
      const init = options.fetchInit ?? {};
      const headers = new Headers(init.headers);
      if (resolveOptions.token) headers.set('ohne-preview', resolveOptions.token);
      const response = await send(`${api}/cms/routes/resolve?${query}`, { ...init, headers });
      if (!response.ok) throw new Error(`ohne answered ${response.status} resolving ${path}`);
      return /** @type {Promise<Resolved>} */ (response.json());
    },

    token(request) {
      const url = typeof request === 'string' ? request : request.url;
      return new URL(url, 'http://site').searchParams.get('ohne-preview') ?? undefined;
    },

    previewHeaders() {
      return { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' };
    },

    renderHead(page, headOptions = {}) {
      const { seo } = page;
      const tags = [`<title>${escapeHTML(seo.title)}</title>`];
      const meta = (
        /** @type {string} */ key,
        /** @type {string} */ name,
        /** @type {string | undefined} */ value,
      ) => {
        if (value) tags.push(`<meta ${key}="${name}" content="${escapeHTML(value)}">`);
      };
      meta('name', 'description', seo.description);
      meta('property', 'og:title', seo.title);
      meta('property', 'og:description', seo.description);
      meta('property', 'og:image', seo.image);
      meta('name', 'robots', headOptions.token ? 'noindex' : seo.robots);
      tags.push(`<link rel="canonical" href="${escapeHTML(seo.canonical)}">`);
      for (const { hreflang, href } of page.alternates) {
        tags.push(
          `<link rel="alternate" hreflang="${escapeHTML(hreflang)}" href="${escapeHTML(href)}">`,
        );
      }
      return tags.join('');
    },

    previewScript() {
      return `<script type="module" src="${escapeHTML(`${api}/cms/preview.js?auto`)}"></script>`;
    },
  };
}

/**
 * @param {ConnectOptions} options
 * @returns {Preview}
 */
export function connect(options) {
  if (typeof window === 'undefined' || window.parent === window) return { dispose() {} };
  const url = `${options.api.replace(/\/+$/, '')}/cms/preview.js`;
  /** @type {Preview | undefined} */
  let inner;
  let disposed = false;
  void import(/* webpackIgnore: true */ /* @vite-ignore */ url).then((module) => {
    if (disposed) return;
    const { onRefresh, onData, keepToken } = options;
    inner = module.connect({ onRefresh, onData, keepToken });
  });
  return {
    dispose() {
      disposed = true;
      inner?.dispose();
    },
  };
}

const ENTITIES = /** @type {Record<string, string>} */ ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
});

/**
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ENTITIES[char] ?? char);
}

/** @typedef {{ text: string, marks: RichTextMark[], link: unknown }} ReadRun */

const MARKS = /** @type {readonly RichTextMark[]} */ (['strong', 'em', 'del', 'code']);
const LEVELS = [2, 3, 4, 5, 6];
const LEAF_KINDS = new Set(['paragraph', 'heading', 'quote']);
const MAX_LIST_DEPTH = 4;
const NEW_TAB = ' target="_blank" rel="noopener noreferrer"';

/**
 * @param {RichText | null | undefined} value
 * @param {{ inline?: boolean }} [options]
 * @returns {string}
 */
export function richTextToHTML(value, { inline = false } = {}) {
  if (!inline) return Array.isArray(value) ? value.map(renderBlock).join('') : '';
  return leaves(value).map(renderRuns).join('<br>');
}

/**
 * @param {unknown} node
 * @returns {string}
 */
function renderBlock(node) {
  if (!isPlainObject(node)) return '';
  const { kind } = node;
  if (kind === 'list') return renderList(node, 0);
  if (kind === 'paragraph') return `<p>${renderLeaf(node)}</p>`;
  if (kind === 'quote') return `<blockquote><p>${renderLeaf(node)}</p></blockquote>`;
  const level = kind === 'heading' ? LEVELS.find((level) => level === node.level) : undefined;
  return level ? `<h${level}>${renderLeaf(node)}</h${level}>` : '';
}

/**
 * @param {unknown} node
 * @param {number} depth
 * @returns {string}
 */
function renderList(node, depth) {
  const list = readList(node, depth);
  if (!list) return '';
  const tag = list.ordered ? 'ol' : 'ul';
  const items = list.items.map((item) =>
    isPlainObject(item) ? `<li>${renderLeaf(item)}${renderList(item.list, depth + 1)}</li>` : '',
  );
  return `<${tag}>${items.join('')}</${tag}>`;
}

/**
 * @param {Record<string, unknown>} node
 * @returns {string}
 */
function renderLeaf(node) {
  return renderRuns(readRuns(node.content)) || '<br>';
}

/**
 * Groups neighbouring runs with an equal link under one `<a>`.
 *
 * @param {readonly ReadRun[]} runs
 * @returns {string}
 */
function renderRuns(runs) {
  /** @type {{ link: unknown, html: string }[]} */
  const groups = [];
  for (const run of runs) {
    if (run.text === '') continue;
    const last = groups.at(-1);
    if (last && deepEqual(last.link, run.link)) last.html += renderRun(run);
    else groups.push({ link: run.link, html: renderRun(run) });
  }
  return groups.map(({ link, html }) => renderLink(link, html)).join('');
}

/**
 * @param {unknown} link
 * @param {string} html
 * @returns {string}
 */
function renderLink(link, html) {
  if (!isPlainObject(link)) return html;
  const href = link.collection === undefined ? link.url : link.href;
  if (typeof href !== 'string' || !isSafeHref(href)) return html;
  return `<a href="${escapeHTML(href)}"${link.newTab === true ? NEW_TAB : ''}>${html}</a>`;
}

/**
 * @param {ReadRun} run
 * @returns {string}
 */
function renderRun({ text, marks }) {
  return marks.reduceRight(
    (html, mark) => `<${mark}>${html}</${mark}>`,
    escapeHTML(text).replaceAll('\n', '<br>'),
  );
}

/**
 * @param {unknown} content
 * @returns {ReadRun[]}
 */
function readRuns(content) {
  if (!Array.isArray(content)) return [];
  return content.flatMap((run) =>
    isPlainObject(run) && typeof run.text === 'string'
      ? [{ text: run.text, marks: readMarks(run.marks), link: run.link }]
      : [],
  );
}

/**
 * @param {unknown} marks
 * @returns {RichTextMark[]}
 */
function readMarks(marks) {
  return Array.isArray(marks) ? MARKS.filter((mark) => marks.includes(mark)) : [];
}

/**
 * @param {unknown} node
 * @param {number} depth
 * @returns {{ ordered: boolean, items: unknown[] } | undefined}
 */
function readList(node, depth) {
  if (!isPlainObject(node) || node.kind !== 'list' || depth >= MAX_LIST_DEPTH) return undefined;
  if (!Array.isArray(node.items)) return undefined;
  return { ordered: node.ordered === true, items: node.items };
}

/**
 * The runs of each block and list item, in document order.
 *
 * @param {unknown} value
 * @returns {ReadRun[][]}
 */
function leaves(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((block) => {
    if (!isPlainObject(block)) return [];
    if (block.kind === 'list') return listLeaves(block, 0);
    return LEAF_KINDS.has(block.kind) ? [readRuns(block.content)] : [];
  });
}

/**
 * @param {unknown} node
 * @param {number} depth
 * @returns {ReadRun[][]}
 */
function listLeaves(node, depth) {
  const list = readList(node, depth);
  if (!list) return [];
  return list.items.flatMap((item) =>
    isPlainObject(item) ? [readRuns(item.content), ...listLeaves(item.list, depth + 1)] : [],
  );
}

const CONTROL = /\p{Cc}/u;
const ORIGIN = 'http://local.invalid';
const FETCHABLE_SCHEMES = new Set(['http:', 'https:']);
const PLAIN_SCHEMES = new Set(['mailto:', 'tel:']);

/**
 * Whether a browser can neither run `value` as an `href` nor silently rewrite it.
 *
 * @param {string} value
 * @returns {boolean}
 */
function isSafeHref(value) {
  if (value !== value.trim() || CONTROL.test(value)) return false;
  if (value.startsWith('#')) return true;
  if (value.startsWith('/')) return parseURL(value, ORIGIN)?.origin === ORIGIN;
  const url = parseURL(value);
  if (!url) return false;
  if (PLAIN_SCHEMES.has(url.protocol)) return true;
  return FETCHABLE_SCHEMES.has(url.protocol) && url.username === '' && url.password === '';
}

/**
 * `URL.parse` needs a newer Node than `engines` allows.
 *
 * @param {string} value
 * @param {string} [base]
 * @returns {URL | undefined}
 */
function parseURL(value, base) {
  try {
    return new URL(value, base);
  } catch {
    return undefined;
  }
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => deepEqual(value, b[index]));
  }
  if (!isPlainObject(a) || !isPlainObject(b)) return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && deepEqual(a[key], b[key]))
  );
}

/**
 * @param {Element | Document} root
 * @param {(path: string) => void} navigate
 * @returns {() => void}
 */
export function interceptLinks(root, navigate) {
  /** @param {MouseEvent} event */
  const onClick = (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = /** @type {HTMLAnchorElement | null} */ (
      event.target instanceof Element ? event.target.closest('a[href]') : null
    );
    if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;
    const url = new URL(link.href);
    // A `blob:` URL carries the page origin.
    if (url.protocol !== location.protocol || url.origin !== location.origin) return;
    // `url.hash` is `''` for a bare `#`.
    if (url.pathname === location.pathname && url.href.includes('#')) return;
    event.preventDefault();
    navigate(url.pathname + url.search + url.hash);
  };
  root.addEventListener('click', onClick);
  return () => root.removeEventListener('click', onClick);
}

const WEBHOOK_TOLERANCE = 5 * 60;

/**
 * @param {Request} request
 * @param {string} secret
 * @returns {Promise<WebhookEvent | null>}
 */
export async function verifyWebhook(request, secret) {
  const header = request.headers.get('ohne-signature') ?? '';
  const [, t, v1] = /^t=(\d+),v1=([\w-]+)$/.exec(header) ?? [];
  if (!t || !v1 || Math.abs(Date.now() / 1000 - Number(t)) > WEBHOOK_TOLERANCE) return null;
  const body = await request.text();
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const tag = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${body}`)),
  );
  if (!sameText(base64url(tag), v1)) return null;
  return /** @type {WebhookEvent} */ (JSON.parse(body));
}

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Compares in time that does not depend on where the strings differ.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function sameText(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index++) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}
