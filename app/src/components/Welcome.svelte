<script>
  // @ts-check
  // First launch (docs/mockups/android-accueil.dc.html, ios-accueil.dc.html,
  // android-compte-import.dc.html, ios-compte-import.dc.html). A popup with
  // its own view: the three choices, then signing in or creating an account
  // (routes /welcome/… in App.svelte). Shown on a first launch and after
  // signing out; nothing is loaded until a choice is made.
  // Full screen on tablets too: a centred popup cut off the choices.
  import { Popup, View, f7 } from 'framework7-svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { accountFlow } from '../lib/account.js';
  import { markFirstScreenReady } from '../lib/launch.js';

  // The launch screen waits for the first real screen: this one when the app starts on the first launch (opened without
  // animation at start), nothing to wait for when it starts on the logbook.
  $effect(() => {
    if (!logbook.welcome && !logbook.welcomeHold) markFirstScreenReady();
  });

  /** Back to the three choices once closed, for the next time it opens. */
  function reset() {
    accountFlow.confirmedEmail = '';
    const view = /** @type {any} */ (f7.views).welcome;
    const first = view?.router.history[0];
    if (first && view.router.history.length > 1) view.router.back(first, { force: true, animate: false });
  }
</script>

<Popup class="od-welcome" tabletFullscreen opened={logbook.welcome || logbook.welcomeHold} swipeToClose={false} closeByBackdropClick={false} onPopupClosed={reset} onPopupOpened={markFirstScreenReady}>
  <View name="welcome" url="/welcome" />
</Popup>
