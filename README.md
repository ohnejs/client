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
import { richTextToHTML, type RichText } from '@ohnejs/client';

const html = richTextToHTML(page.record.body as RichText);
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
