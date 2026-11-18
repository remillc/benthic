<script>
  // @ts-check
  // DEVELOPMENT ONLY: mounts the « Outils de développement » menu and the long-press (0.6 s) on the route badge that
  // opens it. Loaded through `import()` behind the development switch (App.svelte).
  import { onMount } from 'svelte';
  import { devUi } from '../lib/dev-tools-ui.svelte.js';
  import DevToolsMenu from './DevToolsMenu.svelte';

  onMount(() => {
    /** @type {ReturnType<typeof setTimeout>|undefined} */
    let timer;
    /** @param {PointerEvent} e */
    const down = (e) => {
      const badge = document.querySelector('.od-route-badge');
      if (!badge) return;
      const r = badge.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top - 8 || e.clientY > r.bottom + 8) return;
      timer = setTimeout(() => (devUi.open = true), 600);
    };
    const cancel = () => clearTimeout(timer);
    document.addEventListener('pointerdown', down);
    document.addEventListener('pointerup', cancel);
    document.addEventListener('pointercancel', cancel);
    return () => {
      cancel();
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('pointerup', cancel);
      document.removeEventListener('pointercancel', cancel);
    };
  });
</script>

<DevToolsMenu />
