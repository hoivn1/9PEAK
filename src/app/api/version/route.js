import https from "https";
import pkg from "../../../../package.json" with { type: "json" };

// 9Peak fork: still query upstream `9router` so user knows when upstream
// has a new release worth cherry-picking. The response below sets
// `isUpstreamCheck: true` so the Sidebar shows an informational notice
// (link to upstream changelog) instead of an auto-Update button —
// auto-update would overwrite the fork binary with upstream and erase
// the 9Peak branding/features.
const NPM_PACKAGE_NAME = "9router";

// Fetch latest version from npm registry
function fetchLatestVersion() {
  return new Promise((resolve) => {
    const req = https.get(
      `https://registry.npmjs.org/${NPM_PACKAGE_NAME}/latest`,
      { timeout: 4000 },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data).version || null);
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}

function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

export async function GET() {
  const latestVersion = await fetchLatestVersion();
  const currentVersion = pkg.version;
  // Note: currentVersion (9peak, e.g. "0.2.4") and latestVersion (upstream
  // 9router, e.g. "0.4.5") are on independent version tracks. compareVersions
  // here just answers "is there a newer upstream tag worth looking at?",
  // not "should we install it". Sidebar renders this as informational only.
  const hasUpdate = latestVersion ? compareVersions(latestVersion, currentVersion) > 0 : false;
  return Response.json({
    currentVersion,
    latestVersion,
    hasUpdate,
    isUpstreamCheck: true,
    upstreamPackage: NPM_PACKAGE_NAME,
    upstreamUrl: "https://github.com/decolua/9router",
    upstreamChangelogUrl: "https://github.com/decolua/9router/blob/master/CHANGELOG.md",
    upstreamReleasesUrl: "https://github.com/decolua/9router/releases",
  });
}
