<script>
  // @ts-check
  // A translated text with [kbd] and [code] marks (lib/marked-text.js), rendered as elements, never as HTML.
  import { parseMarked } from '../lib/marked-text.js';

  /** @type {{ text: string }} */
  let { text } = $props();
  const segments = $derived(parseMarked(text));
</script>

{#each segments as s, i (i)}{#if s.type === 'kbd'}<kbd class="od-marked-text--kbd">{s.text}</kbd>{:else if s.type === 'code'}<code class="od-marked-text--code">{s.text}</code>{:else}{s.text}{/if}{/each}

<style>
  @layer od.components {
    .od-marked-text--kbd {
      font-family: inherit;
      font-size: 14px;
      font-weight: 400;
      padding: 0 5px;
      border: 1px solid var(--od-kbd-outline);
      border-radius: 4px;
      background: var(--od-kbd-background);
      color: var(--od-kbd-text);
      white-space: nowrap;
    }

    .od-marked-text--code {
      font-family: 'Roboto Mono', ui-monospace, monospace;
      font-size: 13.5px;
      font-weight: 400;
      padding: 0 4px;
      border-radius: 4px;
      background: var(--od-code-background);
      color: var(--od-code-text);
      overflow-wrap: anywhere;
    }
  }
</style>
