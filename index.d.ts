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
   * The preview token of the editor framing the page, from `Ohne.token`.
   * It lays the editor's unsaved changes over the page; an unknown or expired token is ignored.
   */
  token?: string;
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
   * Each block reads as `{ block, UUID, fields }`; a related page carries its `path`.
   */
  record: Record<string, unknown>;

  /**
   * What the page's `<head>` says, from its own SEO fields and the site's settings.
   */
  seo: SEO;

  /**
   * The page in every locale it has, for `hreflang` links; empty on a site with one locale.
   */
  alternates: { hreflang: string; href: string }[];
}

/**
 * What a page's `<head>` says about it.
 */
export interface SEO {
  /**
   * The full title, through the site's title template.
   */
  title: string;

  /**
   * The page's description, or the site's default.
   */
  description?: string;

  /**
   * The share image's URL, the page's or the site's default.
   */
  image?: string;

  /**
   * `'noindex'` when the page or the whole site stays out of search engines.
   */
  robots?: string;

  /**
   * The page's canonical URL, absolute when the cms knows the site's URL.
   */
  canonical: string;
}

/**
 * A path that sends the visitor elsewhere.
 */
export interface ResolvedRedirect {
  /**
   * Marks a redirect.
   */
  kind: 'redirect';

  /**
   * Where to send the visitor: a path on the site, or a full URL.
   */
  to: string;

  /**
   * The HTTP status to answer with.
   */
  code: 301 | 302 | 307 | 308;
}

/**
 * A path no page answers.
 */
export interface ResolvedNotFound {
  /**
   * Marks a path no page answers.
   */
  kind: 'notFound';

  /**
   * The record of the page with the slug `404`, to render with a `404` status, when the site has one.
   */
  page?: Record<string, unknown>;
}

/**
 * What a path resolves to.
 */
export type Resolved = ResolvedPage | ResolvedRedirect | ResolvedNotFound;

/**
 * A client of one ohne API.
 */
export interface Ohne {
  /**
   * Resolves a site path, like `'/blog/hello'` or `'/de/ueber-uns'`, to the page it names.
   * The path's locale prefix picks the locale.
   * A missing page resolves `{ kind: 'notFound' }`; only a failed request throws.
   */
  resolve(path: string, options?: ResolveOptions): Promise<Resolved>;

  /**
   * The preview token a request carries, from its `ohne-preview` query param, or `undefined`.
   * Pass it to `resolve`, and answer with `previewHeaders` while it is set.
   */
  token(request: Request | { url: string } | string): string | undefined;

  /**
   * The headers a page answers with while it shows a preview: never cached, never indexed.
   */
  previewHeaders(): Record<string, string>;

  /**
   * The `<head>` tags of a page as HTML: title, description, share tags, canonical, and `hreflang` links.
   * With a preview token it asks search engines to stay away too.
   */
  renderHead(page: ResolvedPage, options?: { token?: string }): string;

  /**
   * The `<script>` tag that connects a server-rendered page to the editor that frames it.
   * Put it at the end of `<body>`; outside a frame it does nothing.
   * A save in the editor then reloads the page.
   */
  previewScript(): string;
}

/**
 * Options for `connect`.
 */
export interface ConnectOptions {
  /**
   * The origin of the ohne API that serves the preview script.
   */
  api: string;

  /**
   * Shows the page again with the newest unsaved changes, like `router.refresh()` or `refreshNuxtData()`.
   * Omitted, the page refetches itself and swaps its body in.
   */
  onRefresh?: () => void;

  /**
   * Shows a page the editor resolved with the newest unsaved changes, with no fetch.
   * It wins over `onRefresh`, for a page rendered in the browser.
   */
  onData?: (page: Resolved) => void;
}

/**
 * A connection to the editor that frames the page.
 */
export interface Preview {
  /**
   * Disconnects and removes the outlines it draws.
   */
  dispose(): void;
}

/**
 * Connects the page to the ohne editor that frames it, so clicking a block selects it there.
 * Outside a frame, as on the live site, it does nothing.
 * Call it in the browser once the page has rendered, and dispose it on unmount.
 *
 * @example
 * ```ts
 * const preview = connect({ api: 'http://localhost:4000' })
 * preview.dispose()
 * ```
 */
export function connect(options: ConnectOptions): Preview;

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

/**
 * A change the cms told a webhook about.
 */
export interface WebhookEvent {
  /**
   * What happened to the records.
   */
  event: 'create' | 'update' | 'delete';

  /**
   * The collection they belong to, like `Pages`, `Site`, or `Redirects`.
   */
  collection: string;

  /**
   * The `UUID`s of the changed records.
   */
  uuids: string[];

  /**
   * When the change was committed, in epoch milliseconds.
   */
  at: number;
}

/**
 * Checks a webhook request the cms sent, answering its event, or `null` when the signature is wrong or stale.
 * A signature older than five minutes is refused, so a captured request cannot be replayed later.
 *
 * @example
 * ```ts
 * const event = await verifyWebhook(request, process.env.OHNE_WEBHOOK_SECRET!)
 * if (event === null) return new Response(null, { status: 401 })
 * revalidateTag('ohne')
 * ```
 */
export function verifyWebhook(request: Request, secret: string): Promise<WebhookEvent | null>;
