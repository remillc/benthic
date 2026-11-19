<script>
  // @ts-check
  // The reproduction of a document in a row (docs/mockups/doc-liste-android.dc.html): the card from the diver's photo or
  // scan, 84 × 53; without a photo the app draws one from the details entered (a gradient in the tone of the agency, of
  // the insurance, with its heading and up to two lines). A medical certificate shows its first two pages side by side.
  import Icon from './Icon.svelte';
  import { cardTone, drawnCard } from '../lib/documents.js';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{ doc: import('../lib/profile.js').Certification, urls?: string[], width?: number }}
   * urls: the addresses of the first images of the document (photo or pages); a PDF has none.
   */
  let { doc, urls = [], width = 84 } = $props();

  const height = $derived(Math.round((width * 53) / 84));
  const drawn = $derived(drawnCard(doc, { agencyOther: t('diverProfile.cert.agencyOther'), medical: t('docs.kind.medical') }));
  const pages = $derived(doc.kind === 'medical' || (doc.kind === 'other' && doc.documents.some((d) => d.side === 'page')));
</script>

{#if pages}
  <span class="od-doc-thumb od-doc-thumb--pages" style:width="{width}px" style:height="{height}px" aria-hidden="true">
    {#each [0, 1] as i (i)}
      <span class="od-doc-thumb--page">
        {#if urls[i]}
          <img src={urls[i]} alt="" />
        {:else}
          <span class="od-doc-thumb--line" style:width="60%"></span><span class="od-doc-thumb--line" style:width="90%"></span><span class="od-doc-thumb--line" style:width="80%"></span><span class="od-doc-thumb--line" style:width="95%"></span><span class="od-doc-thumb--line" style:width="70%"></span>
        {/if}
      </span>
    {/each}
  </span>
{:else if urls[0]}
  <span class="od-doc-thumb od-doc-thumb--photo" style:width="{width}px" style:height="{height}px" aria-hidden="true"><img src={urls[0]} alt="" /></span>
{:else}
  <span class="od-doc-thumb od-doc-thumb--drawn od-doc-thumb--tone-{cardTone(doc)}" style:width="{width}px" style:height="{height}px" aria-hidden="true">
    <span class="od-doc-thumb--heading">{drawn.heading}</span>
    <span class="od-doc-thumb--lines">{#each drawn.lines as line (line)}<span>{line}</span>{/each}</span>
    {#if doc.kind === 'other' && !drawn.lines.length}<Icon name="idCard" size={14} weight={1.6} />{/if}
  </span>
{/if}

<style>
  @layer od.components {
    .od-doc-thumb {
      flex: none;
      display: flex;
      border-radius: 7px;
      overflow: hidden;
      box-sizing: border-box;
    }

    .od-doc-thumb--photo {
      background: var(--od-surface-2);
      box-shadow: 0 1px 3px rgb(0 0 0 / 0.25);
    }

    .od-doc-thumb--photo img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .od-doc-thumb--drawn {
      padding: 5px 6px;
      flex-direction: column;
      justify-content: space-between;
      color: var(--od-card-on);
      box-shadow: 0 1px 3px rgb(0 0 0 / 0.25);
    }

    .od-doc-thumb--heading {
      font-size: 7px;
      line-height: 8px;
      font-weight: 800;
      letter-spacing: 0.5px;
    }

    .od-doc-thumb--lines {
      display: flex;
      flex-direction: column;
      font-size: 6.5px;
      line-height: 8px;
      font-weight: 600;
      overflow: hidden;
    }

    .od-doc-thumb--tone-blue { background: var(--od-card-blue); }
    .od-doc-thumb--tone-green { background: var(--od-card-green); }
    .od-doc-thumb--tone-amber { background: var(--od-card-amber); }
    .od-doc-thumb--tone-violet { background: var(--od-card-violet); }
    .od-doc-thumb--tone-red { background: var(--od-card-red); }
    .od-doc-thumb--tone-neutral { background: var(--od-card-neutral); }

    /* Two pages side by side, as the medical certificate's mock-up draws them. */
    .od-doc-thumb--pages {
      justify-content: center;
      gap: 4px;
      border-radius: 0;
      overflow: visible;
    }

    .od-doc-thumb--page {
      width: 40px;
      height: 100%;
      padding: 4px;
      border: 1px solid var(--od-outline);
      border-radius: 4px;
      box-sizing: border-box;
      overflow: hidden;
      background: var(--od-surface);
      box-shadow: 0 1px 3px rgb(0 0 0 / 0.15);
    }

    .od-doc-thumb--page img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .od-doc-thumb--line {
      display: block;
      height: 3px;
      margin-top: 3px;
      border-radius: 2px;
      background: var(--od-outline);
    }
  }
</style>
