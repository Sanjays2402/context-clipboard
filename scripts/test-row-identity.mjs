// Unit tests for src/lib/row-identity.ts (host monogram + redundant row tags).
// Run: node scripts/test-row-identity.mjs
import { build } from "esbuild";

const result = await build({
  entryPoints: ["src/lib/row-identity.ts"],
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  write: false,
});
const { siteLabel, hostMonogram, isRedundantRowTag } = await import(
  "data:text/javascript;base64," +
    Buffer.from(result.outputFiles[0].text).toString("base64")
);

let fails = 0;
function eq(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) console.log(`  ✓ ${name}`);
  else {
    fails++;
    console.log(`  ✗ ${name} — got ${g}, want ${w}`);
  }
}

console.log("siteLabel");
eq("plain domain", siteLabel("github.com"), "github");
eq("subdomain", siteLabel("gist.github.com"), "github");
eq("language subdomain", siteLabel("en.wikipedia.org"), "wikipedia");
eq("country second-level", siteLabel("www.bbc.co.uk"), "bbc");
eq("short ccTLD without second-level", siteLabel("example.io"), "example");
eq("single label", siteLabel("localhost"), "localhost");
eq("trailing dot", siteLabel("github.com."), "github");
eq("ip address", siteLabel("192.168.1.10"), "192");
eq("empty", siteLabel(""), "");

console.log("hostMonogram");
const gh = hostMonogram("github.com");
eq("letter is uppercase first char", gh.letter, "G");
eq("hue in range", gh.hue >= 0 && gh.hue < 360, true);
eq("same site, same hue", hostMonogram("gist.github.com").hue, gh.hue);
eq("different sites differ", hostMonogram("gitlab.com").hue !== gh.hue, true);
eq("stable across calls", hostMonogram("github.com"), gh);
eq("null host", hostMonogram(null), null);
eq("empty host", hostMonogram(""), null);
eq("unicode host", hostMonogram("münchen.de").letter, "M");

console.log("isRedundantRowTag");
eq("exact host", isRedundantRowTag("stackoverflow.com", "stackoverflow.com"), true);
eq("www host", isRedundantRowTag("example.com", "www.example.com"), true);
eq("registrable domain of subdomain", isRedundantRowTag("wikipedia.org", "en.wikipedia.org"), true);
eq("other domain kept", isRedundantRowTag("linear.app", "news.ycombinator.com"), false);
eq("suffix lookalike kept", isRedundantRowTag("hub.com", "github.com"), false);
eq("kind tag dropped", isRedundantRowTag("url", "x.com"), true);
eq("kind tag dropped without host", isRedundantRowTag("image", undefined), true);
eq("content tag kept", isRedundantRowTag("code", "github.com"), false);
eq("no host keeps domain tags", isRedundantRowTag("github.com", ""), false);

if (fails) {
  console.log(`\n${fails} row-identity test(s) failed`);
  process.exit(1);
}
console.log("\nAll row-identity tests passed.");
