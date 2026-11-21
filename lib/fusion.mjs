/**
 * Shared fusion logic: turns a SkyShards fusion-data.json plus a player's
 * profile (as returned by the SkyShards backend proxy) into a report.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary"];

export const DATA_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "fusion-data.json");

let fusionCache = null;

export async function loadFusion(file = DATA_PATH) {
  if (fusionCache) return fusionCache;
  fusionCache = JSON.parse(await readFile(file, "utf8"));
  return fusionCache;
}

/** Flatten recipes to unique {outputId, outputQty, inputs:[a,b]} entries. */
export function flattenRecipes(fusion) {
  const seen = new Set();
  const recipes = [];
  for (const [outputId, byQty] of Object.entries(fusion.recipes)) {
    for (const [qtyStr, pairs] of Object.entries(byQty)) {
      for (const [a, b] of pairs) {
        const key = `${outputId}|${qtyStr}|${[a, b].sort().join("|")}`;
        if (seen.has(key)) continue;
        seen.add(key);
        recipes.push({ outputId, outputQty: Number(qtyStr), inputs: [a, b] });
      }
    }
  }
  return recipes;
}

const RANK = new Map(RARITY_ORDER.map((r, i) => [r, i]));

/** Attribute max level per rarity (each shard grants one attribute). */
export const MAX_LEVEL = { common: 96, uncommon: 64, rare: 48, epic: 32, legendary: 24 };

export function buildReport(fusion, profileResponse, { ignFallback = "" } = {}) {
  const shard = (id) => fusion.shards[id] ?? { name: id, rarity: "common", family: "", type: "" };
  const name = (id) => shard(id).name;
  const rarity = (id) => shard(id).rarity;
  const rank = (id) => RANK.get(rarity(id)) ?? 0;
  // Shards spent per input per craft: 5 normally, 2 for reptile/amphibian/elemental, 1 for Chameleon.
  const cost = (id) => shard(id).fuse_amount ?? 5;

  const profile = profileResponse.profiles?.find((p) => p.profile.selected) ?? profileResponse.profiles?.[0];
  if (!profile) throw Object.assign(new Error("No SkyBlock profile found for that player."), { status: 404 });

  const owned = new Map();
  for (const s of profile.shards ?? []) owned.set(s.id, (owned.get(s.id) ?? 0) + s.amount);
  const have = (id) => owned.get(id) ?? 0;

  // Attribute levels decide whether a shard is still worth making: a shard whose
  // attribute is already at max level is one you do not need more of.
  const levels = new Map();
  for (const a of profile.attributes ?? []) levels.set(a.id, a.level);
  const levelOf = (id) => levels.get(id) ?? 0;
  const maxLevelOf = (id) => MAX_LEVEL[rarity(id)] ?? 0;
  const isNeeded = (id) => levelOf(id) < maxLevelOf(id);

  if (owned.size === 0) {
    throw Object.assign(new Error("That profile has no shards exposed by the API (never played Hunting, or a very new profile)."), {
      status: 422,
    });
  }

  const recipes = flattenRecipes(fusion);
  const craftsFrom = (r, amounts) => Math.min(...r.inputs.map((id) => Math.floor((amounts.get(id) ?? 0) / cost(id))));

  // ------------------------------------------------------------- fusions now
  const byOutput = new Map();
  for (const r of recipes) {
    const crafts = craftsFrom(r, owned);
    if (crafts < 1) continue;
    if (!byOutput.has(r.outputId)) byOutput.set(r.outputId, []);
    byOutput.get(r.outputId).push({ ...r, crafts });
  }

  const fusions = [...byOutput.entries()]
    .map(([id, list]) => {
      const best = list.reduce((a, b) => (b.crafts * b.outputQty > a.crafts * a.outputQty ? b : a));
      const options = list
        .slice()
        .sort((a, b) => b.crafts * b.outputQty - a.crafts * a.outputQty)
        .slice(0, 40)
        .map((r) => ({
          inputs: r.inputs.map((i) => ({ id: i, name: name(i), amount: have(i), perCraft: cost(i) })),
          crafts: r.crafts,
          outputQty: r.outputQty,
          produced: r.crafts * r.outputQty,
        }));
      return {
        id,
        name: name(id),
        rarity: rarity(id),
        family: shard(id).family ?? "",
        type: shard(id).type ?? "",
        total: best.crafts * best.outputQty,
        crafts: best.crafts,
        outputQty: best.outputQty,
        inputs: best.inputs.map((i) => ({ id: i, name: name(i), amount: have(i), perCraft: cost(i) })),
        pairCount: list.length,
        options,
        needed: isNeeded(id),
        level: levelOf(id),
        maxLevel: maxLevelOf(id),
      };
    })
    .sort((a, b) => RANK.get(b.rarity) - RANK.get(a.rarity) || b.total - a.total || a.name.localeCompare(b.name));

  const craftable = new Map(fusions.map((f) => [f.id, f]));

  // ------------------------------------------------- one extra fusion step
  const chain = new Map();
  for (const r of recipes) {
    if (r.inputs.every((id) => have(id) >= cost(id))) continue;
    const missing = r.inputs.filter((id) => have(id) < cost(id));
    const present = r.inputs.filter((id) => have(id) >= cost(id));
    if (missing.length !== 1 || present.length !== 1) continue;
    const midId = missing[0];
    if (!craftable.has(midId)) continue;
    const mid = craftable.get(midId);
    const midAvailable = mid.crafts * mid.outputQty;
    const crafts = Math.min(Math.floor(have(present[0]) / cost(present[0])), Math.floor(midAvailable / cost(midId)));
    if (crafts < 1) continue;
    if (!chain.has(r.outputId)) chain.set(r.outputId, []);
    chain.get(r.outputId).push({ ...r, crafts, produced: crafts * r.outputQty, mid, midCrafts: crafts, present: present[0] });
  }

  const chains = [...chain.entries()]
    .filter(([id]) => !craftable.has(id))
    .map(([id, list]) => {
      const best = list.reduce((a, b) => (b.produced > a.produced ? b : a));
      return {
        id,
        name: name(id),
        rarity: rarity(id),
        family: shard(id).family ?? "",
        total: best.produced,
        crafts: best.crafts,
        outputQty: best.outputQty,
        input: { id: best.present, name: name(best.present), amount: have(best.present), perCraft: cost(best.present) },
        intermediate: {
          id: best.mid.id,
          name: best.mid.name,
          rarity: best.mid.rarity,
          perCraft: cost(best.mid.id),
          from: best.mid.inputs,
        },
        pairCount: list.length,
        needed: isNeeded(id),
        level: levelOf(id),
        maxLevel: maxLevelOf(id),
      };
    })
    .sort((a, b) => RANK.get(b.rarity) - RANK.get(a.rarity) || b.total - a.total || a.name.localeCompare(b.name));

  // -------------------------------------------------- missing single partner
  const blocked = new Map();
  for (const r of recipes) {
    if (r.inputs.every((id) => have(id) >= cost(id))) continue;
    const missing = r.inputs.filter((id) => have(id) < cost(id));
    const present = r.inputs.filter((id) => have(id) >= cost(id));
    if (missing.length !== 1 || present.length !== 1) continue;
    const midId = missing[0];
    if (craftable.has(midId) || chain.has(midId)) continue;
    const outs = blocked.get(midId) ?? new Map();
    if (!craftable.has(r.outputId)) outs.set(r.outputId, Math.max(outs.get(r.outputId) ?? 0, r.outputQty));
    blocked.set(midId, outs);
  }

  const missingPartners = [...blocked.entries()]
    .map(([id, outs]) => ({
      id,
      name: name(id),
      rarity: rarity(id),
      unlocks: [...outs.keys()].map((o) => ({ id: o, name: name(o), rarity: rarity(o), needed: isNeeded(o) })),
      highTier: [...outs.keys()].filter((o) => RANK.get(rarity(o)) >= 3).length,
      neededHighTier: [...outs.keys()].filter((o) => RANK.get(rarity(o)) >= 3 && isNeeded(o)).length,
    }))
    .filter((b) => b.highTier > 0)
    .sort((a, b) => b.highTier - a.highTier || RANK.get(b.rarity) - RANK.get(a.rarity));

  // ---------------------------------------------------------------- inventory
  const inventory = [...owned.entries()]
    .map(([id, amount]) => ({
      id,
      amount,
      name: name(id),
      rarity: rarity(id),
      family: shard(id).family ?? "",
      type: shard(id).type ?? "",
      perCraft: cost(id),
    }))
    .sort((a, b) => RANK.get(b.rarity) - RANK.get(a.rarity) || b.amount - a.amount);

  const byRarity = {};
  for (const s of inventory) {
    byRarity[s.rarity] ??= { kinds: 0, total: 0 };
    byRarity[s.rarity].kinds += 1;
    byRarity[s.rarity].total += s.amount;
  }

  return {
    player: {
      name: profileResponse.username ?? ignFallback,
      uuid: profileResponse.uuid ?? null,
      profile: profile.profile.cute_name,
      gameMode: profile.profile.game_mode ?? null,
    },
    fetchedAt: new Date().toISOString(),
    inventory,
    summary: {
      kinds: inventory.length,
      total: inventory.reduce((a, s) => a + s.amount, 0),
      byRarity,
      fusionCounts: fusions.reduce((acc, f) => ((acc[f.rarity] = (acc[f.rarity] ?? 0) + 1), acc), {}),
      neededFusions: fusions.filter((f) => f.needed).length,
      neededChains: chains.filter((c) => c.needed).length,
    },
    fusions,
    chains,
    missingPartners,
  };
}
