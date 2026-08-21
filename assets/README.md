# Product assets (built-in static resources)

Static files that ship with the product and are released with each version. These are **not** user-uploaded or AI-generated project media.

| Directory / file | URL prefix | Purpose |
|---|---|---|
| `fonts/` | `/fonts/` | Built-in CJK / display font woff2 |
| `thumbnails/` | `/thumbnails/` | MG template library thumbnails |
| `voice-samples/` | `/voice-samples/` | TTS auditions |
| `sound-effects/` | `/sound-effects/` | Sound effects library |
| `audio/` | `/audio/` | Built-in audio track samples |
| `media/` | `/media/` | Product sample media (e.g. speech-sample; **excludes** uploads) |
| `luts/` | `/luts/` | .cube LUTs |
| `library-previews/` | `/library-previews/` | Resource library preview images |
| `plugins/` | `/plugins/` | Built-in plugin index/examples |
| `templates/` | `/templates/` | MG / talking-head template JSON (imported at source build time) |
| `vendor-icons/` | `/vendor-icons/` | Vendor SVGs used by the settings page (imported at source build time) |
| `favicon.svg` / `icons.svg` | `/` | Site icons |

## Division of labour with `public/`

- **`assets/`** (this directory) → built into the product, committed to git.
- **`public/media/uploads/`** → user uploads / AI generations / export intermediates only; gitignored by default.

During development and builds, `server/product-assets.ts` (a Vite plugin) mounts this directory at the site root; Remotion exports overlay this directory the same way. URLs stay identical to what they were before the move out of `public/`.
