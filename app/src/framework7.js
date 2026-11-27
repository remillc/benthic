// @ts-check
// Framework7's core and the components the app uses, and nothing else: its lite bundle also carries the
// calendar, the pickers, the photo browser, the swiper, the messages, the data tables, the colour picker...
// that no screen opens (the app has its own date and time pickers). A component the app starts to use
// is added here (and its CSS stays: lib/../prune-framework7-css.js only leaves out the rules of the others).
import Framework7 from 'framework7/lite';
import Dialog from 'framework7/components/dialog';
import Popup from 'framework7/components/popup';
import Popover from 'framework7/components/popover';
import Actions from 'framework7/components/actions';
import Sheet from 'framework7/components/sheet';
import Toast from 'framework7/components/toast';
import Preloader from 'framework7/components/preloader';
import Progressbar from 'framework7/components/progressbar';
import Swipeout from 'framework7/components/swipeout';
import VirtualList from 'framework7/components/virtual-list';
import Tabs from 'framework7/components/tabs';
import Panel from 'framework7/components/panel';
import Card from 'framework7/components/card';
import Chip from 'framework7/components/chip';
import Form from 'framework7/components/form';
import Input from 'framework7/components/input';
import Checkbox from 'framework7/components/checkbox';
import Radio from 'framework7/components/radio';
import Toggle from 'framework7/components/toggle';
import Fab from 'framework7/components/fab';
import Searchbar from 'framework7/components/searchbar';
import Skeleton from 'framework7/components/skeleton';
import Typography from 'framework7/components/typography';

Framework7.use([Dialog, Popup, Popover, Actions, Sheet, Toast, Preloader, Progressbar, Swipeout, VirtualList, Tabs, Panel, Card, Chip, Form, Input, Checkbox, Radio, Toggle, Fab, Searchbar, Skeleton, Typography]);

export default Framework7;

/*
 * Framework7 builds a Material palette for each of its sixteen named colours at start (primary, red, green...): about
 * 330 ms on a tablet (start-up profile, 27 November 2026). Neither the app nor Framework7's CSS uses the palettes of the
 * named colours (the app's colours are its --bc-* variables); only the primary one's is built, and the named colours stay
 * as plain --f7-color-* variables.
 */
Framework7.prototype.setColors = function setColors() {
  const app = /** @type {any} */ (this);
  if (!app.colorsStyleEl) {
    app.colorsStyleEl = document.createElement('style');
    document.head.prepend(app.colorsStyleEl);
  }
  const named = Object.keys(app.colors)
    .filter((name) => name !== 'primary')
    .map((name) => `--f7-color-${name}: ${app.colors[name]};`)
    .join('');
  app.colorsStyleEl.textContent = app.utils.colorThemeCSSStyles({ primary: app.colors.primary }, app.mdColorScheme) + `:root{${named}}`;
};
