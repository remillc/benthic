<script>
  // @ts-check
  // « Tailles courantes » under the name of a new cylinder type (task 2026-11-23-373): the core's default table as
  // suggestions, in the unit system (AL80, HP100... in imperial; 10 L, 12 L, 15 L 232 bar in metric). A chip fills the
  // name, the volume and the pressure; nothing is created until the type is saved.
  import { t } from '../lib/i18n.js';

  /**
   * @type {{ sizes: { name: string, ml: number, mbar: number }[], onpick: (size: { name: string, ml: number, mbar: number }) => void }}
   */
  let { sizes, onpick } = $props();
</script>

{#if sizes.length}
  <section class="bc-cylinder-size-chips" aria-labelledby="bc-cylinder-size-chips-title">
    <h3 class="bc-cylinder-size-chips--title" id="bc-cylinder-size-chips-title">{t('settings.cylinders.commonSizes')}</h3>
    <div class="bc-cylinder-size-chips--list" role="group" aria-labelledby="bc-cylinder-size-chips-title">
      {#each sizes as size (size.name)}
        <button type="button" class="bc-cylinder-size-chips--chip" onclick={() => onpick(size)}>{size.name}</button>
      {/each}
    </div>
    <p class="bc-cylinder-size-chips--note">{t('settings.cylinders.commonSizesNote')}</p>
  </section>
{/if}

<style>
  @layer bc.components {
    .bc-cylinder-size-chips {
      margin: 8px var(--bc-chips-inset, 16px) 0;
    }

    .bc-cylinder-size-chips--title {
      margin: 0 0 8px;
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
      color: var(--bc-text);
    }

    .bc-cylinder-size-chips--list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    /* A 32 dp suggestion chip (Material 3): outlined, 8 dp corners; the touch target is 48 dp tall. */
    .bc-cylinder-size-chips--chip {
      min-height: 32px;
      padding: 0 12px;
      border: var(--bc-outline-width) solid var(--bc-outline);
      border-radius: 8px;
      background: none;
      color: var(--bc-text);
      font: inherit;
      font-size: 14px;
      cursor: pointer;
      position: relative;

      &::after {
        content: '';
        position: absolute;
        inset: -8px -2px;
      }
    }

    .bc-cylinder-size-chips--note {
      margin: 8px 0 0;
      font-size: 12px;
      line-height: 16px;
      color: var(--bc-text-2);
    }
  }
</style>
