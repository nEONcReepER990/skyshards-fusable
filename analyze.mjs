/**
 * Terminal version of the report (the website lives in server.mjs + public/).
 * Usage: node analyze.mjs [IGN]
 */
import { buildReport, loadDescriptions, loadFusion } from "./lib/fusion.mjs";

const IGN = process.argv[2] ?? "nEONcReepER990";
const res = await fetch(`https://api.skyshards.com/skyshards/profile/${encodeURIComponent(IGN)}`);
if (!res.ok) {
  console.error(`Profile fetch failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}

const report = buildReport(await loadFusion(), await res.json(), {
  ignFallback: IGN,
  descriptions: await loadDescriptions(),
});
const { player, summary } = report;

console.log(`${player.name} (${player.uuid}) · ${player.profile}${player.gameMode ? ` [${player.gameMode}]` : ""}`);
console.log(`${summary.kinds} kinds · ${summary.total} shards · ${report.fusions.length} fusions open · ${report.chains.length} one step away\n`);

for (const rarity of ["legendary", "epic", "rare", "uncommon", "common"]) {
  const list = report.fusions.filter((f) => f.rarity === rarity);
  if (!list.length) continue;
  console.log(`== ${rarity.toUpperCase()} ==`);
  for (const f of list) {
    const inputs = f.inputs.map((i) => `${i.name} ×${i.amount}${i.perCraft > 1 ? ` (${i.perCraft}/craft)` : ""}`).join(" + ");
    console.log(`  ${f.name} ×${f.total}`.padEnd(30) + `<- ${inputs}   ${f.crafts} craft${f.crafts === 1 ? "" : "s"}`);
  }
  console.log();
}

console.log("== ONE FUSION STEP AWAY ==");
for (const c of report.chains) {
  console.log(
    `  ${`${c.name} ×${c.total}`.padEnd(26)}<- ${c.input.name} ×${c.input.amount} + ${c.intermediate.name} (from ${c.intermediate.from
      .map((i) => `${i.name} ×${i.amount}`)
      .join(" + ")})`,
  );
}
