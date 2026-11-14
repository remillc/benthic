// @ts-check
// Entry point. The settings of this device are loaded first (lib/device-store.js:
// the system's preferences, one call per value, a few milliseconds), then the app
// starts (start.js), so that every module reads them as it loads.
// Framework7's CSS is imported by theme.css, in the "framework7" layer: loaded now,
// with the page, not after the settings.
import './theme.css';
import { loadDeviceStore } from './lib/device-store.js';

loadDeviceStore().then(() => import('./start.js'));
