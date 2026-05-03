#!/usr/bin/env node

// Legacy alias retained for backward compatibility with existing installs.
// 9Peak (fork of 9Router by @decolua) dispatches all bin commands through 9peak.mjs.
// See NOTICE.md for attribution.

await import("./9peak.mjs");
