<script>
  // @ts-check
  // "Créer un dépôt" (task 2026-11-16-247; docs/mockups/git-depot-aide-android.dc.html): the steps to create, on
  // each host, a private and empty repository, and to copy its HTTPS address. Labels are those of each
  // site's English interface, in both languages. Same layout as the token help (TokenHelp.svelte): one
  // host at a time, chosen with Material 3 primary tabs under the top bar; swiping sideways changes tab.
  // The button to the host's page opens in the browser, with the external-link icon.
  // To add a host: one entry in PROVIDERS and its texts `repoHelp.<id>.*` (name, page, note, then the steps).
  import { Page, Navbar, Link } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import MarkedText from '../components/MarkedText.svelte';
  import { t } from '../lib/i18n.js';

  /** @typedef {{ id: string, page: string, steps: string[] }} Provider */

  /**
   * @param {string} id
   * @param {number} count
   */
  const steps = (id, count) => Array.from({ length: count }, (_, i) => `repoHelp.${id}.s${i + 1}`);

  /** @type {Provider[]} */
  const PROVIDERS = [
    { id: 'github', page: 'https://github.com/new', steps: steps('github', 6) },
    { id: 'gitlab', page: 'https://gitlab.com/projects/new#blank_project', steps: steps('gitlab', 7) },
    { id: 'codeberg', page: 'https://codeberg.org/repo/create', steps: steps('codeberg', 6) },
  ];

  let selected = $state(0);
  const provider = $derived(PROVIDERS[selected]);
  const name = $derived(t(`repoHelp.${provider.id}.name`));

  /** @param {number} index @param {boolean} [focus] */
  function choose(index, focus = false) {
    selected = (index + PROVIDERS.length) % PROVIDERS.length;
    if (focus) document.getElementById(`od-repository-help-tab-${PROVIDERS[selected].id}`)?.focus();
  }

  /** Arrow keys, Home and End move between the tabs (WAI-ARIA tabs). @param {KeyboardEvent} e */
  function keydown(e) {
    const to = { ArrowRight: selected + 1, ArrowLeft: selected - 1, Home: 0, End: PROVIDERS.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    choose(to, true);
  }

  // A sideways swipe on the card changes tab.
  let startX = 0;
  let startY = 0;
  /** @param {TouchEvent} e */
  function touchstart(e) {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }
  /** @param {TouchEvent} e */
  function touchend(e) {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0 && selected < PROVIDERS.length - 1) choose(selected + 1);
    if (dx > 0 && selected > 0) choose(selected - 1);
  }
</script>

<Page class="od-repository-help">
  <Navbar title={t('repoHelp.title')}>
    {#snippet left()}
      <Link back iconOnly>
        <i class="icon icon-back"></i>
        <span class="od-sr-only">{t('detail.back')}</span>
      </Link>
    {/snippet}
  </Navbar>

  <div class="od-repository-help--tabs" role="tablist" aria-label={t('repoHelp.tabs')}>
    {#each PROVIDERS as p, i (p.id)}
      <button
        type="button"
        role="tab"
        id="od-repository-help-tab-{p.id}"
        class="od-repository-help--tab"
        aria-selected={i === selected}
        aria-controls="od-repository-help-panel"
        tabindex={i === selected ? 0 : -1}
        onclick={() => choose(i)}
        onkeydown={keydown}
      >
        <span class="od-repository-help--tab-label">{t(`repoHelp.${p.id}.name`)}</span>
      </button>
    {/each}
  </div>

  <p class="od-repository-help--intro">{t('repoHelp.intro')}</p>

  <div
    class="od-repository-help--surface"
    id="od-repository-help-panel"
    role="tabpanel"
    tabindex="0"
    aria-labelledby="od-repository-help-tab-{provider.id}"
    ontouchstart={touchstart}
    ontouchend={touchend}
  >
    <p class="od-repository-help--note">{t(`repoHelp.${provider.id}.note`)}</p>
    <ol>
      {#each provider.steps as key (key)}<li><MarkedText text={t(key)} /></li>{/each}
    </ol>
    <a href={provider.page} class="od-repository-help--open external" target="_blank" rel="noopener">
      <span>{t('repoHelp.open', { name, page: t(`repoHelp.${provider.id}.page`) })}</span>
      <Icon name="openInNew" size={20} />
    </a>
  </div>

  <p class="od-repository-help--intro od-repository-help--afterwards">{t('repoHelp.afterwards')}</p>
</Page>

<style>
  @layer od.components {
    .od-repository-help--intro {
      margin: 16px 24px 0;
      font-size: 14px;
      line-height: 20px;
      letter-spacing: 0.25px;
      color: var(--od-text-2);

      &.od-repository-help--afterwards {
        margin-bottom: calc(var(--f7-safe-area-bottom) + 24px);
      }
    }

    /* MD3 primary tabs, fixed under the top bar: equal widths, 48 dp, an indicator under the active label. */
    .od-repository-help--tabs {
      position: sticky;
      top: 0;
      z-index: 2;
      display: flex;
      background: var(--od-background);
      border-bottom: 1px solid var(--od-separator);
    }

    .od-repository-help--tab {
      flex: 1 1 0;
      min-width: 0;
      height: 48px;
      padding: 0;
      border: none;
      background: none;
      color: var(--od-text-2);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.1px;
      display: flex;
      justify-content: center;
      align-items: stretch;
      cursor: pointer;

      &[aria-selected='true'] {
        color: var(--od-text);
        font-weight: 600;

        .od-repository-help--tab-label {
          border-bottom: 3px solid var(--od-text);
          border-radius: 3px 3px 0 0;
        }
      }
    }

    .od-repository-help--tab-label {
      box-sizing: border-box;
      padding: 0 4px;
      display: flex;
      align-items: center;
    }

    .od-repository-help--surface {
      margin: 16px 16px 0;
      padding: 16px 16px 8px;
      border-radius: 20px;
      background: var(--od-surface);

      :global(.ios) & {
        border-radius: 10px;
      }
    }

    .od-repository-help--note {
      margin: 0 0 8px;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    ol {
      margin: 8px 0;
      padding-left: 22px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      font-size: 15px;
      line-height: 21px;
      color: var(--od-text);
    }

    .od-repository-help--open {
      min-height: 48px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      color: var(--od-text);
      font-weight: 500;
      text-decoration: none;
    }
  }
</style>
