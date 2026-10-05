/** @import { Ohne, OhneOptions, Resolved, ResolveOptions } from './index.d.ts' */

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
      if (resolveOptions.locale !== undefined) query.set('locale', resolveOptions.locale);
      const response = await send(`${api}/cms/routes/resolve?${query}`, options.fetchInit);
      if (!response.ok) throw new Error(`ohne answered ${response.status} resolving ${path}`);
      return /** @type {Promise<Resolved>} */ (response.json());
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
