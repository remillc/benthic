<script>
  // @ts-check
  // « Être prévenu des demandes d’accès » (inbox task 2026-11-23-356, part 4; Benthic+ only): Benthic's explanation before the
  // system's own request. A dialog on Android, a bottom sheet on iPhone (`ios`). « Continuer » (`oncontinue`) opens the system
  // request; « Plus tard » (`onlater`, Back, the scrim) closes it, and it is not asked again by itself. Built from the task's text:
  // the canvases « Permission de notifier, explication avant la demande d’Android / d’iOS » are not in docs/mockups*.
  import Md3Dialog from './Md3Dialog.svelte';
  import Icon from './Icon.svelte';
  import { ios } from '../lib/layout.svelte.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ oncontinue: () => void, onlater: () => void }} */
  let { oncontinue, onlater } = $props();

  /** @param {HTMLElement} node */
  function portal(node) {
    document.body.appendChild(node);
    queueMicrotask(() => /** @type {HTMLElement|null} */ (node.querySelector('[role="dialog"]'))?.focus({ preventScroll: true }));
    /** @param {Event} e */
    const cancel = (e) => {
      e.stopPropagation();
      onlater();
    };
    node.addEventListener('bc-cancel', cancel);
    return {
      destroy() {
        node.removeEventListener('bc-cancel', cancel);
        node.remove();
      },
    };
  }
</script>

{#if ios}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="bc-notify-ask bc-notify-ask--sheet" use:portal onkeydown={(e) => e.key === 'Escape' && onlater()}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="bc-notify-ask--scrim" onclick={onlater}></div>
    <div class="bc-notify-ask--surface" role="dialog" aria-modal="true" aria-labelledby="bc-notify-ask-title" tabindex="-1">
      <span class="bc-notify-ask--grabber" aria-hidden="true"></span>
      <span class="bc-notify-ask--icon" aria-hidden="true"><Icon name="bell" size={32} /></span>
      <h2 id="bc-notify-ask-title" class="bc-notify-ask--title">{t('accountSync.push.askTitle')}</h2>
      <p class="bc-notify-ask--text">{t('accountSync.push.askText')}</p>
      <p class="bc-notify-ask--note">{t('accountSync.push.askNote')}</p>
      <button type="button" class="bc-notify-ask--continue" data-action="continue" onclick={oncontinue}>{t('accountSync.push.continue')}</button>
      <button type="button" class="bc-notify-ask--later" data-action="later" onclick={onlater}>{t('accountSync.push.later')}</button>
    </div>
  </div>
{:else}
  <Md3Dialog title={t('accountSync.push.askTitle')} class="bc-notify-ask" oncancel={onlater}>
    <div class="bc-notify-ask--body">
      <p class="bc-notify-ask--text">{t('accountSync.push.askText')}</p>
      <p class="bc-notify-ask--note">{t('accountSync.push.askNote')}</p>
    </div>
    {#snippet actions()}
      <button type="button" data-action="later" onclick={onlater}>{t('accountSync.push.later')}</button>
      <button type="button" data-action="continue" onclick={oncontinue}>{t('accountSync.push.continue')}</button>
    {/snippet}
  </Md3Dialog>
{/if}

<style>
  @layer bc.components {
    .bc-notify-ask--body {
      padding: 0 24px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .bc-notify-ask--text {
      margin: 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    .bc-notify-ask--note {
      margin: 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text);
    }

    /* iPhone: a bottom sheet. */
    .bc-notify-ask--sheet {
      position: fixed;
      inset: 0;
      z-index: 13500;
      display: flex;
      align-items: flex-end;
      justify-content: center;
    }

    .bc-notify-ask--scrim {
      position: absolute;
      inset: 0;
      background: var(--bc-scrim);
    }

    .bc-notify-ask--surface {
      position: relative;
      box-sizing: border-box;
      width: min(560px, 100%);
      padding: 8px 24px calc(20px + env(safe-area-inset-bottom, 0px));
      border-radius: 14px 14px 0 0;
      background: var(--bc-dialog);
      color: var(--bc-text);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      outline: none;
      animation: bc-notify-ask-rise 280ms cubic-bezier(0.2, 0.8, 0.2, 1) backwards;
    }

    @keyframes bc-notify-ask-rise {
      from {
        transform: translateY(100%);
      }
    }

    .bc-notify-ask--grabber {
      width: 36px;
      height: 5px;
      border-radius: 3px;
      background: var(--bc-outline-variant, #c7c7cc);
      margin-bottom: 8px;
    }

    .bc-notify-ask--icon {
      display: flex;
      color: var(--bc-text);
    }

    .bc-notify-ask--title {
      margin: 4px 0 0;
      font-size: 20px;
      line-height: 25px;
      font-weight: 600;
      text-align: center;
    }

    .bc-notify-ask--surface .bc-notify-ask--text,
    .bc-notify-ask--surface .bc-notify-ask--note {
      text-align: center;
      font-size: 15px;
      line-height: 20px;
    }

    .bc-notify-ask--continue,
    .bc-notify-ask--later {
      width: 100%;
      height: 50px;
      border: none;
      border-radius: 14px;
      font: inherit;
      font-size: 17px;
      cursor: pointer;
    }

    .bc-notify-ask--continue {
      margin-top: 12px;
      background: var(--bc-action);
      color: var(--bc-on-action, #fff);
      font-weight: 600;
    }

    .bc-notify-ask--later {
      background: none;
      color: var(--bc-action);
    }
  }
</style>
