/** @import { ConnectOptions, Ohne, OhneOptions, Preview, Resolved, ResolveOptions } from './index.d.ts' */

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
