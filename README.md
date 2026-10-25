# @ohnejs/client

Reads the pages of an [ohne](https://ohne.dev) CMS from any website: Nuxt, Next, React, Svelte,
Astro, or plain HTML. It has no dependencies and runs wherever `fetch` does.

## Install

```sh
pnpm add @ohnejs/client
```

## Reading a page

```ts
import { createOhne } from '@ohnejs/client';

const ohne = createOhne({ api: 'https://api.example.com' });
const page = await ohne.resolve('/blog/hello');
```

`page.kind` is `page`, `redirect`, or `notFound`. A `page` carries the `record`, its `seo`, and its
`alternates` in other locales. `ohne.renderHead(page)` turns those into `<head>` tags.

Pass the path with its query, as `location.pathname + location.search`, so a redirect that keeps
the query carries it to its target.

## Reading site data

Not everything is a page. A menu, a footer, or a list of posts lives in records you read by
collection name:

```ts
const settings = await ohne.read('Settings');
const post = await ohne.read('Posts', uuid);
const posts = await ohne.list('Posts', { order: ['-publishedAt'], page: 2, perPage: 10 });
```

`read` with only a name reads a singleton, a collection that holds one record. With a `UUID` it
reads that record, or `undefined` when a visitor may not see it. `list` answers one page:
`{ records, total, page, perPage, lastPage }`, 20 records by default and at most 100.

You read as a visitor does, so only what the collection's read access shows comes back. Uploads
carry absolute URLs, and a record with a page carries its `path`.

`list` filters with `where`, in the shape of the URL `where`, and `select` narrows the fields:

```ts
const featured = await ohne.list('Posts', {
  where: { featured: true, views: { atLeast: 100 } },
  select: ['title', 'image'],
  locale: 'de',
});
```

`UUID` and `path` come whatever `select` says.

## Forms

A contact form, a newsletter sign-up, or a comment stores a record as a visitor:

```ts
const result = await ohne.create('Messages', { name, email, message });

if (!result.ok) showErrors(result.message, result.errors);
```

It works for a collection whose create is public. A refusal the visitor can fix, like an invalid
email or a failed spam check, resolves with the API's `message` and a message per field in `errors`.
Any other failure throws. A spam check's token travels as a header:
`ohne.create('Messages', input, { headers: { 'recaptcha-token': token } })`.

## Types

Your CMS describes its pages in an `ohne.ts` file. Fetch it from the API, or let `ohne dev` keep it
current with the `cms.types` setting:

```sh
curl -fsS https://api.example.com/cms/types.ts -o ohne.ts
```

Pass its `CMS` type to `createOhne`, and checking `page.collection` types `page.record`:

```ts
import { createOhne } from '@ohnejs/client';
import type { CMS } from './ohne.ts';

const ohne = createOhne<CMS>({ api: 'https://api.example.com' });
const page = await ohne.resolve('/about');

if (page.kind === 'page' && page.collection === 'Pages') {
  console.log(page.record.title);
}
```

`CMS` describes everything your CMS resolves; `Page`, `Block`, `Related` and `Upload` name its parts.
It types `read` and `list` too: a collection name, `select`, `order`, and `where` are checked against
`Records`, and the answer narrows to the fields you select. A types file from a cms before `0.4.0`
names no `Records`, so `read` and `list` refuse every name until you fetch it again.

`Creatable` types `create` the same way: a misspelled or missing field fails to compile.

## Live preview

In the dashboard's editor your page gets a preview token. Pass it on, and connect in the browser:

```ts
import { connect, createOhne } from '@ohnejs/client';

const ohne = createOhne({ api: 'https://api.example.com' });
const token = ohne.token(location.href);
const page = await ohne.resolve(location.pathname + location.search, { token });

if (token) connect({ api: 'https://api.example.com', onData: render });
```

`connect` does nothing outside the editor's frame. Without `onData` or `onRefresh`, it fetches the
page again and swaps its `<body>`.

## Rich text

A `richText` field holds a tree of blocks and runs, never HTML. `richTextToHTML` renders it and
escapes every text and address on the way, so nothing in the value can inject markup:

```ts
import { richTextToHTML } from '@ohnejs/client';
import type { Block } from './ohne.ts';

const hero = (fields: Block<'Hero'>['fields']) => richTextToHTML(fields.body);
```

A link to another page carries its `href` when the reader can open that page, and renders as plain
text otherwise. To keep such links inside a client-side router, let `interceptLinks` catch the clicks:

```ts
import { interceptLinks } from '@ohnejs/client';

const dispose = interceptLinks(document, (path) => router.push(path));
```

It leaves alone links to other origins, links that open a new tab, downloads, and clicks with a
modifier key held. Call `dispose` on unmount.

## Webhooks

`verifyWebhook(request, secret)` checks a webhook the cms sent and answers its event, or `null`.

## Docs

[Your website](https://ohne.dev/docs/cms/website) explains reading pages and the live preview.
[Frameworks](https://ohne.dev/docs/cms/frameworks) shows the whole loop for Nuxt, Next, React, and
plain HTML.
