<script>
  // @ts-check
  // The first launch of the release edition (task 2026-11-15-213): the tablet screen for widths from 768 px.
  // On a phone the release edition shows the beta screen (WelcomeStart.svelte) for now: its own phone layout
  // comes in a later task. App.svelte only uses this page when the build is the release edition; the beta
  // edition's route goes straight to WelcomeStart.svelte.
  import WelcomeStart from './WelcomeStart.svelte';
  import WelcomeStartRelease from './WelcomeStartRelease.svelte';
  import { layout } from '../lib/layout.svelte.js';

  /** @type {{ f7router: any }} */
  let { f7router } = $props();
</script>

{#if layout.phone}
  <WelcomeStart {f7router} />
{:else}
  <WelcomeStartRelease {f7router} />
{/if}
