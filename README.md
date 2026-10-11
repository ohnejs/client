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
`alternates` in other locales. `renderHead(page)` turns those into `<head>` tags.

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

## Live preview

In the dashboard's editor your page gets a preview token. Pass it on, and connect in the browser:

```ts
import { connect, createOhne } from '@ohnejs/client';

const ohne = createOhne({ api: 'https://api.example.com' });
const token = ohne.token(location.href);
const page = await ohne.resolve(location.pathname, { token });

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
