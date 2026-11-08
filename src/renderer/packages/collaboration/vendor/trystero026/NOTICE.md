# Trystero 0.26.0 transport

Published ESM distributions are vendored for reproducible, offline application builds. No scripts from npm packages are executed during vendoring. SHA-512 integrity was verified against npm package metadata before extraction:

- `@trystero-p2p/nostr@0.26.0`: `sha512-HArp9fonBkqFZgw3U2D823fCePQv7haKkvjtwbGRkWzy+Wo9G3cCDEnG/GENDWwzERHrhRcRacpFsFt4JpwRJQ==`
- `@trystero-p2p/core@0.26.0`: `sha512-CZpeXPgfbDdFKrGxfD98F9tn/fTjya4mQ2o/Ax6H0qpBaJXCBz5+jyPtjsYEPAAcKRK/btOatCetFiQ5qIMCOA==`
- `@noble/secp256k1@3.2.0`: `sha512-Z3ZAWOTxJ0EuTuZTi7Y69iK7GgrLHh8sgm45lVDhg/b3Nk1TpAiKhick2KkZisHuupeepSkyIydN/J459SdX1w==`

Local packaging changes: Nostr's two package imports point at sibling vendored modules; source-map URL comments are omitted; the standalone secp256k1 module uses `.mjs`; `nostr.d.mts` describes only the narrow API consumed by Chatbox. Runtime algorithms are unmodified. `SHA256.json` records every shipped runtime module. MIT licenses are included beside this notice.

The update removes the obsolete preallocated offer pool and includes upstream fixes for expired unanswered offers losing their data-channel transport ([#204](https://github.com/dmotz/trystero/issues/204)), stale fast-rejoin bindings ([#203](https://github.com/dmotz/trystero/issues/203)) and excessive standby peer allocations ([#197](https://github.com/dmotz/trystero/issues/197)). QR generation/decoding continues using the existing licensed chicCanva bundle; its Trystero export is no longer used.

New invitations use `CB2` and a separate application namespace, avoiding silently mixed transport versions. Both devices must update and recreate invitations. The authenticated ECDH/AES-GCM content channel and explicit owner admission remain enforced by Chatbox.
