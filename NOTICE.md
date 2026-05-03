# NOTICE — Attribution & Acknowledgements

## Original work

**9Router** by [@decolua](https://github.com/decolua) and contributors.

- Repository: https://github.com/decolua/9router
- License: MIT (see [LICENSE](./LICENSE))
- Copyright © 2024–2026 decolua and contributors

The vast majority of the code in this repository — including the routing
engine, SSE/streaming layer, OAuth flows, MITM proxy, dashboard UI
framework, provider integrations, and CLI tooling — was authored by
@decolua and the upstream 9Router contributors. This fork would not
exist without their work.

## This fork — 9Peak

**9Peak** is maintained by **Hoivn1 GitHub** as a downstream fork focused
on image generation routing through subscription accounts.

- Fork repository: https://github.com/hoivn1/CCHEATCLI
- Branding: 9Peak
- Copyright © 2026 Hoivn1 GitHub (fork-specific modifications only)

### What 9Peak adds on top of 9Router

- Image generation routing tuned for subscription accounts
  (ChatGPT Plus/Pro, Gemini Pro, etc.) with per-account quota tracking
- Gallery dashboard for browsing generated images (planned)
- MITM Server stability fixes (planned)
- Local fork features documented in [docs/FORK_FEATURES.md](./docs/FORK_FEATURES.md)

### What 9Peak does NOT change

- Core routing, SSE, OAuth, and provider integration logic from 9Router
  remain authored by @decolua. Where modifications were necessary, they
  are marked `// [9peak-fork]` in the source.
- The default API endpoint stays `http://localhost:20128/v1` so 9Peak is
  a drop-in replacement for 9Router (one runs at a time, not both).

## License

Both the original 9Router code and 9Peak modifications are distributed
under the MIT License. See [LICENSE](./LICENSE).

## How to contribute upstream

Bug fixes that are not specific to 9Peak's image-routing focus are
welcome to be sent upstream to https://github.com/decolua/9router
rather than only living in this fork. The goal is to keep divergence
minimal and benefit both projects.

## Contact

- Original author: see https://github.com/decolua/9router
- Fork maintainer (9Peak): https://github.com/hoivn1
