# Legacy DOC parser

Vendored from https://github.com/Alpaq92/JSDoc (src/docToText.js), 0BSD. Only the UMD wrapper was converted to ESM. No parser logic changed. Loaded in a disposable worker with a 10 MiB input limit and 20-second deadline. Encrypted/corrupt/unsupported pre-97 documents fail locally without cloud upload.

Source blob: `5e48dca2f3a2f06817c7d323bce827d972af5b55`. Trailing blank lines were normalized.
