/** @import { ConnectOptions, Ohne, OhneOptions, Preview, Resolved } from './index.d.ts' */

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
     * @returns {Promise<Resolved>}
     */
    async resolve(path) {
      const query = new URLSearchParams({ path });
      const response = await send(`${api}/cms/routes/resolve?${query}`, options.fetchInit);
      if (!response.ok) throw new Error(`ohne answered ${response.status} resolving ${path}`);
      return /** @type {Promise<Resolved>} */ (response.json());
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
    if (!disposed) inner = module.connect({ onRefresh: options.onRefresh });
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
