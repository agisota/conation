# Conation brand assets

The three `*-master-v1.png` files below are byte-for-byte copies of the
user-supplied artwork. Keep them unchanged: platform icons must always be
generated from the square master, never from an already reduced derivative.

## Canonical masters and provenance

| Canonical file | User upload | Dimensions / format | Bytes | SHA-256 | Use |
| --- | --- | --- | ---: | --- | --- |
| `conation-app-icon-master-v1.png` | `conation C copy.png` | 1254×1254, 8-bit RGB PNG | 1,248,699 | `111156e7dec032c9725f5efe7ad94bebe07f00e4dc9a537e62f6a83f59030dea` | Favicons, PWA and native application icons |
| `conation-combined-lockup-master-v1.png` | `con copy.png` | 2172×724, 8-bit RGBA PNG | 365,586 | `974b4c71965df3e2266c74d6545621bc580b4270d12aa1512d31a7a2d46ce453` | Orbit + `conation.dev` horizontal lockup |
| `conation-wordmark-master-v1.png` | `cona copy.png` | 2172×724, 8-bit RGBA PNG | 250,325 | `a51ecd45281efc1976cec6b3ab050e29f4de8657fac0bef2573375f4cba0e5e4` | Wordmark-only compositions |

The two horizontal masters are transparent silver/white artwork and therefore
require a dark surface. `src/components/brand.tsx` enforces that contrast for
the combined lockup. It also exposes the square mark with decorative-image
semantics by default. The source canvases and their original alpha margins
are deliberately preserved rather than trimmed.

`conation-orbit-icon-master-v1.png` and
`conation-wordmark-dark-master-v1.png` are byte-identical compatibility aliases
of the app-icon and wordmark masters respectively. They replace the earlier
generated reconstructions; new references should use the canonical names.

## Web derivatives

`public/dev`, `public/local` and `public/staging` contain byte-identical copies
of the root web files because Vite's `ASSETS_PATH` selects those directories
in environment-specific builds.

| Root file (and each environment mirror) | Source | Dimensions / format | Bytes | SHA-256 |
| --- | --- | --- | ---: | --- |
| `icon.png` | app-icon master | 32×32, 8-bit RGBA PNG | 1,523 | `14bebeecf77a93f5d28af360d5005651f5717d060da4b70f549a0c88dedb32ed` |
| `logo192.png` | app-icon master | 192×192, 8-bit RGBA PNG | 26,865 | `09230c450c5251d0b317c9e470932c85c3b8b4aef03f62a9d0d9c81d356fa161` |
| `logo512.png` | app-icon master | 512×512, 8-bit RGBA PNG | 202,372 | `0c09f51212d557f482eb24cf9e9e663cd64795ad37b8482b30014d23bbecd3f6` |
| `favicon.ico` | app-icon master | ICO with 16, 24, 32, 48, 64 and 256 px entries | 58,675 | `277d8e2399b08fe7cd0abb1099ce8bbda78c70e53e57f4f176d65cbe4c1043f0` |

`index.html`, the PWA manifest and the notification-badge favicon renderer
consume these files. The badge renderer starts with `icon.png`, then draws its
notification cut-out and dot at runtime.

## Native derivatives

The canonical native source copy is `apps/web/tauri/icon.png` (1024×1024 RGBA,
853,021 bytes, SHA-256
`7001c0441dd3a9064e633a46a615636b517a3769245d29364f6f269fc0d98975`).
Representative Tauri outputs are:

| File under `apps/web/tauri/src-tauri/icons` | Dimensions / format | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `32x32.png` | 32×32 RGBA PNG | 1,523 | `14bebeecf77a93f5d28af360d5005651f5717d060da4b70f549a0c88dedb32ed` |
| `128x128.png` | 128×128 RGBA PNG | 13,337 | `112fbdb0335b8ea8f841e517d3bc7abcd8d3ce74d89c5ea972c041ebe7a706c4` |
| `128x128@2x.png` | 256×256 RGBA PNG | 46,339 | `fe47e46698a8aa82397e99177bc1e1f01a5e6960bcd44886032eae3c8869002a` |
| `icon.png` | 512×512 RGBA PNG | 202,372 | `0c09f51212d557f482eb24cf9e9e663cd64795ad37b8482b30014d23bbecd3f6` |
| `icon.ico` | Windows ICO bundle | 58,675 | `277d8e2399b08fe7cd0abb1099ce8bbda78c70e53e57f4f176d65cbe4c1043f0` |
| `icon.icns` | macOS ICNS bundle | 1,374,133 | `89688a4d53081b4913cbb1c6509f2a70435f7a5838293a5533b5b2e37eda35f9` |

The same generator owns the Windows `StoreLogo`/`Square*Logo` PNGs, the Xcode
`AppIcon.appiconset` PNGs and Android `mipmap-*` launcher PNGs/XML. The
representative 1024×1024 iOS output has SHA-256
`7001c0441dd3a9064e633a46a615636b517a3769245d29364f6f269fc0d98975`;
the 432×432 Android xxxhdpi foreground has SHA-256
`cbcb9619b819bb8d5035d561922bdc88397bb2468783a07fcea7fda019405e0f`.
Existing `icons/icon.iconset` files remain untouched and unreferenced because
Tauri CLI 2.11.4 does not emit or consume that intermediate directory.

## Reproduction

Run from `apps/web/tauri/src-tauri` and use a temporary output directory:

```bash
nix develop --command cargo tauri icon \
  /root/macro/apps/web/public/brand/conation-app-icon-master-v1.png \
  --output /tmp/conation-web-icons --png 32,192,512,1024

nix develop --command cargo tauri icon \
  /root/macro/apps/web/public/brand/conation-app-icon-master-v1.png \
  --output /tmp/conation-tauri-icons --ios-color '#000000'
```

Copy the 1024 px web output to `apps/web/tauri/icon.png`; copy the generator's
desktop files to `src-tauri/icons`, its `ios/*.png` files only to the existing
Xcode AppIcon set, and its Android files only to matching Android resource
directories. Keep platform project metadata and `values/strings.xml` intact.
