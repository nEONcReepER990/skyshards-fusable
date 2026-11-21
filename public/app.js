const $ = (sel) => document.querySelector(sel);
const RARITIES = ["legendary", "epic", "rare", "uncommon", "common"];
const state = { report: null, rarity: "all", filter: "", onlyNeeded: true, onlyUnhuntable: false };

const hideHuntable = () => state.onlyNeeded && state.onlyUnhuntable;

const fmt = (n) => Number(n).toLocaleString();
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function setStatus(message, kind = "") {
  const el = $("#status");
  el.textContent = message;
  el.className = `status ${kind}`;
  el.hidden = !message;
}

/* --------------------------------------------------------------- rendering */

const levelText = (item) =>
  item.maxLevel ? `<span class="lv" title="Attribute level — a maxed shard needs no more fusing">lv ${item.level}/${item.maxLevel}</span>` : "";

function renderSummary() {
  const { player, summary } = state.report;
  $("#player-name").textContent = player.name;
  $("#player-meta").textContent = [
    player.profile ? `profile ${player.profile}` : null,
    player.gameMode,
    player.uuid ? `uuid ${player.uuid.slice(0, 8)}…` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const heaven = summary.byRarity.legendary?.total ?? 0;
  const epic = summary.byRarity.epic?.total ?? 0;
  const fusionTotal = state.report.fusions.length;
  const cards = [
    ["Shards in box", fmt(summary.total), `${summary.kinds} kinds`],
    [
      "Fusions open",
      fmt(fusionTotal),
      `${summary.neededFusions} you still need · ${state.report.chains.length} one step away`,
    ],
    ["Legendary", fmt(heaven), `${summary.fusionCounts.legendary ?? 0} fusable now`],
    ["Epic", fmt(epic), `${summary.fusionCounts.epic ?? 0} fusable now`],
  ];
  $("#summary-cards").innerHTML = cards
    .map(
      ([label, value, sub]) => `<div class="card"><span class="card-label">${label}</span>
        <span class="card-value">${value}</span><span class="card-sub">${sub}</span></div>`,
    )
    .join("");
}

function renderInventory() {
  const q = state.filter.trim().toLowerCase();
  const items = state.report.inventory.filter(
    (s) => !q || s.name.toLowerCase().includes(q) || s.family.toLowerCase().includes(q) || s.id.toLowerCase() === q,
  );
  if (!items.length) {
    $("#inventory").innerHTML = `<p class="empty">No shards match “${esc(state.filter)}”.</p>`;
    return;
  }
  const html = RARITIES.map((rarity) => {
    const list = items.filter((s) => s.rarity === rarity);
    if (!list.length) return "";
    const total = list.reduce((a, s) => a + s.amount, 0);
    return `<div class="rarity-group">
      <div class="rarity-head"><span class="badge ${rarity}">${rarity}</span>
        <span class="muted">${list.length} kinds · ${fmt(total)} shards</span></div>
      <div class="chips">
        ${list
          .map(
            (s) => `<span class="chip" title="${esc(s.family)} · fuse cost ${s.perCraft}">
              ${esc(s.name)} <b>×${fmt(s.amount)}</b></span>`,
          )
          .join("")}
      </div>
    </div>`;
  }).join("");
  $("#inventory").innerHTML = html;
}

function renderNeedToggle() {
  const { summary } = state.report;
  const buttons = { 1: summary.neededFusions, 0: state.report.fusions.length };
  const el = $("#need-toggle");
  el.querySelectorAll("button").forEach((btn) => {
    const need = btn.dataset.need === "1";
    btn.classList.toggle("active", need === state.onlyNeeded);
    const label = need ? "Only what I need" : "All fusions";
    btn.textContent = `${label} (${buttons[btn.dataset.need]})`;
    btn.title = need
      ? "Hide fusions whose attribute is already maxed"
      : "Show every fusion your box supports";
    btn.onclick = () => {
      if (state.onlyNeeded === need) return;
      state.onlyNeeded = need;
      localStorage.setItem("skyshards-fusable:onlyNeeded", need ? "1" : "0");
      renderFusions();
      renderChains();
      renderMissing();
    };
  });

  const hunt = $("#hunt-toggle");
  hunt.hidden = !state.onlyNeeded;
  hunt.classList.toggle("active", state.onlyUnhuntable);
  hunt.setAttribute("aria-pressed", String(state.onlyUnhuntable));
  hunt.textContent = `Fusion-only (${summary.unhuntableNeeded})`;
  hunt.onclick = () => {
    state.onlyUnhuntable = !state.onlyUnhuntable;
    localStorage.setItem("skyshards-fusable:onlyUnhuntable", state.onlyUnhuntable ? "1" : "0");
    renderFusions();
    renderChains();
    renderMissing();
  };
}

function renderFusions() {
  renderNeedToggle();
  const fusions = state.report.fusions.filter(
    (f) => (!state.onlyNeeded || f.needed) && (!hideHuntable() || !f.huntable),
  );
  const tabs = ["all", ...RARITIES].map((r) => {
    const count = r === "all" ? fusions.length : fusions.filter((f) => f.rarity === r).length;
    if (!count) return "";
    return `<button class="tab ${state.rarity === r ? "active" : ""} ${r}" data-rarity="${r}">${
      r === "all" ? "All" : r
    } <span>${count}</span></button>`;
  });
  $("#rarity-tabs").innerHTML = tabs.join("");

  $("#rarity-tabs").querySelectorAll("button").forEach((btn) =>
    btn.addEventListener("click", () => {
      state.rarity = btn.dataset.rarity;
      renderFusions();
    }),
  );

  const list = fusions.filter((f) => state.rarity === "all" || f.rarity === state.rarity);
  $("#fusion-count").textContent = `${list.length} shown${state.onlyNeeded ? ` of ${state.report.fusions.length}` : ""}`;
  if (!list.length) {
    $("#fusions").innerHTML = `<p class="empty">${
      state.onlyNeeded ? "Everything at this rarity is already maxed — switch to “All fusions”." : "Nothing at this rarity."
    }</p>`;
    return;
  }

  $("#fusions").innerHTML = list
    .map((f) => {
      const inputs = f.inputs
        .map(
          (i) =>
            `<span class="in"><b class="${i.perCraft === 1 ? "good" : ""}">${esc(i.name)}</b> ×${fmt(i.amount)}${
              i.perCraft === 1 ? "" : ` <span class="per">(${i.perCraft} used per craft)</span>`
            }</span>`,
        )
        .join(`<span class="plus">+</span>`);
      const options = f.options
        .slice(0, 25)
        .map(
          (o) =>
            `<li>${o.inputs
              .map((i) => `${esc(i.name)} ×${fmt(i.amount)}`)
              .join(" + ")} → <b>${o.produced}</b> (${o.crafts} craft${o.crafts === 1 ? "" : "s"})</li>`,
        )
        .join("");
      return `<details class="fusion ${f.rarity}">
        <summary>
          <span class="badge ${f.rarity}">${f.rarity.slice(0, 3)}</span>
          <span class="out">${esc(f.name)}</span>
          <span class="amount">×${fmt(f.total)}</span>
          <span class="recipe">${inputs}</span>
          <span class="meta">${f.crafts} craft${f.crafts === 1 ? "" : "s"} · +${f.outputQty} each${
            f.pairCount > 1 ? ` · ${f.pairCount} pairings` : ""
          }${f.huntable ? ` · <span class="huntable">huntable</span>` : ""} ${levelText(f)}</span>
        </summary>
        <div class="options">
          <p class="hint">Every listed pairing your box supports (top 25):</p>
          <ul>${options}</ul>
        </div>
      </details>`;
    })
    .join("");
}

function renderChains() {
  const chains = state.report.chains.filter(
    (c) => (!state.onlyNeeded || c.needed) && (!hideHuntable() || !c.huntable),
  );
  $("#chain-count").textContent = `${chains.length} shard${chains.length === 1 ? "" : "s"}${
    state.onlyNeeded ? ` (of ${state.report.chains.length})` : ""
  }`;
  if (!chains.length) {
    $("#chains").innerHTML = `<p class="empty">${
      state.onlyNeeded ? "Nothing here you still need — try “All fusions”." : "No chained fusions available."
    }</p>`;
    return;
  }
  $("#chains").innerHTML = chains
    .map((c) => {
      const mid = c.intermediate;
      return `<div class="fusion chain ${c.rarity}">
        <span class="badge ${c.rarity}">${c.rarity.slice(0, 3)}</span>
        <span class="out">${esc(c.name)}</span>
        <span class="amount">×${fmt(c.total)}</span>
        <span class="recipe">
          <span class="in"><b>${esc(c.input.name)}</b> ×${fmt(c.input.amount)}</span>
          <span class="plus">+</span>
          <span class="in"><b>${esc(mid.name)}</b> <span class="per">(${mid.perCraft} used per craft)</span>
            <span class="sub">from ${mid.from.map((i) => `${esc(i.name)} ×${fmt(i.amount)}`).join(" + ")}</span></span>
        </span>
        <span class="meta">${c.crafts} craft${c.crafts === 1 ? "" : "s"} · +${c.outputQty} each${
          c.huntable ? ` · <span class="huntable">huntable</span>` : ""
        } ${levelText(c)}</span>
      </div>`;
    })
    .join("");
}

function renderMissing() {
  const rows = state.report.missingPartners
    .map((m) => {
      const unlocks = m.unlocks.filter(
        (u) =>
          ["rare", "epic", "legendary"].includes(u.rarity) &&
          (!state.onlyNeeded || u.needed) &&
          (!hideHuntable() || !u.huntable),
      );
      return { ...m, unlocks };
    })
    .filter((m) => m.unlocks.length)
    .slice(0, 24);
  if (!rows.length) {
    $("#missing").innerHTML = `<p class="empty">${
      state.onlyNeeded ? "Nothing here you still need — try “All fusions”." : "Nothing notable."
    }</p>`;
    return;
  }
  $("#missing").innerHTML = rows
    .map(
      (m) => `<div class="missing-row">
        <div class="missing-name"><span class="badge ${m.rarity}">${m.rarity.slice(0, 3)}</span> ${esc(m.name)}
          <span class="muted">· ${m.unlocks.length} RARE+</span></div>
        <div class="chips tight">${m.unlocks
          .slice(0, 8)
          .map((u) => `<span class="chip small ${u.rarity}">${esc(u.name)}</span>`)
          .join("")}${m.unlocks.length > 8 ? `<span class="chip small">+${m.unlocks.length - 8}</span>` : ""}</div>
      </div>`,
    )
    .join("");
}

function render() {
  renderSummary();
  renderInventory();
  renderFusions();
  renderChains();
  renderMissing();
  $("#app").hidden = false;
}

/* ------------------------------------------------------------------ actions */

async function analyze(ign) {
  const name = ign.trim();
  if (!/^[A-Za-z0-9_]{1,16}$/.test(name)) {
    setStatus("Enter a Minecraft username (1–16 letters, numbers or underscores).", "error");
    return;
  }
  $("#submit").disabled = true;
  setStatus(`Fetching ${name}'s hunting box…`, "loading");
  try {
    const res = await fetch(`/api/report?ign=${encodeURIComponent(name)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    state.report = data;
    state.rarity = "all";
    state.onlyNeeded = localStorage.getItem("skyshards-fusable:onlyNeeded") !== "0";
    state.onlyUnhuntable = localStorage.getItem("skyshards-fusable:onlyUnhuntable") === "1";
    localStorage.setItem("skyshards-fusable:ign", name);
    history.replaceState(null, "", `?ign=${encodeURIComponent(name)}`);
    setStatus("");
    render();
  } catch (error) {
    setStatus(error.message, "error");
    $("#app").hidden = true;
  } finally {
    $("#submit").disabled = false;
  }
}

$("#search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  analyze($("#ign").value);
});

$("#shard-filter").addEventListener("input", (event) => {
  state.filter = event.target.value;
  if (state.report) renderInventory();
});

const initial = new URLSearchParams(location.search).get("ign") || localStorage.getItem("skyshards-fusable:ign") || "";
if (initial) {
  $("#ign").value = initial;
  analyze(initial);
} else {
  setStatus("Type your IGN above and press Analyze.");
}
