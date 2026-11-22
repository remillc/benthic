<script>
  // @ts-check
  // About, "Bibliothèques libres": the open source components inside the app,
  // each with its licence (names and licences are not translated). A row opens
  // the library's website in the system browser.
  import { Page, Navbar } from 'framework7-svelte';
  import BackLink from '../components/BackLink.svelte';
  import Icon from '../components/Icon.svelte';
  import { t } from '../lib/i18n.js';

  /** The dive core and its native libraries, then the app's web layer. */
  const groups = [
    {
      title: 'core',
      rows: [
        ['Subsurface', 'GPL-2.0', 'https://subsurface-divelog.org'],
        ['libdivecomputer', 'LGPL-2.1', 'https://www.libdivecomputer.org'],
        ['libgit2', 'GPL-2.0 with linking exception', 'https://libgit2.org'],
        ['libxml2', 'MIT', 'https://gitlab.gnome.org/GNOME/libxml2'],
        ['libxslt', 'MIT', 'https://gitlab.gnome.org/GNOME/libxslt'],
        ['libzip', 'BSD-3-Clause', 'https://libzip.org'],
        ['Mbed TLS', 'GPL-2.0-or-later', 'https://www.trustedfirmware.org/projects/mbed-tls/'],
        ['SQLite', 'Public domain', 'https://sqlite.org'],
      ],
    },
    {
      title: 'app',
      rows: [
        ['Capacitor', 'MIT', 'https://capacitorjs.com'],
        ['Framework7', 'MIT', 'https://framework7.io'],
        ['Svelte', 'MIT', 'https://svelte.dev'],
        ['MapLibre GL JS', 'BSD-3-Clause', 'https://maplibre.org'],
        ['qrcode-generator', 'MIT', 'https://github.com/kazuhikoarase/qrcode-generator'],
        ['Natural Earth (simplified world map)', 'Public domain', 'https://www.naturalearthdata.com'],
        ['Source Sans 3', 'SIL Open Font License 1.1', 'https://github.com/adobe-fonts/source-sans'],
        ['Outfit (the name « Benthic »)', 'SIL Open Font License 1.1', 'https://github.com/Outfitio/Outfit-Fonts'],
      ],
    },
  ];
</script>

<Page data-bc-scroll class="bc-about-libraries">
  <Navbar title={t('about.libraries')}>
    {#snippet left()}
      <BackLink label={t('about.title')} name={t('detail.back')} />
    {/snippet}
  </Navbar>

  <p class="bc-about-libraries--intro">{t('about.librariesIntro')}</p>

  {#each groups as group (group.title)}
    <h2 class="block-title">{t(`about.librariesGroups.${group.title}`)}</h2>
    <div class="list list-strong inset list-dividers">
      <ul>
        {#each group.rows as [name, licence, url] (name)}
          <li>
            <a href={url} class="item-link item-content external no-chevron" target="_blank" rel="noopener" aria-label={t('about.libraryLink', { name, licence })}>
              <div class="item-inner">
                <div class="item-title">
                  {name}
                  <div class="item-footer">{licence}</div>
                </div>
                <div class="item-after"><Icon name="openInNew" size={24} /></div>
              </div>
            </a>
          </li>
        {/each}
      </ul>
    </div>
  {/each}
</Page>

<style>
  @layer bc.components {
    .bc-about-libraries--intro {
      margin: 8px 16px 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);

      /* iPhone (docs/mockups/ios-apropos): inset groups with 10 px corners, titles in small capitals. */
      :global(.ios) & {
        margin: 8px 32px 0;
        font-size: 13px;
        line-height: 18px;
      }
    }

    :global(.ios .bc-about-libraries .block-title) {
      margin: 22px 32px 6px;
      font-size: 13px;
      line-height: 18px;
      font-weight: 400;
      text-transform: uppercase;
      color: var(--bc-text-2);
    }

    :global(.ios .bc-about-libraries .list.inset) {
      margin-left: 16px;
      margin-right: 16px;
      border-radius: 10px;
    }

    :global(.ios .bc-about-libraries .list.inset ul) {
      border-radius: 10px;
    }

    :global(.ios .bc-about-libraries .item-after) {
      color: var(--bc-text-2);
    }
  }
</style>
