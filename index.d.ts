/**
 * Options for `createOhne`.
 */
export interface OhneOptions {
  /**
   * The origin of the ohne API, like `'https://api.example.com'`.
   */
  api: string;

  /**
   * The `fetch` to send requests with, like a framework's own.
   *
   * @default
   * globalThis.fetch
   */
  fetch?: typeof fetch;

  /**
   * Extra options merged into every request, like Next's `{ next: { tags: ['ohne'] } }`.
   */
  fetchInit?: RequestInit & Record<string, unknown>;
}

/**
 * Options for `Ohne.resolve`.
 */
export interface ResolveOptions {
  /**
   * The locale to read the page in.
   * Omitted, the path's locale prefix decides, then the default locale.
   */
  locale?: string;
}

/**
 * A page the path names: the record a route pattern matched, read as a public visitor reads it.
 */
export interface ResolvedPage {
  /**
   * Marks a page.
   */
  kind: 'page';

  /**
   * The collection the route pattern belongs to.
   */
  collection: string;

  /**
   * The record's `UUID`.
   */
  UUID: string;

  /**
   * The locale the record was read in.
   */
  locale: string;

  /**
   * The canonical path of the record in that locale.
   */
  path: string;

  /**
   * The record, with the relations inside its blocks loaded and upload URLs absolute.
   * Each block reads as `{ block, UUID, fields }`.
   */
  record: Record<string, unknown>;
}

/**
 * A path no page answers.
 */
export interface ResolvedNotFound {
  /**
   * Marks a path no page answers.
   */
  kind: 'notFound';
}

/**
 * What a path resolves to.
 */
export type Resolved = ResolvedPage | ResolvedNotFound;

/**
 * A client of one ohne API.
 */
export interface Ohne {
  /**
   * Resolves a site path, like `'/blog/hello'`, to the page it names.
   * A missing page resolves `{ kind: 'notFound' }`; only a failed request throws.
   */
  resolve(path: string, options?: ResolveOptions): Promise<Resolved>;
}

/**
 * Creates a client of the ohne API at `options.api`.
 *
 * @example
 * ```ts
 * const ohne = createOhne({ api: 'http://localhost:4000' })
 *
 * await ohne.resolve('/blog/hello') // -> { kind: 'page', collection: 'Posts', record: { ... }, ... }
 * await ohne.resolve('/nope')       // -> { kind: 'notFound' }
 * ```
 */
export function createOhne(options: OhneOptions): Ohne;

/**
 * Escapes a value for HTML text or a quoted attribute.
 * `null` and `undefined` become `''`.
 *
 * @example
 * ```ts
 * escapeHTML('<b>"hi"</b>') // -> '&lt;b&gt;&quot;hi&quot;&lt;/b&gt;'
 * escapeHTML(undefined)     // -> ''
 * ```
 */
export function escapeHTML(value: unknown): string;
