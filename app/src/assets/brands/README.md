# Brand assets

Official logos of the sign-in providers. They are used as the providers publish them and are never redrawn or altered.
Their use follows each provider's guidelines (button titles, colours, minimum sizes, logo proportions).

## Google

- `google-g.svg`: the four-colour Google "G" (24 x 24, the logo has a 1 px margin), shown at 22 x 22 so the letter itself is
  about 20 px.
- Source: supplied by Christian, 18 November 2026 (`docs/brand/google-g.svg`), the same icon as in the mock-ups; the
  paths are the ones of the Google identity branding guidelines, <https://developers.google.com/identity/branding-guidelines>.
- Rules followed (custom button): "Continue with Google" title; light theme fill `#FFFFFF`, stroke `#747775`, text
  `#1F1F1F`; dark theme fill `#131314`, stroke `#8E918F`, text `#E3E3E3` (`--bc-brand-google-*` in `theme.css`); the
  standard colour "G" in both themes, never recoloured; 12 px of padding before it and 10 px after it. The title uses
  the app's font (weight 500), not Google Sans.

## Apple

- `apple-logo-black.svg`: the Apple logo, black. Source: supplied by Christian, 18 November 2026
  (`docs/brand/apple-logo-black.svg`), unchanged.
- `apple-logo-white.svg`: the same file with the fill colour set to white (`fill="#FFFFFF"` on its path), nothing else
  changed; it is used on the black button of the dark theme.
- Shown 22 px high, the width follows (about 18 px).
- Guidelines: Sign in with Apple, <https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple>;
  logo artwork: Apple Design Resources, <https://developer.apple.com/design/resources/>.
- Rules followed (custom button): title "Continue with Apple" (translated); the button is white with the black logo and
  black title (light theme) or black with the white logo and white title (dark theme), the colour being the only
  difference (`--bc-brand-apple-*` in `theme.css`); the logo is never recoloured other than black or white; the button
  is far above the 140 x 30 pt minimum.

## GitHub

- `github-invertocat.svg`: the official GitHub Invertocat mark, black. Source: supplied by Christian, 19 November 2026
  (the path of the mock-ups `apropos-android` and `bureau-apropos`), unchanged.
- Shown 20 x 20 on the « Voir sur GitHub » button of About, coloured #1F2124 (the page's ink, `--bc-text`, in light mode).
  It is never redrawn. With the Google and Apple logos it is one of the only brand marks the app shows.
- Guidelines: GitHub logos and usage, <https://github.com/logos>.
