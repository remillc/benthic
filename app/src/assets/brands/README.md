# Brand assets

Official logos of the sign-in providers. They are used as the providers publish them and are never redrawn or altered.
Their use follows each provider's guidelines (button titles, colours, minimum sizes, logo proportions).

## Google

- `google-g.svg`: the Google "G" (standard colour version).
- Source: the download bundle `signin-assets.zip` of the Sign in with Google branding guidelines,
  <https://developers.google.com/identity/branding-guidelines> (bundle: <https://developers.google.com/static/identity/images/signin-assets.zip>).
- The file is `Android + Web/SVG/Light/Theme=Light, Show text=No, Shape=Pill, Platform=Android+Web.svg` of the bundle, with
  only its two button-boundary paths (white disc and grey stroke) removed and the `viewBox` set to the logo's own
  20 x 20 square (`10 10 20 20`). The logo's paths, mask, gradient and filters are unchanged.
- Rules followed (custom button): "Continue with Google" title; light theme fill `#FFFFFF`, stroke `#747775`, text
  `#1F1F1F`; dark theme fill `#131314`, stroke `#8E918F`, text `#E3E3E3` (`--od-brand-google-*` in `theme.css`); the
  "G" at its fixed size of 20 px, 12 px of padding before it and 10 px after it; same standard colour "G" in both themes.
  The title uses the app's font (weight 500), not Google Sans.

## Apple

- `apple-logo-black.svg` ("Left Black Logo Medium") and `apple-logo-white.svg` ("Left White Logo Medium"): unchanged
  files of the Sign in with Apple logo artwork (logo with text, medium size, 44 pt high).
- Source: "Sign in with Apple Logo" of Apple Design Resources, <https://developer.apple.com/design/resources/>
  (<https://devimages-cdn.apple.com/design/resources/download/Logo-Sign-in-with-Apple.dmg>); guidelines:
  <https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple>.
- Rules followed (custom button): title "Continue with Apple" (translated); the button is white with the black logo and
  black title (light theme) or black with the white logo and white title (dark theme), the colour being the only
  difference (`--od-brand-apple-*` in `theme.css`); the logo file is as high as the button and is not cropped; no
  vertical padding is added; the button is far above the 140 x 30 pt minimum.
