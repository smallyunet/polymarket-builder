const state = {
  period: "DAY",
  builders: [],
  volumes: [],
  nextOffset: 0,
  selected: null,
  trades: [],
  nextCursor: null,
  loading: false,
};

const els = {
  loadedBuilders: document.querySelector("#loadedBuilders"),
  lastUpdated: document.querySelector("#lastUpdated"),
  totalVolume: document.querySelector("#totalVolume"),
  totalUsers: document.querySelector("#totalUsers"),
  verifiedCount: document.querySelector("#verifiedCount"),
  bestDay: document.querySelector("#bestDay"),
  builderRows: document.querySelector("#builderRows"),
  rowTemplate: document.querySelector("#builderRowTemplate"),
  searchInput: document.querySelector("#searchInput"),
  verifiedOnly: document.querySelector("#verifiedOnly"),
  refreshButton: document.querySelector("#refreshButton"),
  loadMoreBuilders: document.querySelector("#loadMoreBuilders"),
  emptyDetail: document.querySelector("#emptyDetail"),
  detailContent: document.querySelector("#detailContent"),
  detailAvatar: document.querySelector("#detailAvatar"),
  detailName: document.querySelector("#detailName"),
  detailCode: document.querySelector("#detailCode"),
  detailVolume: document.querySelector("#detailVolume"),
  detailUsers: document.querySelector("#detailUsers"),
  tradeCount: document.querySelector("#tradeCount"),
  tradeVolume: document.querySelector("#tradeVolume"),
  uniqueOwners: document.querySelector("#uniqueOwners"),
  uniqueMarkets: document.querySelector("#uniqueMarkets"),
  makerTrades: document.querySelector("#makerTrades"),
  takerTrades: document.querySelector("#takerTrades"),
  rawTrades: document.querySelector("#rawTrades"),
  cursorState: document.querySelector("#cursorState"),
  volumeBars: document.querySelector("#volumeBars"),
  afterInput: document.querySelector("#afterInput"),
  beforeInput: document.querySelector("#beforeInput"),
  reloadTrades: document.querySelector("#reloadTrades"),
  loadNextTrades: document.querySelector("#loadNextTrades"),
  downloadJson: document.querySelector("#downloadJson"),
  downloadCsv: document.querySelector("#downloadCsv"),
};

const fmtUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const fmtCompactUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 2,
});

const fmtInt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function shortCode(code) {
  if (!code) return "Legacy / empty";
  return `${code.slice(0, 10)}...${code.slice(-8)}`;
}

function initials(name) {
  return (name || "?")
    .split(/[\s.-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function setAvatar(el, builder) {
  el.innerHTML = "";
  if (builder.builderLogo) {
    const img = document.createElement("img");
    img.src = builder.builderLogo;
    img.alt = "";
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => {
      el.textContent = initials(builder.builder);
    });
    el.append(img);
  } else {
    el.textContent = initials(builder.builder);
  }
}

async function api(path) {
  const response = await fetch(path);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }
  return payload;
}

function filteredBuilders() {
  const query = els.searchInput.value.trim().toLowerCase();
  return state.builders.filter((builder) => {
    if (els.verifiedOnly.checked && !builder.verified) return false;
    if (!query) return true;
    return (
      builder.builder?.toLowerCase().includes(query) ||
      builder.builderCode?.toLowerCase().includes(query)
    );
  });
}

function renderSummary() {
  const totalVolume = state.builders.reduce((sum, builder) => sum + number(builder.volume), 0);
  const totalUsers = state.builders.reduce((sum, builder) => sum + number(builder.activeUsers), 0);
  const bestDay = state.volumes.reduce((max, row) => Math.max(max, number(row.volume)), 0);
  els.loadedBuilders.textContent = fmtInt.format(state.builders.length);
  els.totalVolume.textContent = fmtCompactUsd.format(totalVolume);
  els.totalUsers.textContent = fmtInt.format(totalUsers);
  els.verifiedCount.textContent = fmtInt.format(state.builders.filter((builder) => builder.verified).length);
  els.bestDay.textContent = fmtCompactUsd.format(bestDay);
  els.lastUpdated.textContent = `Updated ${new Date().toLocaleString()}`;
}

function renderBuilders() {
  els.builderRows.innerHTML = "";
  const rows = filteredBuilders();

  for (const builder of rows) {
    const row = els.rowTemplate.content.firstElementChild.cloneNode(true);
    row.dataset.code = builder.builderCode;
    if (state.selected?.builderCode === builder.builderCode) row.classList.add("active");
    row.querySelector(".rank").textContent = `#${builder.rank}`;
    row.querySelector(".builder-name").textContent = builder.builder || "Unnamed builder";
    row.querySelector(".builder-status").textContent = builder.verified ? "Verified builder" : "Unverified";
    row.querySelector(".volume").textContent = fmtCompactUsd.format(number(builder.volume));
    row.querySelector(".users").textContent = fmtInt.format(number(builder.activeUsers));
    row.querySelector(".code").textContent = shortCode(builder.builderCode);
    setAvatar(row.querySelector(".avatar"), builder);
    row.addEventListener("click", () => selectBuilder(builder));
    els.builderRows.append(row);
  }

  if (!rows.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.textContent = "No builders match the current filters.";
    cell.className = "muted";
    row.append(cell);
    els.builderRows.append(row);
  }
}

function renderVolumeBars() {
  els.volumeBars.innerHTML = "";
  if (!state.selected) return;

  const rows = state.volumes
    .filter((row) => row.builderCode === state.selected.builderCode)
    .sort((a, b) => new Date(a.dt) - new Date(b.dt))
    .slice(-18);
  const max = Math.max(...rows.map((row) => number(row.volume)), 1);

  for (const row of rows) {
    const item = document.createElement("div");
    item.className = "bar-row";
    const date = document.createElement("span");
    date.textContent = new Date(row.dt).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
    const track = document.createElement("div");
    track.className = "bar-track";
    const fill = document.createElement("div");
    fill.className = "bar-fill";
    fill.style.width = `${Math.max(3, (number(row.volume) / max) * 100)}%`;
    const value = document.createElement("span");
    value.textContent = fmtCompactUsd.format(number(row.volume));
    track.append(fill);
    item.append(date, track, value);
    els.volumeBars.append(item);
  }

  if (!rows.length) {
    els.volumeBars.innerHTML = `<span class="muted">No time-series rows for this period.</span>`;
  }
}

function renderTrades() {
  const owners = new Set(state.trades.map((trade) => trade.owner).filter(Boolean));
  const markets = new Set(state.trades.map((trade) => trade.market).filter(Boolean));
  const tradeVolume = state.trades.reduce((sum, trade) => sum + number(trade.sizeUsdc), 0);

  els.tradeCount.textContent = fmtInt.format(state.trades.length);
  els.tradeVolume.textContent = fmtCompactUsd.format(tradeVolume);
  els.uniqueOwners.textContent = fmtInt.format(owners.size);
  els.uniqueMarkets.textContent = fmtInt.format(markets.size);
  els.makerTrades.textContent = fmtInt.format(state.trades.filter((trade) => trade.tradeType === "MAKER").length);
  els.takerTrades.textContent = fmtInt.format(state.trades.filter((trade) => trade.tradeType === "TAKER").length);
  els.rawTrades.textContent = JSON.stringify(state.trades, null, 2);
  els.cursorState.textContent = state.nextCursor && state.nextCursor !== "LTE=" ? `next_cursor: ${state.nextCursor}` : "End of pages";
  els.loadNextTrades.disabled = !state.nextCursor || state.nextCursor === "LTE=" || state.loading;
}

function renderDetail() {
  if (!state.selected) {
    els.emptyDetail.classList.remove("hidden");
    els.detailContent.classList.add("hidden");
    return;
  }

  const builder = state.selected;
  els.emptyDetail.classList.add("hidden");
  els.detailContent.classList.remove("hidden");
  setAvatar(els.detailAvatar, builder);
  els.detailName.textContent = builder.builder || "Unnamed builder";
  els.detailCode.textContent = builder.builderCode || "Legacy / empty builder code";
  els.detailVolume.textContent = fmtCompactUsd.format(number(builder.volume));
  els.detailUsers.textContent = fmtInt.format(number(builder.activeUsers));
  renderVolumeBars();
  renderTrades();
}

function render() {
  renderSummary();
  renderBuilders();
  renderDetail();
}

async function loadBuilders({ reset = false } = {}) {
  if (reset) {
    state.builders = [];
    state.nextOffset = 0;
    state.selected = null;
    state.trades = [];
    state.nextCursor = null;
  }

  els.refreshButton.disabled = true;
  els.loadMoreBuilders.disabled = true;
  try {
    const page = await api(
      `/api/builders/leaderboard?timePeriod=${state.period}&limit=50&offset=${state.nextOffset}`,
    );
    state.builders = [...state.builders, ...page];
    state.nextOffset += page.length;
    els.loadMoreBuilders.disabled = page.length < 50;
    await loadVolumes();
  } finally {
    els.refreshButton.disabled = false;
  }
  render();
}

async function loadVolumes() {
  try {
    state.volumes = await api(`/api/builders/volume?timePeriod=${state.period}`);
  } catch (error) {
    console.warn(error);
    state.volumes = [];
  }
}

function unixFromInput(input) {
  if (!input.value) return "";
  const ms = new Date(input.value).getTime();
  return Number.isFinite(ms) ? String(Math.floor(ms / 1000)) : "";
}

async function loadTrades({ append = false } = {}) {
  if (!state.selected?.builderCode) return;
  state.loading = true;
  els.reloadTrades.disabled = true;
  els.loadNextTrades.disabled = true;
  try {
    const params = new URLSearchParams({ builder_code: state.selected.builderCode });
    const after = unixFromInput(els.afterInput);
    const before = unixFromInput(els.beforeInput);
    if (after) params.set("after", after);
    if (before) params.set("before", before);
    if (append && state.nextCursor) params.set("next_cursor", state.nextCursor);
    const payload = await api(`/api/builder/trades?${params}`);
    state.trades = append ? [...state.trades, ...(payload.data || [])] : payload.data || [];
    state.nextCursor = payload.next_cursor || null;
  } finally {
    state.loading = false;
    els.reloadTrades.disabled = false;
  }
  renderTrades();
}

async function selectBuilder(builder) {
  state.selected = builder;
  state.trades = [];
  state.nextCursor = null;
  render();
  await loadTrades({ append: false });
  render();
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(href);
}

function csvValue(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadCsv() {
  const columns = [
    "id",
    "tradeType",
    "builderCode",
    "market",
    "assetId",
    "side",
    "size",
    "sizeUsdc",
    "price",
    "status",
    "outcome",
    "owner",
    "maker",
    "transactionHash",
    "matchTime",
    "createdAt",
  ];
  const rows = state.trades.map((trade) => columns.map((column) => csvValue(trade[column])).join(","));
  download(`${state.selected?.builder || "builder"}-trades.csv`, [columns.join(","), ...rows].join("\n"), "text/csv");
}

document.querySelectorAll("[data-period]").forEach((button) => {
  button.addEventListener("click", async () => {
    document.querySelectorAll("[data-period]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.period = button.dataset.period;
    await loadBuilders({ reset: true });
  });
});

els.searchInput.addEventListener("input", renderBuilders);
els.verifiedOnly.addEventListener("change", renderBuilders);
els.refreshButton.addEventListener("click", () => loadBuilders({ reset: true }));
els.loadMoreBuilders.addEventListener("click", () => loadBuilders({ reset: false }));
els.reloadTrades.addEventListener("click", () => loadTrades({ append: false }));
els.loadNextTrades.addEventListener("click", () => loadTrades({ append: true }));
els.downloadJson.addEventListener("click", () => {
  download(`${state.selected?.builder || "builder"}-trades.json`, JSON.stringify(state.trades, null, 2), "application/json");
});
els.downloadCsv.addEventListener("click", downloadCsv);

loadBuilders({ reset: true }).catch((error) => {
  els.builderRows.innerHTML = `<tr><td colspan="5">Failed to load data: ${error.message}</td></tr>`;
  console.error(error);
});
