# @ohnejs/client

Reads the pages of an [ohne](https://ohne.dev) CMS from any website: Nuxt, Next, React, Svelte,
Astro, or plain HTML. It has no dependencies and runs wherever `fetch` does.

It is in early development and not ready to install yet.

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

## Webhooks

`verifyWebhook(request, secret)` checks a webhook the cms sent and answers its event, or `null`.

## Recipes

The [cms README](https://github.com/ohnejs/cms#recipes) shows the whole loop for Nuxt, Next, React,
and a plain server.
