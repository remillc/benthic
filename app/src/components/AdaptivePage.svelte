<script>
  // @ts-check
  // Adaptive page (docs/system-design.md, section 7): one route that chooses its layout from the
  // window width. Crossing the desktop breakpoint swaps the page's content; it never navigates.
  // The route keeps one page element for Framework7: the new page takes over the old one's place
  // in the router (position, role, page object), so going forward and back still work.
  import { onMount, tick, untrack } from 'svelte';
  import { layout } from '../lib/layout.svelte.js';

  /**
   * `toWide` and `toNarrow`: what the page hands over when the layout changes (lib/adaptive-handoff.js),
   * called with the view's router once the new layout is in place.
   * @type {{ wide: any, narrow: any, wideProps?: object, narrowProps?: object, toWide?: (router: any) => void, toNarrow?: (router: any) => void, f7router?: any, f7route?: any, [key: string]: any }}
   */
  let { wide, narrow, wideProps = {}, narrowProps = {}, toWide = undefined, toNarrow = undefined, ...rest } = $props();
  const Wide = $derived(wide);
  const Narrow = $derived(narrow);

  /** The route's path, read once: the route a page object holds may change when the view moves around it. */
  const ownPath = untrack(() => rest.f7route?.route?.path);

  /** The `.page` elements of the route's view that belong to this route. */
  function ownPages() {
    const router = rest.f7router;
    if (!router?.el) return [];
    return /** @type {HTMLElement[]} */ ([...router.el.children]).filter((el) => el.classList.contains('page') && /** @type {any} */ (el).f7Page?.route?.route?.path === ownPath);
  }

  /** The page element and its Framework7 data before the swap. */
  let before = /** @type {{ el: HTMLElement, f7Page: any }|null} */ (null);
  let shown = layout.desktop;
  /** The last page seen: after a router move inside the view the page may already be replaced when the layout changes. */
  let known = /** @type {{ el: HTMLElement, f7Page: any }|null} */ (null);
  function remember() {
    const el = ownPages()[0];
    if (el && /** @type {any} */ (el).f7Page) known = { el, f7Page: /** @type {any} */ (el).f7Page };
  }
  onMount(() => void tick().then(remember));

  $effect.pre(() => {
    const wideNow = layout.desktop;
    untrack(() => {
      if (wideNow === shown) return;
      const el = ownPages()[0];
      before = el ? { el, f7Page: /** @type {any} */ (el).f7Page } : known;
    });
  });

  $effect(() => {
    const wideNow = layout.desktop;
    if (wideNow === shown) return;
    shown = wideNow;
    const old = before;
    before = null;
    const handOver = wideNow ? toWide : toNarrow;
    tick().then(async () => {
      if (old) adopt(old);
      // Framework7 settles the new page (its own page events) before a navigation may start from it.
      await new Promise((resolve) => setTimeout(resolve, 100));
      // Once the new layout's page is in place: the selection and the open item cross over.
      try {
        handOver?.(rest.f7router);
      } catch (e) {
        console.error('Adaptive page hand-over', e);
      }
      remember();
    });
  });

  /** @param {{ el: HTMLElement, f7Page: any }} old */
  function adopt(old) {
    const router = rest.f7router;
    const app = router?.app;
    if (!router?.el || !app) return;
    const el = /** @type {HTMLElement|undefined} */ ([...router.el.children].find((child) => child.classList.contains('page') && !(/** @type {any} */ (child).f7Page)));
    // Framework7 may have moved the old page out of the range Svelte removes: it goes now.
    if (old.el.isConnected) old.el.remove();
    // The page left behind is not used again, but Framework7's page objects and the browser's own tables may still point
    // at one of its nodes; emptied, it keeps a shell instead of the whole layout (a page of the other layout is thousands of nodes).
    old.el.replaceChildren();
    if (!el) return;
    const dom = app.$;
    const f7Page = old.f7Page;
    f7Page.el = el;
    f7Page.$el = dom(el);
    /** @type {any} */ (el).f7Page = f7Page;
    if (router.currentPageEl === old.el) router.currentPageEl = el;
    if (router.currentPage?.[0] === old.el) router.currentPage = dom(el);
    const position = ['current', 'previous', 'next'].find((p) => old.el.classList.contains(`page-${p}`)) || 'current';
    router.setPagePosition(dom(el), position);
    if (old.el.classList.contains('page-master')) {
      dom(el).addClass('page-master');
      dom(el).trigger('page:role', { role: 'master' });
    }
    // The new page is in: its own « after in » work (a tablet's overview shows its first subpage).
    if (position === 'current') app.emit('pageAfterIn', f7Page);
    // The view's component list keeps the element it removes the page by.
    const views = /** @type {any} */ (app).f7routers?.views;
    views?.forEach((/** @type {any} */ data) => {
      if (data.el === router.el) data.pages?.forEach((/** @type {any} */ p) => p.el === old.el && (p.el = el));
    });
  }
</script>

{#if layout.desktop}<Wide {...rest} {...wideProps} />{:else}<Narrow {...rest} {...narrowProps} />{/if}
