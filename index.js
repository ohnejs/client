/** @import { ConnectOptions, Ohne, OhneOptions, Preview, Resolved, ResolveOptions, WebhookEvent } from './index.d.ts' */

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
    if (!disposed) inner = module.connect({ onRefresh: options.onRefresh, onData: options.onData });
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
  "'": '&#39;',
});

/**
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ENTITIES[char] ?? char);
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
