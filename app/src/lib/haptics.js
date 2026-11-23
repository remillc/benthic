// @ts-check
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

/**
 * The short feedback of a long press: a light impact through @capacitor/haptics on a phone or a tablet (Android's
 * vibrator, iOS's impact generator; both follow the device's own haptic settings). A light impact, not iOS's selection
 * feedback, because that one is made for a value changing under a moving finger, not for a press that is recognised.
 * Nothing on the desktop and in the browser. Never throws.
 */
export function longPressFeedback() {
  try {
    if (!Capacitor.isNativePlatform()) return;
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  } catch {
    // Not available or refused: no feedback.
  }
}
