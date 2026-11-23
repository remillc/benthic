/**
 * The short feedback of a long press, where the web view offers one
 * (`navigator.vibrate`: Android's WebView with the VIBRATE permission).
 * There is no native haptics plugin in the app: iOS's WebView has no
 * vibration, so nothing happens there until one is added.
 */
export function longPressFeedback() {
  try {
    navigator.vibrate?.(15);
  } catch {
    // Not available or refused: no feedback.
  }
}
