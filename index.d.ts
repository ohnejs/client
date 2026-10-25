/**
 * Options for `createOhne`.
 */
export interface OhneOptions {
  /**
   * The origin of the ohne API, like `'https://api.example.com'`.
   * In the browser it may be a path on the site that relays the API, like `'/_ohne'`.
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
   * A preview carries the editor's unsaved values in the shape of a saved page.
   */
  token?: string;
}

/**
 * What a CMS resolves, as the `CMS` type its API generates describes it.
 * It bounds the type parameter of `createOhne`; a site passes its generated `CMS` and never writes one.
 */
export interface Schema {
  /**
   * The version of the type file's shape, so a file from another version fails to compile.
   */
  protocol: 1;

  /**
   * The locales the CMS reads in.
   */
  locale: string;

  /**
   * The record of each routed collection, by collection name.
   */
  pages: object;

  /**
   * The record a path no page answers can show, from the collection routed at `/[...slug]`.
   */
  notFound: object;

  /**
   * Each collection a visitor may read, as `GET /cms/records` answers it.
   * A types file from a cms before `0.4.0` has none, so `read` and `list` refuse every collection.
   */
  records?: object;

  /**
   * The collections in `records` that hold one record.
   */
  singletons?: string;

  /**
   * Each collection a visitor may create a record in, with the fields a create takes.
   * A types file from a cms before `0.4.0` has none, so `create` refuses every collection.
   */
  creatable?: object;
}

/**
 * The `Schema` of a client created without a type: any collection, holding any record.
 * Its optional keys stay optional, so a client typed by an older types file passes as untyped.
 */
export interface UntypedSchema extends Schema {
  /**
   * Any record of any collection.
   */
  pages: Record<string, Record<string, unknown>>;

  /**
   * Any record.
   */
  notFound: Record<string, unknown>;

  /**
   * Any record of any collection.
   */
  records?: Record<string, Record<string, unknown>>;

  /**
   * Any collection.
   */
  singletons?: string;

  /**
   * Any collection, taking any fields.
   */
  creatable?: Record<string, Record<string, unknown>>;
}

/**
 * The singletons of a schema, which `read` takes without a `uuid`.
 */
export type SingletonOf<S extends Schema> = 'singletons' extends keyof S
  ? NonNullable<S['singletons']>
  : never;

/**
 * The collections `list` and `read` by `uuid` take: every one in `records` but the singletons.
 * An untyped client takes any name.
 */
export type CollectionOf<S extends Schema> =
  string extends SingletonOf<S>
    ? string
    : Exclude<keyof NonNullable<S['records']> & string, SingletonOf<S>>;

/**
 * The record of collection `C` as `GET /cms/records` answers it.
 */
export type RecordOf<S extends Schema, C extends string> = C extends keyof NonNullable<S['records']>
  ? NonNullable<S['records']>[C]
  : never;

/**
 * The collections `create` takes: those a visitor may create a record in.
 * An untyped client takes any name.
 */
export type CreatableOf<S extends Schema> = 'creatable' extends keyof S
  ? keyof NonNullable<S['creatable']> & string
  : never;

/**
 * The fields a create of collection `C` takes, as the cms types them.
 */
export type CreateInputOf<S extends Schema, C extends string> = C extends keyof NonNullable<
  S['creatable']
>
  ? NonNullable<S['creatable']>[C]
  : never;

/**
 * The fields `select` names, with `UUID` and `path`, which always come.
 */
export type Picked<R, K extends string> = Pick<R, Extract<K | 'UUID' | 'path', keyof R>>;

/**
 * A condition in the shape of the URL `where`, like `{ featured: true }` or `{ views: { atLeast: 10 } }`.
 * The collection's read access is added with AND, so a condition never widens it.
 */
export type Where<R> = { [F in keyof R & string]?: NonNullable<R[F]> | Record<string, unknown> } & {
  /**
   * Conditions that must all hold.
   */
  and?: Where<R>[];

  /**
   * Conditions of which at least one must hold.
   */
  or?: Where<R>[];
};

/**
 * A field to order by, with a leading `-` for descending, like `'-publishedAt'`.
 */
export type Order<R> = `${'' | '-'}${keyof R & string}`;

/**
 * Options for `Ohne.read`.
 */
export interface ReadOptions<S extends Schema = UntypedSchema, K extends string = string> {
  /**
   * The locale to read in.
   * Omitted means the cms's default locale.
   */
  locale?: S['locale'];

  /**
   * The fields to read, beside `UUID` and `path`.
   * Omitted reads every field.
   */
  select?: readonly K[];
}

/**
 * Options for `Ohne.list`.
 */
export interface ListOptions<
  S extends Schema = UntypedSchema,
  R = Record<string, unknown>,
  K extends string = string,
> extends ReadOptions<S, K> {
  /**
   * The records to keep.
   */
  where?: Where<R>;

  /**
   * The fields to order by, first one first.
   */
  order?: readonly Order<R>[];

  /**
   * The page to read, from `1`.
   *
   * @default
   * 1
   */
  page?: number;

  /**
   * Records per page, at most `100`.
   *
   * @default
   * 20
   */
  perPage?: number;
}

/**
 * One page of a list, with what a pager needs.
 */
export interface RecordPage<R> {
  /**
   * The page's records.
   */
  records: R[];

  /**
   * How many records the whole list holds.
   */
  total: number;

  /**
   * The page read, from `1`.
   */
  page: number;

  /**
   * Records per page.
   */
  perPage: number;

  /**
   * The last page's number, at least `1` even when nothing matches.
   */
  lastPage: number;
}

/**
 * Options for `Ohne.create`.
 */
export interface CreateOptions {
  /**
   * Headers the API's middleware reads, like the `recaptcha-token` a spam check asks for.
   * They win over `fetchInit`'s, except `content-type`, which is always JSON.
   */
  headers?: HeadersInit;
}

/**
 * A create the API stored.
 */
export interface Created {
  /**
   * Marks a stored create.
   */
  ok: true;

  /**
   * The new record's `UUID`, unless the create's `access` leaves it out of its `select`.
   */
  UUID?: string;
}

/**
 * A create the API refused because of the visitor's input or standing, with what to tell them.
 */
export interface Refused {
  /**
   * Marks a refused create.
   */
  ok: false;

  /**
   * Why: `422` an invalid field, `403` a middleware's refusal like a failed spam check, `429` too many.
   * `401` asks for a sign-in, and `413` a smaller body.
   */
  status: 401 | 403 | 413 | 422 | 429;

  /**
   * The API's message for the whole create, like `'The spam check failed. Please try again.'`.
   * It is `''` when the refusal carries none.
   */
  message: string;

  /**
   * A message for each invalid field, keyed by its path, like `email` or `items[0].name`.
   * It is empty unless `status` is `422`.
   */
  errors: Partial<Record<string, string>>;
}

/**
 * What `Ohne.create` answers.
 */
export type CreateResult = Created | Refused;

/**
 * A page the path names: the record a route pattern matched, read as a public visitor reads it.
 * Under a generated `CMS`, checking `collection` narrows `record` to that collection's shape.
 */
export type ResolvedPage<S extends Schema = UntypedSchema> =
  // Distributing over `S` lets a typed client pass where an untyped `Ohne` is expected.
  S extends S
    ? {
        [C in keyof S['pages'] & string]: {
          /**
           * Marks a page.
           */
          kind: 'page';

          /**
           * The collection the route pattern belongs to.
           */
          collection: C;

          /**
           * The record's `UUID`.
           */
          UUID: string;

          /**
           * The locale the record was read in.
           */
          locale: S['locale'];

          /**
           * The canonical path of the record in that locale.
           */
          path: string;

          /**
           * The record, with the relations inside its blocks loaded and upload URLs absolute.
           * Each block reads as `{ block, UUID, fields }`; a related page carries its `path`.
           * A record link in a rich text or link value carries `href` when the reader can open its page.
           */
          record: S['pages'][C];

          /**
           * What the page's `<head>` says, from its own SEO fields and the site's settings.
           */
          seo: SEO;

          /**
           * The page in every locale it has, for `hreflang` links; empty on a site with one locale.
           */
          alternates: Alternate<S['locale']>[];
        };
      }[keyof S['pages'] & string]
    : never;

/**
 * The page in another locale, for an `hreflang` link.
 */
export interface Alternate<L extends string = string> {
  /**
   * The page's locale, or `'x-default'` for the default locale's page.
   */
  hreflang: L | 'x-default';

  /**
   * The page's URL in that locale.
   */
  href: string;
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
export interface ResolvedNotFound<S extends Schema = UntypedSchema> {
  /**
   * Marks a path no page answers.
   */
  kind: 'notFound';

  /**
   * The record of the page with the slug `404`, to render with a `404` status, when the site has one.
   */
  page?: S['notFound'];
}

/**
 * What a path resolves to.
 */
export type Resolved<S extends Schema = UntypedSchema> =
  | ResolvedPage<S>
  | ResolvedRedirect
  | ResolvedNotFound<S>;

/**
 * A client of one ohne API.
 * `S` is the `CMS` type the API generates, which types each page by its collection.
 */
export interface Ohne<S extends Schema = UntypedSchema> {
  /**
   * Resolves a site path, like `'/blog/hello'` or `'/de/ueber-uns'`, to the page it names.
   * The path's locale prefix picks the locale.
   * Pass the query along, as `'/old?ref=x'`: a redirect that keeps the query carries it to its target.
   * A missing page resolves `{ kind: 'notFound' }`; only a failed request throws.
   */
  resolve(path: string, options?: ResolveOptions): Promise<Resolved<S>>;

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
  renderHead(page: { seo: SEO; alternates: Alternate[] }, options?: { token?: string }): string;

  /**
   * The `<script>` tag that connects a server-rendered page to the editor that frames it.
   * Put it at the end of `<body>`; outside a frame it does nothing.
   * A save in the editor then reloads the page.
   */
  previewScript(): string;

  /**
   * Reads a singleton's record, like the site's `Settings`, as a visitor reads it.
   * A failed request throws, as `resolve` does.
   */
  read<
    C extends SingletonOf<S>,
    K extends keyof RecordOf<S, C> & string = keyof RecordOf<S, C> & string,
  >(
    collection: C,
    options?: ReadOptions<S, K>,
  ): Promise<Picked<RecordOf<S, C>, K>>;

  /**
   * Reads one record by its `UUID`, or `undefined` when a visitor may not see it.
   */
  read<
    C extends CollectionOf<S>,
    K extends keyof RecordOf<S, C> & string = keyof RecordOf<S, C> & string,
  >(
    collection: C,
    uuid: string,
    options?: ReadOptions<S, K>,
  ): Promise<Picked<RecordOf<S, C>, K> | undefined>;

  /**
   * Reads one page of a collection's records, as a visitor reads them.
   */
  list<
    C extends CollectionOf<S>,
    K extends keyof RecordOf<S, C> & string = keyof RecordOf<S, C> & string,
  >(
    collection: C,
    options?: ListOptions<S, RecordOf<S, C>, K>,
  ): Promise<RecordPage<Picked<RecordOf<S, C>, K>>>;

  /**
   * Creates a record as a visitor, like a message from a contact form.
   * It resolves `{ ok: false }` with the API's messages when the API refuses the visitor's input or standing.
   * Any other failure throws, as `resolve` does: a collection a visitor may not create in, a down API.
   */
  create<C extends CreatableOf<S>>(
    collection: C,
    input: CreateInputOf<S, C>,
    options?: CreateOptions,
  ): Promise<CreateResult>;
}

/**
 * Options for `connect`.
 */
export interface ConnectOptions<S extends Schema = UntypedSchema> {
  /**
   * The origin of the ohne API, like `'https://api.example.com'`.
   * In the browser it may be a path on the site that relays the API, like `'/_ohne'`.
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
   * A preview carries the editor's unsaved values in the shape of a saved page.
   */
  onData?: (page: Resolved<S>) => void;

  /**
   * Leaves the preview token in the address bar, for a framework that renders again from the URL on the server.
   * Next's `router.refresh()` needs it; a page that keeps the token itself, as Nuxt's `useState`, does not.
   *
   * @default
   * false
   */
  keepToken?: boolean;
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
export function connect<S extends Schema = UntypedSchema>(options: ConnectOptions<S>): Preview;

/**
 * Creates a client of the ohne API at `options.api`.
 * Pass the `CMS` type the API generates, as `createOhne<CMS>`, to type each page by its collection.
 *
 * @example
 * ```ts
 * const ohne = createOhne<CMS>({ api: 'http://localhost:4000' })
 *
 * await ohne.resolve('/blog/hello') // -> { kind: 'page', collection: 'Posts', record: { ... }, ... }
 * await ohne.resolve('/old?ref=x')  // -> { kind: 'redirect', to: '/new?ref=x', code: 301 }
 * await ohne.resolve('/nope')       // -> { kind: 'notFound' }
 *
 * await ohne.read('Settings')           // -> { UUID: 's1', menu: [...], copyright: 'Acme' }
 * await ohne.read('Posts', uuid)        // -> { UUID: uuid, path: '/blog/hello', title: 'Hello', ... }
 * await ohne.list('Posts', { page: 2 }) // -> { records: [...], total: 23, page: 2, perPage: 20, ... }
 *
 * await ohne.create('Messages', { email, message })         // -> { ok: true, UUID: 'm1' }
 * await ohne.create('Messages', { email: 'nope', message }) // -> { ok: false, status: 422, ... }
 * ```
 */
export function createOhne<S extends Schema = UntypedSchema>(options: OhneOptions): Ohne<S>;

/**
 * Escapes a value for HTML text or a quoted attribute.
 * `null` and `undefined` become `''`.
 *
 * @example
 * ```ts
 * escapeHTML('<b>"hi"</b>') // -> '&lt;b&gt;&quot;hi&quot;&lt;/b&gt;'
 * escapeHTML("it's")        // -> 'it&apos;s'
 * escapeHTML(undefined)     // -> ''
 * ```
 */
export function escapeHTML(value: unknown): string;

/**
 * An inline formatting mark, named by its HTML element.
 */
export type RichTextMark = 'strong' | 'em' | 'del' | 'code';

/**
 * A heading level, from `h2` to `h6`.
 */
export type RichTextHeadingLevel = 2 | 3 | 4 | 5 | 6;

/**
 * A link to a record, which follows the record wherever it lives.
 * `C` narrows the collections a link may point into.
 */
export interface RecordLink<C extends string = string> {
  /**
   * The collection that holds the target record.
   */
  collection: C;

  /**
   * The target record's `UUID`.
   */
  record: string;

  /**
   * A fragment on the target's page, without the leading `#`.
   */
  hash?: string;

  /**
   * Whether the link opens in a new tab.
   *
   * @default
   * false
   */
  newTab?: boolean;

  /**
   * The target's path for the current reader, set when the reader can open its page.
   * Without it, `richTextToHTML` renders the linked text as text.
   */
  href?: string;
}

/**
 * A link to an address: a web, email or phone address, a local `/path` or a `#fragment`.
 */
export interface URLLink {
  /**
   * The address the link opens.
   */
  url: string;

  /**
   * Whether the link opens in a new tab.
   *
   * @default
   * false
   */
  newTab?: boolean;
}

/**
 * A link to a record or to an address, as a `link` field holds it.
 * A `collection` key makes it a `RecordLink`, and a `url` key a `URLLink`.
 */
export type Link<C extends string = string> = RecordLink<C> | URLLink;

/**
 * A stretch of text that shares one set of marks and at most one link.
 */
export interface RichTextRun<C extends string = string> {
  /**
   * The text, where `\n` is a line break.
   */
  text: string;

  /**
   * The marks on the text, from outer to inner.
   *
   * @default
   * []
   */
  marks?: RichTextMark[];

  /**
   * The link the text opens.
   */
  link?: Link<C>;
}

/**
 * A paragraph of runs.
 */
export interface RichTextParagraph<C extends string = string> {
  /**
   * The block's kind.
   */
  kind: 'paragraph';

  /**
   * The paragraph's runs.
   */
  content: RichTextRun<C>[];
}

/**
 * A heading of runs.
 */
export interface RichTextHeading<C extends string = string> {
  /**
   * The block's kind.
   */
  kind: 'heading';

  /**
   * The heading level, so `2` renders as `h2`.
   */
  level: RichTextHeadingLevel;

  /**
   * The heading's runs.
   */
  content: RichTextRun<C>[];
}

/**
 * A quote of runs.
 * A quote with several lines separates them with `\n`.
 */
export interface RichTextQuote<C extends string = string> {
  /**
   * The block's kind.
   */
  kind: 'quote';

  /**
   * The quote's runs.
   */
  content: RichTextRun<C>[];
}

/**
 * A bulleted or numbered list.
 */
export interface RichTextList<C extends string = string> {
  /**
   * The block's kind.
   */
  kind: 'list';

  /**
   * Whether the list is numbered.
   */
  ordered: boolean;

  /**
   * The list's items.
   */
  items: RichTextListItem<C>[];
}

/**
 * A list item: its runs, then an optional nested list.
 */
export interface RichTextListItem<C extends string = string> {
  /**
   * The item's runs.
   */
  content: RichTextRun<C>[];

  /**
   * A list nested under the item.
   */
  list?: RichTextList<C>;
}

/**
 * A top-level block of a rich text value.
 */
export type RichTextBlock<C extends string = string> =
  | RichTextParagraph<C>
  | RichTextHeading<C>
  | RichTextQuote<C>
  | RichTextList<C>;

/**
 * A rich text value, as a `richText` field holds it: a list of blocks, where `[]` is empty.
 */
export type RichText<C extends string = string> = RichTextBlock<C>[];

/**
 * Renders a rich text value as HTML, with no whitespace between tags.
 * Text and link addresses are escaped, so nothing in the value can inject markup.
 * `null` and `undefined` render as `''`.
 * A link renders as an `<a>` when its address is one a browser cannot run, and as text otherwise.
 * A record link renders as an `<a>` only with an `href`, which the cms sets when the reader can open its page.
 * Under `inline`, block tags are dropped and each block boundary becomes a `<br>`.
 *
 * @example
 * ```ts
 * richTextToHTML([
 *   { kind: 'heading', level: 2, content: [{ text: 'Hi' }] },
 *   { kind: 'paragraph', content: [{ text: 'a & ', marks: ['em'] }, { text: 'b', link: { url: '/b' } }] },
 * ])
 * // -> '<h2>Hi</h2><p><em>a &amp; </em><a href="/b">b</a></p>'
 *
 * richTextToHTML([{ kind: 'paragraph', content: [{ text: 'a\nb' }] }], { inline: true })
 * // -> 'a<br>b'
 * ```
 */
export function richTextToHTML(
  value: RichText | null | undefined,
  options?: { inline?: boolean },
): string;

/**
 * The address a link value opens, or `undefined` when a browser may not follow it.
 * A `URLLink` answers its `url`, and a `RecordLink` its `href`, set when the reader can open the page.
 * An address a browser could run or rewrite, like `javascript:` or `//host`, answers `undefined`.
 *
 * @example
 * ```ts
 * linkHref({ url: '/about', newTab: true })                     // -> '/about'
 * linkHref({ collection: 'Pages', record: '01a1', href: '/b' }) // -> '/b'
 * linkHref({ collection: 'Pages', record: '01a1' })             // -> undefined
 * linkHref({ url: 'javascript:alert(1)' })                      // -> undefined
 * linkHref(undefined)                                           // -> undefined
 * ```
 */
export function linkHref(link: Link | null | undefined): string | undefined;

/**
 * Routes clicks on the links under `root` through `navigate`, so a record link stays inside the app.
 * It passes `navigate` the path of a link on the page's own origin, with its query string and hash.
 * A click the page already handled, or one with a modifier key held or another button, goes untouched.
 * So does a link to another origin, a `download`, a `target` other than `_self`, and a hash on the same path.
 * It returns a function that stops intercepting.
 *
 * @example
 * ```ts
 * const dispose = interceptLinks(document, (path) => router.push(path))
 * dispose()
 * ```
 */
export function interceptLinks(
  root: Element | Document,
  navigate: (path: string) => void,
): () => void;

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
