<script>
  // @ts-check
  // Adaptive page (docs/system-design.md, section 7): one route that chooses its layout from the
  // window width. Crossing the desktop breakpoint swaps the page's content; it never navigates.
  // The route keeps one page element for Framework7: the new page takes over the old one's place
  // in the router (position, role, page object), so going forward and back still work.
  import { tick, untrack } from 'svelte';
  import { layout } from '../lib/layout.svelte.js';

  /** @type {{ wide: any, narrow: any, wideProps?: object, narrowProps?: object, f7router?: any, f7route?: any, [key: string]: any }} */
  let { wide, narrow, wideProps = {}, narrowProps = {}, ...rest } = $props();
  const Wide = $derived(wide);
  const Narrow = $derived(narrow);

  /** The `.page` elements of the route's view that belong to this route. */
  function ownPages() {
    const router = rest.f7router;
    if (!router?.el) return [];
    return /** @type {HTMLElement[]} */ ([...router.el.children]).filter((el) => el.classList.contains('page') && /** @type {any} */ (el).f7Page?.route?.route?.path === rest.f7route?.route?.path);
  }

  /** The page element and its Framework7 data before the swap. */
  let before = /** @type {{ el: HTMLElement, f7Page: any }|null} */ (null);
  let shown = layout.desktop;

  $effect.pre(() => {
    const wideNow = layout.desktop;
    untrack(() => {
      if (wideNow === shown) return;
      const el = ownPages()[0];
      before = el ? { el, f7Page: /** @type {any} */ (el).f7Page } : null;
    });
  });

  $effect(() => {
    const wideNow = layout.desktop;
    if (wideNow === shown) return;
    shown = wideNow;
    const old = before;
    before = null;
    if (!old) return;
    tick().then(() => adopt(old));
  });

  /** @param {{ el: HTMLElement, f7Page: any }} old */
  function adopt(old) {
    const router = rest.f7router;
    const app = router?.app;
    if (!router?.el || !app) return;
    const el = /** @type {HTMLElement|undefined} */ ([...router.el.children].find((child) => child.classList.contains('page') && !(/** @type {any} */ (child).f7Page)));
    // Framework7 may have moved the old page out of the range Svelte removes: it goes now.
    if (old.el.isConnected) old.el.remove();
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
