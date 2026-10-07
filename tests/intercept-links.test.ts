import { deepStrictEqual, strictEqual } from 'node:assert';
import { describe, it } from 'node:test';

import { interceptLinks } from '../index.js';

const PAGE = 'http://site.test/about?tab=team';

/**
 * An element with a tag, attributes and a parent, resolving `href` as a browser does.
 */
class FakeElement {
  readonly tag: string;
  readonly attributes: Record<string, string>;
  readonly parent: FakeElement | undefined;

  constructor(tag: string, attributes: Record<string, string> = {}, parent?: FakeElement) {
    this.tag = tag;
    this.attributes = attributes;
    this.parent = parent;
  }

  get href(): string {
    return new URL(this.attributes.href ?? '', PAGE).href;
  }

  get target(): string {
    return this.attributes.target ?? '';
  }

  hasAttribute(name: string): boolean {
    return name in this.attributes;
  }

  closest(selector: string): FakeElement | null {
    strictEqual(selector, 'a[href]');
    if (this.tag === 'a' && this.hasAttribute('href')) return this;
    return this.parent?.closest(selector) ?? null;
  }
}

interface FakeEvent {
  target: FakeElement;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
  preventDefault(): void;
}

type Listener = (event: FakeEvent) => void;

/**
 * A root that keeps its click listeners and dispatches a click to each.
 */
class FakeRoot {
  listeners: Listener[] = [];

  addEventListener(type: string, listener: Listener): void {
    strictEqual(type, 'click');
    this.listeners.push(listener);
  }

  removeEventListener(type: string, listener: Listener): void {
    strictEqual(type, 'click');
    this.listeners = this.listeners.filter((other) => other !== listener);
  }

  click(target: FakeElement, init: Partial<FakeEvent> = {}): FakeEvent {
    const event: FakeEvent = {
      target,
      button: 0,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      ...init,
    };
    for (const listener of this.listeners) listener(event);
    return event;
  }
}

Object.assign(globalThis, { Element: FakeElement, location: new URL(PAGE) });

/**
 * Intercepts links under a fresh root and reports every navigation and the default of each click.
 */
function setup() {
  const root = new FakeRoot();
  const paths: string[] = [];
  const dispose = interceptLinks(root as unknown as Element, (path) => paths.push(path));
  const click = (link: FakeElement, init?: Partial<FakeEvent>) =>
    root.click(link, init).defaultPrevented;
  return { root, paths, click, dispose };
}

const anchor = (attributes: Record<string, string>) => new FakeElement('a', attributes);

describe('interceptLinks', () => {
  it('routes a click on a link of the same origin through `navigate`', () => {
    const { paths, click } = setup();
    strictEqual(click(anchor({ href: '/blog/hello?x=1#top' })), true);
    strictEqual(click(anchor({ href: 'http://site.test/de/' })), true);
    deepStrictEqual(paths, ['/blog/hello?x=1#top', '/de/']);
  });

  it('finds the link above a nested element', () => {
    const { paths, click } = setup();
    const link = anchor({ href: '/a' });
    strictEqual(click(new FakeElement('em', {}, new FakeElement('span', {}, link))), true);
    deepStrictEqual(paths, ['/a']);
  });

  it('ignores a click outside any link', () => {
    const { paths, click } = setup();
    strictEqual(click(new FakeElement('p')), false);
    strictEqual(click(new FakeElement('a')), false);
    deepStrictEqual(paths, []);
  });

  it('ignores a click the page already handled', () => {
    const { paths, click } = setup();
    strictEqual(click(anchor({ href: '/a' }), { defaultPrevented: true }), true);
    deepStrictEqual(paths, []);
  });

  it('ignores a modifier key or another button', () => {
    const { paths, click } = setup();
    const link = anchor({ href: '/a' });
    for (const init of [
      { metaKey: true },
      { ctrlKey: true },
      { shiftKey: true },
      { altKey: true },
      { button: 1 },
      { button: 2 },
    ]) {
      strictEqual(click(link, init), false, JSON.stringify(init));
    }
    deepStrictEqual(paths, []);
  });

  it('ignores a `target` other than `_self` and a `download`', () => {
    const { paths, click } = setup();
    strictEqual(click(anchor({ href: '/a', target: '_blank' })), false);
    strictEqual(click(anchor({ href: '/a', target: 'frame' })), false);
    strictEqual(click(anchor({ href: '/a', download: '' })), false);
    strictEqual(click(anchor({ href: '/a', target: '_self' })), true);
    deepStrictEqual(paths, ['/a']);
  });

  it('ignores another origin, including one the browser resolves from `/\\evil.com`', () => {
    const { paths, click } = setup();
    strictEqual(click(anchor({ href: 'https://evil.com/a' })), false);
    strictEqual(click(anchor({ href: 'https://site.test/a' })), false);
    strictEqual(click(anchor({ href: '//evil.com/a' })), false);
    strictEqual(click(anchor({ href: '/\\evil.com' })), false);
    strictEqual(click(anchor({ href: 'mailto:a@b.c' })), false);
    deepStrictEqual(paths, []);
  });

  it('ignores a `blob:` link, though it shares the page origin', () => {
    const { paths, click } = setup();
    strictEqual(click(anchor({ href: 'blob:http://site.test/0b6c' })), false);
    deepStrictEqual(paths, []);
  });

  it('ignores a hash on the same path, whatever the query string', () => {
    const { paths, click } = setup();
    strictEqual(click(anchor({ href: '#team' })), false);
    strictEqual(click(anchor({ href: '/about#team' })), false);
    strictEqual(click(anchor({ href: '/about?tab=press#team' })), false);
    strictEqual(click(anchor({ href: '#' })), false);
    strictEqual(click(anchor({ href: '/about#' })), false);
    strictEqual(click(anchor({ href: '/about' })), true);
    strictEqual(click(anchor({ href: '/about/#team' })), true);
    deepStrictEqual(paths, ['/about', '/about/#team']);
  });

  it('stops once disposed', () => {
    const { root, paths, click, dispose } = setup();
    dispose();
    strictEqual(click(anchor({ href: '/a' })), false);
    deepStrictEqual(paths, []);
    deepStrictEqual(root.listeners, []);
  });
});
