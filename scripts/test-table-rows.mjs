// Unit tests for the tabular-row family: table-row (split + Markdown),
// csv-row, tsv-row, table-kind (is:csv / is:tsv / is:tabular) and bulk-csv.
// Run: node scripts/test-table-rows.mjs
import { build } from "esbuild";

async function load(entry) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    write: false,
  });
  return import(
    "data:text/javascript;base64," +
      Buffer.from(result.outputFiles[0].text).toString("base64")
  );
}

const { splitTableCells, tableRowForClip } = await load("src/lib/table-row.ts");
const { csvRowForClip, escapeCsvCell } = await load("src/lib/csv-row.ts");
const { tsvRowForClip } = await load("src/lib/tsv-row.ts");
const { csvMatches, tsvMatches, tabularMatches } = await load("src/lib/table-kind.ts");
const { planBulkCsv, formatBulkCsvToast } = await load("src/lib/bulk-csv.ts");

let fails = 0;
function eq(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) console.log(`  ✓ ${name}`);
  else {
    fails++;
    console.log(`  ✗ ${name} — got ${g}, want ${w}`);
  }
}
const text = (content) => ({ kind: "text", content });

console.log("splitTableCells");
eq("bare commas", splitTableCells("a,b,c"), ["a", "b", "c"]);
eq("spaces around commas", splitTableCells("a , b,  c"), ["a", "b", "c"]);
eq("empty cells kept", splitTableCells(",,foo"), ["", "", "foo"]);
eq("trailing comma -> empty last cell", splitTableCells("a,b,"), ["a", "b", ""]);
eq("tabs win over commas", splitTableCells("a,1\tb,2"), ["a,1", "b,2"]);
eq("quoted cell keeps its comma", splitTableCells('"Smith, John",42,NY'), ["Smith, John", "42", "NY"]);
eq("doubled quotes unescape", splitTableCells('"say ""hi""",x'), ['say "hi"', "x"]);
eq("quoted empty cell", splitTableCells('"",x'), ["", "x"]);
eq("space before quoted cell", splitTableCells('a, "b, c"'), ["a", "b, c"]);
eq("mid-cell quote is literal", splitTableCells('5" pipe,10'), ['5" pipe', "10"]);
eq("unterminated quote falls back", splitTableCells('"abc,def'), ['"abc', "def"]);
eq("text after closing quote falls back", splitTableCells('"a"b,c'), ['"a"b', "c"]);

console.log("row builders");
eq("table row", tableRowForClip(text("a,b|c")), "| a | b\\|c |");
eq("csv row from quoted input round-trips", csvRowForClip(text('"Smith, John",42')), '"Smith, John",42');
eq("csv row re-escapes quotes", csvRowForClip(text('"say ""hi""",x')), '"say ""hi""",x');
eq("csv row from tsv", csvRowForClip(text("a\tb,c")), 'a,"b,c"');
eq("csv row single quoted cell -> undefined", csvRowForClip(text('"a,b"')), undefined);
eq("csv row multi-line -> undefined", csvRowForClip(text("a,b\nc,d")), undefined);
eq("csv row image -> undefined", csvRowForClip({ kind: "image", content: "a,b" }), undefined);
eq("escapeCsvCell bare", escapeCsvCell("plain"), "plain");
eq("escapeCsvCell CR", escapeCsvCell("a\rb"), '"a\rb"');
eq("tsv row from quoted csv", tsvRowForClip(text('"Smith, John",42')), "Smith, John\t42");
eq("tsv row collapses inner whitespace", tsvRowForClip(text("a  b,c")), "a b\tc");

console.log("table-kind");
eq("csv matches comma row", csvMatches(text("a,b")), true);
eq("csv rejects tab row", csvMatches(text("a\tb")), false);
eq("tsv matches tab row", tsvMatches(text("a\tb")), true);
eq("tabular is the union", [tabularMatches(text("a,b")), tabularMatches(text("a\tb")), tabularMatches(text("ab"))], [true, true, false]);
eq("prose sentence with a comma is not tabular",
  tabularMatches(text("They generate most of the cell's supply of ATP, used as a source of chemical energy.")), false);
eq("short multi-word cells still tabular", tabularMatches(text("John Smith, 42, New York, Software Engineer")), true);
eq("quoted long-ish cell within limit", tabularMatches(text('"Smith, John Q",42,NY')), true);
eq("prose comma row gets no CSV action", csvRowForClip(text("Well, that went better than anyone in the room expected it to")), undefined);

console.log("bulk-csv");
const plan = planBulkCsv([
  { id: "1", kind: "text", content: '"Doe, Jane",30' },
  { id: "2", kind: "text", content: "just prose" },
  null,
  { id: "3", kind: "text", content: "x\ty" },
]);
eq("bulk rows joined by LF", plan.text, '"Doe, Jane",30\nx,y');
eq("bulk counts", [plan.rows, plan.skipped, plan.hasContent], [2, 1, true]);
eq("bulk chars", plan.chars, [...plan.text].length);
eq("bulk empty toast", formatBulkCsvToast(planBulkCsv([{ id: "1", kind: "text", content: "no" }])),
  "Nothing tabular to copy — 1 clip isn't a CSV row");

if (fails) {
  console.log(`\n${fails} table-row test(s) failed`);
  process.exit(1);
}
console.log("\nAll table-row tests passed.");
