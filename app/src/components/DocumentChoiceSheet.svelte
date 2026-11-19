<script>
  // @ts-check
  // A bottom sheet with a title and a few choices, each an icon, a title and a line (task 2026-11-19-309): « Ajouter » in
  // « Brevets et documents » (doc-ajout-android) and « Partager le document » (doc-partager-android).
  import { Sheet } from 'framework7-svelte';
  import Icon from './Icon.svelte';

  /**
   * @type {{
   *   opened: boolean,
   *   title: string,
   *   lead?: string,
   *   options: { value: string, icon: any, title: string, text: string }[],
   *   cancel?: string,
   *   onchoose: (value: string) => void,
   *   onclose: () => void,
   * }}
   */
  let { opened, title, lead = '', options, cancel = '', onchoose, onclose } = $props();
</script>

<Sheet class="od-doc-choice" {opened} onSheetClosed={onclose} backdrop swipeToClose push={false} aria-label={title}>
  <div class="od-doc-choice--content">
    <h2 class="od-doc-choice--title">{title}</h2>
    {#if lead}<p class="od-doc-choice--lead">{lead}</p>{/if}
    <div class="od-doc-choice--list">
      {#each options as o (o.value)}
        <button type="button" class="od-doc-choice--option" onclick={() => onchoose(o.value)}>
          <span class="od-doc-choice--icon"><Icon name={o.icon} size={22} /></span>
          <span class="od-doc-choice--texts">
            <span class="od-doc-choice--option-title">{o.title}</span>
            <span class="od-doc-choice--option-text">{o.text}</span>
          </span>
        </button>
      {/each}
    </div>
    {#if cancel}
      <div class="od-doc-choice--actions"><button type="button" class="od-doc-choice--cancel" onclick={onclose}>{cancel}</button></div>
    {/if}
  </div>
</Sheet>

<style>
  @layer od.components {
    :global(.sheet-modal.od-doc-choice) {
      --f7-sheet-bg-color: var(--od-drawer);
      height: auto;
      max-height: 92%;
      border-radius: 28px 28px 0 0;
    }

    .od-doc-choice--content {
      padding: 20px 0 calc(12px + var(--od-safe-bottom));
    }

    .od-doc-choice--title {
      margin: 0 24px 8px;
      font-size: 22px;
      line-height: 28px;
      font-weight: 400;
    }

    .od-doc-choice--lead {
      margin: 0 24px 8px;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    .od-doc-choice--list {
      padding: 0 12px;
      display: flex;
      flex-direction: column;
    }

    .od-doc-choice--option {
      width: 100%;
      min-height: 64px;
      padding: 8px 12px;
      border: none;
      border-radius: 16px;
      display: flex;
      align-items: center;
      gap: 16px;
      background: none;
      color: var(--od-text);
      font: inherit;
      text-align: start;
    }

    .od-doc-choice--icon {
      flex: none;
      width: 44px;
      height: 44px;
      border-radius: 22px;
      display: grid;
      place-items: center;
      background: var(--od-plus-violet);
      color: var(--od-plus-violet-icon);
    }

    .od-doc-choice--texts {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .od-doc-choice--option-title {
      font-size: 16px;
      line-height: 22px;
      font-weight: 500;
    }

    .od-doc-choice--option-text {
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .od-doc-choice--actions {
      margin: 8px 24px 0;
      display: flex;
      justify-content: flex-end;
    }

    .od-doc-choice--cancel {
      height: 40px;
      padding: 0 16px;
      border: none;
      border-radius: 20px;
      background: none;
      color: var(--od-secondary);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
    }
  }
</style>
