<script>
  // @ts-check
  // A translated text with [kbd] and [code] marks (lib/marked-text.js), rendered as elements, never as HTML.
  import { parseMarked } from '../lib/marked-text.js';

  /** @type {{ text: string }} */
  let { text } = $props();
  const segments = $derived(parseMarked(text));
</script>

{#each segments as s, i (i)}{#if s.type === 'kbd'}<kbd class="bc-marked-text--kbd">{s.text}</kbd>{:else if s.type === 'code'}<code class="bc-marked-text--code">{s.text}</code>{:else}{s.text}{/if}{/each}

<style>
  @layer od.components {
    .bc-marked-text--kbd {
      font-family: inherit;
      font-size: 14px;
      font-weight: 400;
      padding: 0 5px;
      border: 1px solid var(--bc-kbd-outline);
      border-radius: 4px;
      background: var(--bc-kbd-background);
      color: var(--bc-kbd-text);
      white-space: nowrap;
    }

    .bc-marked-text--code {
      font-family: 'Roboto Mono', ui-monospace, monospace;
      font-size: 13.5px;
      font-weight: 400;
      padding: 0 4px;
      border-radius: 4px;
      background: var(--bc-code-background);
      color: var(--bc-code-text);
      overflow-wrap: anywhere;
    }
  }
</style>
