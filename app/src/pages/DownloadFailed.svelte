<script>
  // @ts-check
  // Download failed (spec, section 6, "Error"; the layout of task 2026-11-24-378, the download's own): what happened, what
  // did not change, what to check as three numbered points, then Retry. Never the raw
  // text of a core error. Opened by the download (pages/Download.svelte), in
  // its place: ?computer=<model name>&reason=notFound (the connection could
  // not be opened) or lost (it was, then the download failed). Retry starts
  // the same attempt again, "Choose another dive computer" opens the list.
  // &received=N: dives arrived before the failure. As Subsurface-mobile, they
  // can be kept (one undoable step, as a full download); otherwise they are
  // dropped when this screen closes.
  import { onDestroy, onMount } from 'svelte';
  import { Page, Navbar, Link, theme } from 'framework7-svelte';
  import { BenthicCore } from 'benthic-core';
  import Icon from '../components/Icon.svelte';
  import { keepReceived } from '../lib/download.js';
  import { layout, desktopApp } from '../lib/layout.svelte.js';
  import { navigation } from '../lib/navigation.svelte.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7route: { query: { computer?: string, reason?: string, received?: string } }, f7router: any }} */
  let { f7route, f7router } = $props();
  const computer = f7route.query?.computer ?? '';
  const reason = f7route.query?.reason === 'lost' ? 'lost' : 'notFound';
  const checks = ['on', 'near', 'otherApp'];
  /** Which device the texts name (« le téléphone », « l’iPhone », « la tablette »; the desktop dialog). */
  const kind = $derived(desktopApp ? 'desktop' : layout.split ? 'tablet' : theme.ios ? 'iphone' : 'phone');
  // svelte-ignore state_referenced_locally
  let received = $state(Number(f7route.query?.received ?? 0) || 0);
  let keeping = $state(false);

  async function keep() {
    keeping = true;
    const kept = await keepReceived();
    keeping = false;
    if (kept) {
      received = 0;
      f7router.back();
    }
  }

  onMount(() => {
    navigation.downloadPanes++;
  });

  onDestroy(() => {
    navigation.downloadPanes--;
    if (received) BenthicCore.downloadPartial({ action: 'discard' }).catch(() => {});
  });

  /** The download screen again, in this one's place: the same attempt (retry) or the list. @param {boolean} retry */
  function again(retry) {
    f7router.navigate('/download', { reloadCurrent: true, props: { retry } });
  }
</script>

<Page class="bc-download-failed bc-download-failed--{kind}">
  {#if !desktopApp}
    <Navbar title={t('download.title')}>
      {#snippet left()}
        {#if theme.ios}
          <Link back>{t('downloadFailed.close')}</Link>
        {:else}
          <Link back iconOnly><Icon name="close" /><span class="bc-sr-only">{t('downloadFailed.close')}</span></Link>
        {/if}
      {/snippet}
    </Navbar>
  {/if}

  {#snippet body()}
    <div class="bc-download-failed--content">
      <span class="bc-download-failed--disc" aria-hidden="true"><Icon name="bluetoothOff" size={44} weight={2} /></span>
      <h1>{computer ? t(`downloadFailed.${reason}.title`, { computer }) : t(`downloadFailed.${reason}.titleNoName`)}</h1>
      <p class="bc-download-failed--text">{reason === 'lost' ? t('downloadFailed.lost.text') : t(`downloadFailed.notFound.text.${kind}`)} {t('downloadFailed.nothingChanged')}</p>
      {#if received}
        <div class="bc-download-failed--received">
          <p class="bc-download-failed--text">{t('downloadFailed.received', { n: received })}</p>
          <button type="button" class="bc-outlined-button" disabled={keeping} onclick={keep}>
            {t('download.keepReceived', { n: received })}
          </button>
        </div>
      {/if}
      <ol>
        {#each checks as c, i (c)}
          <li>
            <span class="bc-download-failed--number" aria-hidden="true">{i + 1}</span>
            <span>{c === 'near' ? t(`downloadFailed.checks.near.${kind}`) : t(`downloadFailed.checks.${c}`)}</span>
          </li>
        {/each}
      </ol>
    </div>
  {/snippet}

  {#snippet actions()}
    <div class="bc-download-failed--actions">
      <button type="button" class="bc-download-failed--retry" onclick={() => again(true)}><Icon name="refresh" size={20} />{t('downloadFailed.retry')}</button>
      <button type="button" class="bc-text-button" onclick={() => again(false)}>{t('downloadFailed.otherComputer')}</button>
    </div>
  {/snippet}

  {#if desktopApp}
    <!-- The download's dialog: 640 px, the title and the close button on top, the actions in its footer, right-aligned. -->
    <div class="bc-download-failed--dialog">
      <header class="bc-download-failed--dialog-head">
        <h2>{t('download.title')}</h2>
        <button type="button" class="bc-icon-button" aria-label={t('downloadFailed.close')} onclick={() => f7router.back()}><Icon name="close" /></button>
      </header>
      <div class="bc-download-failed--scroll">{@render body()}</div>
      <footer class="bc-download-failed--dialog-foot">{@render actions()}</footer>
    </div>
  {:else}
    <div class="bc-download-failed--frame">{@render body()}</div>
    <div class="bc-download-failed--bar">{@render actions()}</div>
  {/if}
</Page>

<style>
  @layer bc.components {
    /* The download's layout (task 2026-11-24-378): the same bar, a centred column (640 px on a tablet), a 96 px disc, a centred
       title and text, the actions at the bottom; on the desktop the download's 640 px dialog with its footer. */
    :global(.bc-download-failed--tablet) {
      --f7-navbar-height: 72px;
    }

    .bc-download-failed--frame,
    .bc-download-failed--scroll {
      box-sizing: border-box;
      max-width: 640px;
      margin-inline: auto;
    }

    .bc-download-failed--frame {
      padding-bottom: calc(168px + var(--f7-safe-area-bottom, 0px));
    }

    .bc-download-failed--content {
      margin: 24px 24px 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 8px;
    }

    .bc-download-failed--disc {
      width: 96px;
      height: 96px;
      border-radius: 50%;
      background: var(--bc-download-failed-disc);
      color: var(--bc-on-download-failed-disc);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    h1 {
      margin: 16px 0 0;
      font-size: 24px;
      line-height: 32px;
      font-weight: 400;

      :global(.ios) & {
        font-size: 28px;
        line-height: 34px;
        font-weight: 700;
      }
    }

    .bc-download-failed--text {
      margin: 0;
      max-width: 420px;
      font-size: 16px;
      line-height: 24px;
      color: var(--bc-text-2);

      :global(.ios) & {
        font-size: 17px;
        line-height: 22px;
      }
    }

    ol {
      margin: 16px 0 8px;
      padding: 0;
      list-style: none;
      text-align: start;
      max-width: 420px;
    }

    li {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      padding: 8px 0;
      font-size: 16px;
      line-height: 24px;

      :global(.ios) & {
        font-size: 17px;
      }
    }

    .bc-download-failed--number {
      flex: none;
      width: 24px;
      height: 24px;
      border-radius: 12px;
      background: var(--bc-tint);
      color: var(--bc-on-tint);
      font-size: 12px;
      font-weight: 500;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .bc-download-failed--received {
      margin-top: 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }

    /* Phone and tablet: the buttons in a 420 dp column at the bottom, the filled one first. */
    .bc-download-failed--bar {
      position: absolute;
      inset-inline: 0;
      bottom: 0;
      z-index: 10;
      box-sizing: border-box;
      width: min(100% - 32px, 420px);
      margin-inline: auto;
      padding-bottom: calc(24px + var(--f7-safe-area-bottom, 0px));
    }

    .bc-download-failed--actions {
      display: grid;
      justify-items: stretch;
      gap: 8px;

      > button {
        justify-content: center;
        text-align: center;
      }
    }

    /* MD3 filled button; iOS large filled button. */
    .bc-download-failed--retry {
      height: 48px;
      padding: 0 24px;
      border: none;
      border-radius: 24px;
      background: var(--bc-primary-action);
      color: var(--bc-on-primary-action);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      cursor: pointer;

      :global(.ios) & {
        height: 50px;
        border-radius: 12px;
        font-size: 17px;
        font-weight: 600;
      }
    }

    :global(.bc-download-failed--desktop) {
      :global(.page-content) {
        background: linear-gradient(var(--bc-scrim), var(--bc-scrim)), var(--bc-background);
        box-sizing: border-box;
        height: 100%;
        padding: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }
    }

    .bc-download-failed--dialog {
      box-sizing: border-box;
      width: 640px;
      max-width: 100%;
      max-height: min(820px, 100%);
      display: flex;
      flex-direction: column;
      border-radius: 28px;
      background: var(--bc-dialog);
      overflow: hidden;

      .bc-download-failed--scroll {
        flex: 1;
        min-height: 0;
        width: 100%;
        overflow-y: auto;
        padding-bottom: 8px;
      }

      .bc-download-failed--actions {
        display: flex;
        flex-direction: row-reverse;
        justify-content: flex-start;
        align-items: center;
      }
    }

    .bc-download-failed--dialog-head {
      flex: none;
      min-height: 72px;
      padding: 0 16px 0 24px;
      display: flex;
      align-items: center;
      gap: 4px;

      h2 {
        flex: 1;
        margin: 0;
        font-size: 24px;
        line-height: 32px;
        font-weight: 400;
      }
    }

    .bc-download-failed--dialog-foot {
      flex: none;
      padding: 16px 24px 24px;
    }
  }

  /* The desktop dialog is centred on the whole window, not in the detail pane (as the download's own). */
  :global(.view-master-detail > .page-master-detail.bc-download-failed--desktop) {
    inset: 0;
    width: 100%;
    z-index: 1000;
  }
</style>
