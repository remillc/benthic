<script>
  // @ts-check
  // The body of the two git help pages (tasks 2026-11-16-247, 252 to 256, 257; docs/mockups/git-depot-aide*.dc.html,
  // git-jeton-aide*.dc.html): the three hosts as Material 3 primary tabs, the introduction of the host, a card with
  // its steps and the link to its page, then the sentence that says what comes next. Steps carry [kbd] and [code]
  // marks (MarkedText). Swiping sideways changes tab; arrow keys, Home and End move between the tabs.
  // On the phone it fills a page under the top bar (pages/RepositoryHelp.svelte, pages/TokenHelp.svelte); on a tablet
  // or the desktop `embedded` puts it in the step column of the first launch (pages/GitRepository.svelte), where
  // the tabs scroll with the column. The hosts and their steps are lib/git-help.js.
  import Icon from './Icon.svelte';
  import MarkedText from './MarkedText.svelte';
  import { GIT_HELP, helpStepKeys } from '../lib/git-help.js';
  import { desktopApp } from '../lib/layout.svelte.js';
  import { t, tIfExists } from '../lib/i18n.js';

  /** @type {{ kind: 'repository'|'token', embedded?: boolean }} */
  let { kind, embedded = false } = $props();

  // The page is not reused for another help.
  // svelte-ignore state_referenced_locally
  const help = GIT_HELP[kind];
  const providers = help.providers;
  const prefix = help.prefix;

  let selected = $state(0);
  const provider = $derived(providers[selected]);
  const name = $derived(t(`${prefix}.${provider.id}.name`));

  /** @param {number} index @param {boolean} [focus] */
  function choose(index, focus = false) {
    selected = (index + providers.length) % providers.length;
    if (focus) document.getElementById(`bc-git-help-tab-${kind}-${providers[selected].id}`)?.focus();
  }

  /** Arrow keys, Home and End move between the tabs (WAI-ARIA tabs). @param {KeyboardEvent} e */
  function keydown(e) {
    const to = { ArrowRight: selected + 1, ArrowLeft: selected - 1, Home: 0, End: providers.length - 1 }[e.key];
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
    if (dx < 0 && selected < providers.length - 1) choose(selected + 1);
    if (dx > 0 && selected > 0) choose(selected - 1);
  }
</script>

<div class="bc-git-help" class:bc-git-help--embedded={embedded}>
  <div class="bc-git-help--tabs" role="tablist" aria-label={t(help.tabs)}>
    {#each providers as p, i (p.id)}
      <button
        type="button"
        role="tab"
        id="bc-git-help-tab-{kind}-{p.id}"
        class="bc-git-help--tab"
        aria-selected={i === selected}
        aria-controls="bc-git-help-panel-{kind}"
        tabindex={i === selected ? 0 : -1}
        onclick={() => choose(i)}
        onkeydown={keydown}
      >
        <span class="bc-git-help--tab-label">{t(`${prefix}.${p.id}.name`)}</span>
      </button>
    {/each}
  </div>

  <p class="bc-git-help--intro">{t(`${prefix}.${provider.id}.intro`)}</p>

  <div
    class="bc-git-help--surface"
    id="bc-git-help-panel-{kind}"
    role="tabpanel"
    tabindex="0"
    aria-labelledby="bc-git-help-tab-{kind}-{provider.id}"
    ontouchstart={touchstart}
    ontouchend={touchend}
  >
    <p class="bc-git-help--note">{t(`${prefix}.${provider.id}.note`)}</p>
    <ol>
      {#each helpStepKeys(kind, provider, desktopApp ? (k) => tIfExists(k) !== undefined : undefined) as key (key)}<li><MarkedText text={t(key)} /></li>{/each}
    </ol>
    <a href={provider.page} class="bc-git-help--open external" target="_blank" rel="noopener">
      <span>{kind === 'repository' ? t('repoHelp.open', { name, page: t(`repoHelp.${provider.id}.page`) }) : t(`tokenHelp.${provider.id}.open`)}</span>
      <Icon name="openInNew" size={20} />
    </a>
  </div>

  <p class="bc-git-help--intro bc-git-help--afterwards">{t(`${prefix}.afterwards`)}</p>
</div>

<style>
  @layer bc.components {
    .bc-git-help--intro {
      margin: 16px 24px 0;
      font-size: 14px;
      line-height: 20px;
      letter-spacing: 0.25px;
      color: var(--bc-text-2);

      &.bc-git-help--afterwards {
        margin-bottom: calc(var(--f7-safe-area-bottom) + 24px);
      }
    }

    /* MD3 primary tabs, fixed under the top bar: equal widths, 48 dp, an indicator under the active label. */
    .bc-git-help--tabs {
      position: sticky;
      top: 0;
      z-index: 2;
      display: flex;
      background: var(--bc-background);
      border-bottom: 1px solid var(--bc-separator);
    }

    .bc-git-help--tab {
      flex: 1 1 0;
      min-width: 0;
      height: 48px;
      padding: 0;
      border: none;
      background: none;
      color: var(--bc-text-2);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.1px;
      display: flex;
      justify-content: center;
      align-items: stretch;
      cursor: pointer;

      @media (hover: hover) {
        &:hover:not([aria-selected='true']) {
          color: var(--bc-text);
        }
      }

      &[aria-selected='true'] {
        color: var(--bc-text);
        font-weight: 600;

        .bc-git-help--tab-label {
          border-bottom: 3px solid var(--bc-text);
          border-radius: 3px 3px 0 0;
        }
      }
    }

    .bc-git-help--tab-label {
      box-sizing: border-box;
      padding: 0 4px;
      display: flex;
      align-items: center;
    }

    .bc-git-help--surface {
      margin: 16px 16px 0;
      padding: 16px 16px 8px;
      border-radius: 20px;
      background: var(--bc-surface);

      :global(.ios) & {
        border-radius: 10px;
      }
    }

    .bc-git-help--note {
      margin: 0 0 8px;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    ol {
      margin: 8px 0;
      padding-left: 22px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      font-size: 15px;
      line-height: 21px;
      color: var(--bc-text);
    }

    .bc-git-help--open {
      min-height: 48px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      color: var(--bc-text);
      font-weight: 500;
      text-decoration: none;

      @media (hover: hover) {
        &:hover {
          text-decoration: underline;
        }
      }
    }

    /* In the step column of the first launch: the column's own width, the tabs scroll with it. */
    .bc-git-help--embedded {
      .bc-git-help--tabs {
        position: static;
        background: none;
      }

      .bc-git-help--intro {
        margin-left: 0;
        margin-right: 0;

        &.bc-git-help--afterwards {
          margin-bottom: 0;
        }
      }

      .bc-git-help--surface {
        margin-left: 0;
        margin-right: 0;
      }
    }
  }
</style>
