<script>
  // @ts-check
  // The first launch of the release edition (tasks 2026-11-15-213 and 2026-11-16-227): the same page on tablets and
  // on phones, laid out by its width (pages/WelcomeStartRelease.svelte). App.svelte only uses this page when the
  // build is the release edition; the beta edition's route goes straight to WelcomeStart.svelte.
  import WelcomeStartRelease from './WelcomeStartRelease.svelte';

  /** @type {{ f7router: any }} */
  let { f7router } = $props();
</script>

<WelcomeStartRelease {f7router} />
