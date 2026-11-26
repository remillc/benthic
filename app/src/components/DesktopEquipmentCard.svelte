<script>
  // @ts-check
  // One card of the desktop detail's Équipement tab (task 2026-11-23-366): a white card with a header (a 40 px round
  // icon, the title, an action at the right) and the card's content under it. The icon is a snippet, so each card
  // brings its own (Icon.svelte or GearIcon.svelte); `indent` aligns the content with the title (the kit card).

  /**
   * @type {{
   *   title: string,
   *   name?: string,
   *   icon: import('svelte').Snippet,
   *   action?: import('svelte').Snippet,
   *   indent?: boolean,
   *   subtitle?: string,
   *   children?: import('svelte').Snippet,
   * }}
   * `subtitle`: a line under the title in the header (« Plongée invalide »: what the switch at the right does).
   */
  let { title, name = '', icon, action, indent = false, subtitle = '', children } = $props();
  const uid = $props.id();
</script>

<section class="bc-desktop-equipment-card" aria-labelledby="bc-eq-{uid}" data-card={name || undefined}>
  <header class="bc-desktop-equipment-card--header">
    <span class="bc-desktop-equipment-card--icon" aria-hidden="true">{@render icon()}</span>
    {#if subtitle}
      <div class="bc-desktop-equipment-card--texts">
        <h3 class="bc-desktop-equipment-card--title" id="bc-eq-{uid}">{title}</h3>
        <span class="bc-desktop-equipment-card--subtitle">{subtitle}</span>
      </div>
    {:else}
      <h3 class="bc-desktop-equipment-card--title" id="bc-eq-{uid}">{title}</h3>
    {/if}
    {#if action}<div class="bc-desktop-equipment-card--action">{@render action()}</div>{/if}
  </header>
  {#if children}
    <div class="bc-desktop-equipment-card--body" class:bc-desktop-equipment-card--indent={indent}>{@render children()}</div>
  {/if}
</section>

<style>
  @layer bc.components {
    .bc-desktop-equipment-card {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px;
      border-radius: 16px;
      background: var(--bc-surface);
      border: 1px solid var(--bc-surface-container-highest);
    }

    .bc-desktop-equipment-card--header {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 40px;
    }

    .bc-desktop-equipment-card--icon {
      flex: none;
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--bc-secondary-container);
      color: var(--bc-on-table-selected);
    }

    .bc-desktop-equipment-card--title {
      flex: 1;
      min-width: 0;
      margin: 0;
      font-size: 16px;
      line-height: 24px;
      font-weight: 600;
      color: var(--bc-text);
    }

    .bc-desktop-equipment-card--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .bc-desktop-equipment-card--subtitle {
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    .bc-desktop-equipment-card--action {
      flex: none;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .bc-desktop-equipment-card--body {
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: 0;
    }

    /* Aligned with the title: the icon (40 px) and the gap (12 px). */
    .bc-desktop-equipment-card--indent {
      padding-inline-start: 52px;
      margin-top: -8px;
      gap: 2px;
    }
  }
</style>
