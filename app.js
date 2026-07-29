import {
  getBuilderMetadata,
  TRACKED_BUILDER_CODE,
} from "./data/builder-metadata.js";

const state = {
  period: "MONTH",
  detailRange: "30d",
  trendMetric: "volume",
  builders: [],
  volumes: [],
  detailVolumes: [],
  nextOffset: 0,
  selected: null,
  trades: [],
  nextCursor: null,
  tradeMeta: { limit: 0, count: 0 },
  tradeFilters: { id: "", market: "", asset_id: "" },
  marketMetadata: new Map(),
  volumeLoading: null,
  loading: false,
  isLoadingBuilders: false,
  hasMoreBuilders: true,
  sortColumn: null,
  sortDirection: "asc",
  trackedBuilderStatus: "loading",
  trackedBuilderPromise: null,
  trackedJumpUntil: 0,
  mobileView: document.body.dataset.mobileView === "market" ? "market" : "leaderboard",
  mobileScrollPositions: { leaderboard: 0, market: 0 },
};

const els = {
  leaderboardShell: document.querySelector(".leaderboard-shell"),
  topbar: document.querySelector(".topbar"),
  viraeNavLink: document.querySelector("#viraeNavLink"),
  builderRows: document.querySelector("#builderRows"),
  rowTemplate: document.querySelector("#builderRowTemplate"),
  searchInput: document.querySelector("#searchInput"),
  verifiedOnly: document.querySelector("#verifiedOnly"),
  refreshButton: document.querySelector("#refreshButton"),
  loadMoreBuilders: document.querySelector("#loadMoreBuilders"),
  
  // Detail sidebar elements
  emptyDetail: document.querySelector("#emptyDetail"),
  detailContent: document.querySelector("#detailContent"),
  detailAvatar: document.querySelector("#detailAvatar"),
  detailName: document.querySelector("#detailName"),
  detailWebsite: document.querySelector("#detailWebsite"),
  detailCode: document.querySelector("#detailCode"),
  detailVolume: document.querySelector("#detailVolume"),
  detailUsers: document.querySelector("#detailUsers"),
  detailTradeCount: document.querySelector("#detailTradeCount"),
  detailTradeValue: document.querySelector("#detailTradeValue"),
  detailFees: document.querySelector("#detailFees"),
  detailBuilderFees: document.querySelector("#detailBuilderFees"),
  detailOwners: document.querySelector("#detailOwners"),
  detailTradeMix: document.querySelector("#detailTradeMix"),
  detailStatus: document.querySelector("#detailStatus"),
  detailRangeLabel: document.querySelector("#detailRangeLabel"),
  rawTrades: document.querySelector("#rawTrades"),
  cursorState: document.querySelector("#cursorState"),
  trendChart: document.querySelector("#trendChart"),
  trendSummary: document.querySelector("#trendSummary"),
  loadNextTrades: document.querySelector("#loadNextTrades"),
  downloadJson: document.querySelector("#downloadJson"),
  downloadCsv: document.querySelector("#downloadCsv"),
  tradeError: document.querySelector("#tradeError"),
  tradeIdFilter: document.querySelector("#tradeIdFilter"),
  marketFilter: document.querySelector("#marketFilter"),
  assetFilter: document.querySelector("#assetFilter"),
  applyTradeFilters: document.querySelector("#applyTradeFilters"),
  clearTradeFilters: document.querySelector("#clearTradeFilters"),
  
  // Newly added elements
  globalVolumeChart: document.querySelector("#globalVolumeChart"),
  globalChartLegend: document.querySelector("#globalChartLegend"),
  globalChartTitle: document.querySelector("#globalChartTitle"),
  globalYAxis: document.querySelector("#globalYAxis"),
  copyCodeButton: document.querySelector("#copyCodeButton"),
  tradeRows: document.querySelector("#tradeRows"),
  tradeRowTemplate: document.querySelector("#tradeRowTemplate"),
  accordionHeader: document.querySelector("#accordionHeader"),
  accordionContent: document.querySelector("#accordionContent"),
  backToListButton: document.querySelector("#backToListButton"),
  viraeTracker: document.querySelector("#viraeTracker"),
  viraeTrackerButton: document.querySelector("#viraeTrackerButton"),
  viraeTrackerAvatar: document.querySelector("#viraeTrackerAvatar"),
  viraeTrackerStatus: document.querySelector("#viraeTrackerStatus"),
  viraeTrackerPeriod: document.querySelector("#viraeTrackerPeriod"),
  viraeTrackerRank: document.querySelector("#viraeTrackerRank"),
  viraeTrackerVolume: document.querySelector("#viraeTrackerVolume"),
  viraeTrackerUsers: document.querySelector("#viraeTrackerUsers"),
  viraeVisibleRange: document.querySelector("#viraeVisibleRange"),
  viraeRankMarker: document.querySelector("#viraeRankMarker"),
  leaderboardPanel: document.querySelector("#leaderboardPanel"),
  marketVolumePanel: document.querySelector("#marketVolumePanel"),
  mobileViewTabs: [...document.querySelectorAll("[data-mobile-view]")].filter(
    (element) => element.matches(".mobile-primary-tab"),
  ),
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
const fmtDecimal = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });
const fmtPreciseUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
});

const detailRanges = {
  "7d": { label: "Last 7 calendar days", days: 7 },
  "30d": { label: "Last 30 calendar days", days: 30 },
  all: { label: "All available daily history", days: null },
};

// Tooltip Utility
let globalTooltip = document.querySelector("#globalTooltip");
if (!globalTooltip) {
  globalTooltip = document.createElement("div");
  globalTooltip.id = "globalTooltip";
  globalTooltip.className = "custom-tooltip hidden";
  document.body.appendChild(globalTooltip);
}

function showTooltip(e, html) {
  globalTooltip.innerHTML = html;
  globalTooltip.classList.remove("hidden");
  positionTooltip(e);
}

function positionTooltip(e) {
  globalTooltip.style.left = `${e.pageX + 12}px`;
  globalTooltip.style.top = `${e.pageY + 12}px`;
}

function hideTooltip() {
  globalTooltip.classList.add("hidden");
}

function parseTradeTime(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 1e12 ? numeric * 1000 : numeric)
    : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function shortCode(code) {
  if (!code) return "Legacy / empty";
  return `${code.slice(0, 10)}...${code.slice(-8)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeExternalUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function websiteLabel(value) {
  const url = safeExternalUrl(value);
  if (!url) return "";
  return new URL(url).hostname.replace(/^www\./, "");
}

function primaryOfficialLink(metadata) {
  for (const type of ["website", "telegram", "x", "github", "discord"]) {
    const url = safeExternalUrl(metadata?.links?.[type]);
    if (url) return { type, url };
  }
  return null;
}

function withBuilderMetadata(builder) {
  return {
    ...builder,
    metadata: getBuilderMetadata(builder?.builderCode),
  };
}

function applyCuratedNavigation() {
  const website = safeExternalUrl(
    getBuilderMetadata(TRACKED_BUILDER_CODE)?.links?.website,
  );
  if (!website || !els.viraeNavLink) return;
  els.viraeNavLink.href = website;
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
    img.alt = `${builder.builder || "Builder"} logo`;
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

function isLocalProxyAvailable() {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function apiUrl(path) {
  const url = new URL(path, window.location.origin);
  if (isLocalProxyAvailable()) return `${url.pathname}${url.search}`;

  if (url.pathname === "/api/builders/leaderboard") {
    return `https://data-api.polymarket.com/v1/builders/leaderboard${url.search}`;
  }
  if (url.pathname === "/api/builders/volume") {
    return `https://data-api.polymarket.com/v1/builders/volume${url.search}`;
  }
  if (url.pathname === "/api/builder/trades") {
    return `https://clob.polymarket.com/builder/trades${url.search}`;
  }
  if (url.pathname === "/api/markets") {
    return `https://gamma-api.polymarket.com/markets${url.search}`;
  }
  return path;
}

async function api(path) {
  const response = await fetch(apiUrl(path), { headers: { accept: "application/json" } });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(payload?.error || `Request failed: ${response.status}`);
  }
  return payload;
}

function searchQuery() {
  return els.searchInput.value.trim().toLowerCase();
}

function isTrackedBuilder(builder) {
  return (
    builder?.builderCode?.toLowerCase() === TRACKED_BUILDER_CODE ||
    builder?.builder?.trim().toLowerCase() === "virae.ai"
  );
}

function trackedBuilder() {
  return state.builders.find(isTrackedBuilder) || null;
}

function builderMatchesSearch(builder, query = searchQuery()) {
  if (!query) return false;
  return (
    builder.builder?.toLowerCase().includes(query) ||
    builder.builderCode?.toLowerCase().includes(query) ||
    Object.values(builder.metadata?.links || {}).some(
      (value) => value.toLowerCase().includes(query),
    )
  );
}

function visibleBuilders() {
  return state.builders.filter((builder) => {
    if (els.verifiedOnly.checked && !builder.verified) return false;
    return true;
  });
}

function visibleAndSortedBuilders() {
  const list = visibleBuilders();
  if (state.sortColumn) {
    list.sort((a, b) => {
      let valA, valB;
      if (state.sortColumn === "rank") {
        valA = number(a.rank);
        valB = number(b.rank);
      } else if (state.sortColumn === "project") {
        valA = (a.builder || "").toLowerCase();
        valB = (b.builder || "").toLowerCase();
      } else if (state.sortColumn === "volume") {
        valA = number(a.volume);
        valB = number(b.volume);
      } else if (state.sortColumn === "users") {
        valA = number(a.activeUsers);
        valB = number(b.activeUsers);
      }
      
      if (valA < valB) return state.sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return state.sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }
  return list;
}

function firstSearchMatch() {
  const query = searchQuery();
  if (!query) return null;
  return visibleAndSortedBuilders().find((builder) => builderMatchesSearch(builder, query)) || null;
}

function scrollBuilderRowIntoView(builderCode) {
  if (!builderCode) return;
  const row = els.builderRows.querySelector(`tr[data-code="${CSS.escape(builderCode)}"]`);
  row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function renderBuilders() {
  els.builderRows.innerHTML = "";
  
  // Update header classes to show sorting arrows
  document.querySelectorAll("th.sortable").forEach((th) => {
    th.classList.remove("asc", "desc");
    th.setAttribute("aria-sort", "none");
    if (th.dataset.sort === state.sortColumn) {
      th.classList.add(state.sortDirection);
      th.setAttribute("aria-sort", state.sortDirection === "asc" ? "ascending" : "descending");
    }
  });

  const rows = visibleAndSortedBuilders();
  const query = searchQuery();

  for (const builder of rows) {
    const row = els.rowTemplate.content.firstElementChild.cloneNode(true);
    row.dataset.code = builder.builderCode;
    row.dataset.rank = String(builder.rank || "");
    row.tabIndex = 0;
    if (state.selected?.builderCode === builder.builderCode) row.classList.add("active");
    if (builderMatchesSearch(builder, query)) row.classList.add("search-match");
    if (isTrackedBuilder(builder)) {
      row.classList.add("tracked-builder-row");
      if (Date.now() < state.trackedJumpUntil) row.classList.add("tracked-jump");
      row.setAttribute("aria-label", `Tracked builder Virae.ai, rank ${builder.rank}`);
    }
    row.querySelector(".rank-cell").textContent = `#${builder.rank}`;
    row.querySelector(".builder-name").textContent = builder.builder || "Unnamed builder";

    const officialLink = primaryOfficialLink(builder.metadata);
    const websiteLink = row.querySelector(".builder-website");
    if (officialLink) {
      const label = websiteLabel(officialLink.url);
      websiteLink.href = officialLink.url;
      websiteLink.title = `Open ${builder.builder || label} official ${officialLink.type}`;
      websiteLink.setAttribute("aria-label", `Open ${builder.builder || label} official ${officialLink.type} (opens in a new tab)`);
      websiteLink.querySelector(".builder-website-label").textContent = label;
      websiteLink.classList.remove("hidden");
      row.querySelector(".website-empty").classList.add("hidden");
      websiteLink.addEventListener("click", (event) => event.stopPropagation());
    }
    
    // Status with premium badge
    const statusEl = row.querySelector(".builder-status");
    if (builder.verified) {
      statusEl.innerHTML = `<span style="color:var(--blue-hover); display:inline-flex; align-items:center; gap:4px; font-weight:600;"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg> Verified</span>`;
    } else {
      statusEl.textContent = "Unverified";
      statusEl.style.color = "var(--ink-subtle)";
    }
    if (isTrackedBuilder(builder)) {
      const trackedBadge = document.createElement("span");
      trackedBadge.className = "tracked-badge";
      trackedBadge.textContent = "Tracked";
      statusEl.append(trackedBadge);
    }
    
    row.querySelector(".volume-cell").textContent = fmtCompactUsd.format(number(builder.volume));
    row.querySelector(".users-cell").textContent = fmtInt.format(number(builder.activeUsers));
    const codeValue = row.querySelector(".code-value");
    codeValue.textContent = shortCode(builder.builderCode);
    codeValue.title = builder.builderCode || "Legacy / empty builder code";
    setAvatar(row.querySelector(".avatar"), builder);
    row.addEventListener("click", () => selectBuilder(builder));
    row.addEventListener("keydown", (event) => {
      if (event.target.closest("a, button")) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectBuilder(builder);
      }
    });
    els.builderRows.append(row);
  }

  if (!rows.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.textContent = state.isLoadingBuilders ? "Loading projects..." : "No builders match the current filters.";
    cell.className = "muted";
    cell.style.textAlign = "center";
    row.append(cell);
    els.builderRows.append(row);
  }
}

function renderYAxis(axisEl, maxVal) {
  axisEl.innerHTML = "";
  if (maxVal <= 0) return;
  for (let i = 4; i >= 0; i--) {
    const val = (maxVal * i) / 4;
    const pct = i * 25;
    const line = document.createElement("div");
    line.className = "chart-y-line";
    line.style.bottom = `${pct}%`;
    
    const label = document.createElement("span");
    label.className = "chart-y-label";
    label.textContent = fmtCompactUsd.format(val);
    line.append(label);
    axisEl.append(line);
  }
}

function renderGlobalVolumeChart() {
  els.globalVolumeChart.innerHTML = "";
  els.globalChartLegend.innerHTML = "";
  els.globalYAxis.innerHTML = "";
  
  if (!state.volumes || state.volumes.length === 0) {
    els.globalVolumeChart.innerHTML = '<div style="margin: auto; color: var(--ink-muted); font-size: 13px;">No volume history available.</div>';
    return;
  }

  // Group volumes by date (dt)
  const dateMap = {};
  for (const row of state.volumes) {
    if (!row.dt) continue;
    const dateStr = row.dt.split("T")[0];
    if (!dateMap[dateStr]) {
      dateMap[dateStr] = {};
    }
    dateMap[dateStr][row.builderCode] = (dateMap[dateStr][row.builderCode] || 0) + number(row.volume);
  }

  // Sort dates chronological and take last 18
  const dates = Object.keys(dateMap).sort((a, b) => new Date(a) - new Date(b)).slice(-18);
  if (dates.length === 0) {
    els.globalVolumeChart.innerHTML = '<div style="margin: auto; color: var(--ink-muted); font-size: 13px;">No volume history available.</div>';
    return;
  }

  // Sum up total volume for each builder to select top 8
  const builderTotals = {};
  for (const dt of dates) {
    for (const code of Object.keys(dateMap[dt])) {
      builderTotals[code] = (builderTotals[code] || 0) + dateMap[dt][code];
    }
  }

  // Sort builders by total volume
  const sortedBuilderCodes = Object.keys(builderTotals).sort((a, b) => builderTotals[b] - builderTotals[a]);
  const topBuilderCodes = sortedBuilderCodes.slice(0, 8);

  els.globalChartTitle.textContent = `Daily Builder Volume — Last ${dates.length} Day${dates.length === 1 ? "" : "s"}`;

  // Map builder code to name. Volume rows are authoritative even when the
  // matching builder has not yet been loaded through leaderboard pagination.
  const codeToName = {};
  for (const row of state.volumes) {
    if (row.builderCode && row.builder) codeToName[row.builderCode] = row.builder;
  }
  for (const builder of state.builders) {
    codeToName[builder.builderCode] = builder.builder || "Unnamed builder";
  }

  // Color Palette
  const colors = [
    "var(--chart-c1)",
    "var(--chart-c2)",
    "var(--chart-c3)",
    "var(--chart-c4)",
    "var(--chart-c5)",
    "var(--chart-c6)",
    "var(--chart-c7)",
    "var(--chart-c8)",
  ];
  const otherColor = "var(--chart-other)";

  // Find max total daily volume to scale y-axis
  const dailyTotals = dates.map(dt => Object.values(dateMap[dt]).reduce((a, b) => a + b, 0));
  const maxDailyTotal = Math.max(...dailyTotals, 1);

  // Render Y-Axis
  renderYAxis(els.globalYAxis, maxDailyTotal);

  // Render each bar column
  dates.forEach((dt, dateIdx) => {
    const totalVol = dailyTotals[dateIdx];
    const columnPct = (totalVol / maxDailyTotal) * 100;

    const column = document.createElement("div");
    column.className = "bar-column";

    const track = document.createElement("div");
    track.className = "bar-track-vertical";
    track.style.height = "0%";

    // Stack segments
    let otherSum = 0;
    
    sortedBuilderCodes.forEach(code => {
      const vol = dateMap[dt][code] || 0;
      if (vol <= 0) return;

      const isTop = topBuilderCodes.includes(code);
      if (isTop) {
        const seg = document.createElement("div");
        seg.className = "bar-segment";
        seg.style.height = `${(vol / totalVol) * 100}%`;
        const color = colors[topBuilderCodes.indexOf(code)];
        seg.style.background = color;
        
        const builderName = codeToName[code] || shortCode(code);
        const dateObj = new Date(dt + "T00:00:00");
        const dateFormatted = dateObj.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
        const tooltipHtml = `
          <div style="font-weight: 600; margin-bottom: 2px;">${escapeHtml(builderName)}</div>
          <div style="color: var(--blue-hover); font-weight: 700; font-size: 13px;">${fmtUsd.format(vol)}</div>
          <div style="color: var(--ink-subtle); font-size: 10px; margin-top: 2px;">${dateFormatted}</div>
        `;
        seg.addEventListener("mouseover", (e) => showTooltip(e, tooltipHtml));
        seg.addEventListener("mousemove", positionTooltip);
        seg.addEventListener("mouseout", hideTooltip);
        
        track.append(seg);
      } else {
        otherSum += vol;
      }
    });

    if (otherSum > 0) {
      const seg = document.createElement("div");
      seg.className = "bar-segment";
      seg.style.height = `${(otherSum / totalVol) * 100}%`;
      seg.style.background = otherColor;
      
      const dateObj = new Date(dt + "T00:00:00");
      const dateFormatted = dateObj.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
      const tooltipHtml = `
        <div style="font-weight: 600; margin-bottom: 2px;">Other Builders</div>
        <div style="color: var(--ink-muted); font-weight: 700; font-size: 13px;">${fmtUsd.format(otherSum)}</div>
        <div style="color: var(--ink-subtle); font-size: 10px; margin-top: 2px;">${dateFormatted}</div>
      `;
      seg.addEventListener("mouseover", (e) => showTooltip(e, tooltipHtml));
      seg.addEventListener("mousemove", positionTooltip);
      seg.addEventListener("mouseout", hideTooltip);
      
      track.append(seg);
    }

    column.append(track);

    // X-Axis date label
    const label = document.createElement("span");
    label.className = "bar-label";
    const dateObj = new Date(dt + "T00:00:00");
    label.textContent = dateObj.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    column.append(label);

    els.globalVolumeChart.append(column);

    // Staggered slide-up entry animation
    setTimeout(() => {
      track.style.height = `${columnPct}%`;
    }, 50 + dateIdx * 20);
  });

  // Render Legend items
  topBuilderCodes.forEach((code, idx) => {
    const name = codeToName[code] || shortCode(code);
    const item = document.createElement("div");
    item.className = "legend-item";
    
    const dot = document.createElement("div");
    dot.className = "legend-color";
    dot.style.background = colors[idx];
    
    const text = document.createElement("span");
    text.textContent = name;
    
    item.append(dot, text);
    els.globalChartLegend.append(item);
  });

  if (sortedBuilderCodes.length > topBuilderCodes.length) {
    const item = document.createElement("div");
    item.className = "legend-item";
    
    const dot = document.createElement("div");
    dot.className = "legend-color";
    dot.style.background = otherColor;
    
    const text = document.createElement("span");
    text.textContent = "Other";
    
    item.append(dot, text);
    els.globalChartLegend.append(item);
  }
}

function detailTrendRows() {
  if (!state.selected) return [];
  const rows = state.detailVolumes
    .filter((row) => row.builderCode === state.selected.builderCode && row.dt)
    .sort((a, b) => new Date(a.dt) - new Date(b.dt));
  const days = detailRanges[state.detailRange].days;
  if (!days || !rows.length) return rows;
  const lastDate = new Date(rows.at(-1).dt);
  const cutoff = new Date(lastDate);
  cutoff.setUTCDate(cutoff.getUTCDate() - days + 1);
  return rows.filter((row) => new Date(row.dt) >= cutoff);
}

function trendMetricConfig() {
  if (state.trendMetric === "activeUsers") {
    return { label: "Active users", format: (value) => fmtInt.format(value), rank: false };
  }
  if (state.trendMetric === "rank") {
    return { label: "Rank", format: (value) => `#${fmtInt.format(value)}`, rank: true };
  }
  return { label: "Volume", format: (value) => fmtCompactUsd.format(value), rank: false };
}

function createSvgElement(name, attributes = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, value);
  return el;
}

function renderTrendChart() {
  els.trendChart.innerHTML = "";
  els.trendSummary.textContent = "";
  if (!state.selected) return;

  const rows = detailTrendRows();
  const metric = trendMetricConfig();
  if (!rows.length) {
    els.trendChart.innerHTML = '<span class="muted empty-chart">No daily records for this builder and window.</span>';
    els.trendChart.setAttribute("aria-label", `No ${metric.label.toLowerCase()} history available`);
    return;
  }

  const values = rows.map((row) => number(row[state.trendMetric]));
  const first = values[0];
  const latest = values.at(-1);
  const change = latest - first;
  const firstDate = new Date(rows[0].dt);
  const lastDate = new Date(rows.at(-1).dt);
  const dateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
  const direction = metric.rank
    ? (change < 0 ? `${fmtInt.format(Math.abs(change))} places up` : change > 0 ? `${fmtInt.format(change)} places down` : "unchanged")
    : `${change >= 0 ? "+" : "−"}${metric.format(Math.abs(change))}`;
  els.trendSummary.textContent = `${rows.length} daily records · ${dateFormat.format(firstDate)} – ${dateFormat.format(lastDate)} · Latest ${metric.format(latest)} · ${direction}`;
  els.trendChart.setAttribute(
    "aria-label",
    `${metric.label} trend for ${state.selected.builder || "builder"} from ${dateFormat.format(firstDate)} to ${dateFormat.format(lastDate)}. Latest ${metric.format(latest)}.`,
  );

  const width = 720;
  const height = 236;
  const pad = { left: 60, right: 18, top: 18, bottom: 34 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min = Math.max(0, min - 1);
    max += 1;
  }
  const x = (index) => pad.left + (index / Math.max(1, rows.length - 1)) * plotWidth;
  const y = (value) => {
    const ratio = (value - min) / (max - min);
    return pad.top + (metric.rank ? ratio : 1 - ratio) * plotHeight;
  };

  const svg = createSvgElement("svg", {
    viewBox: `0 0 ${width} ${height}`,
    preserveAspectRatio: "none",
    "aria-hidden": "true",
  });

  for (let index = 0; index <= 4; index += 1) {
    const lineY = pad.top + (index / 4) * plotHeight;
    svg.append(createSvgElement("line", {
      x1: pad.left,
      x2: width - pad.right,
      y1: lineY,
      y2: lineY,
      class: "trend-grid-line",
    }));
    const rawValue = metric.rank
      ? min + (index / 4) * (max - min)
      : max - (index / 4) * (max - min);
    const label = createSvgElement("text", {
      x: pad.left - 8,
      y: lineY + 4,
      class: "trend-axis-label",
      "text-anchor": "end",
    });
    label.textContent = metric.format(rawValue);
    svg.append(label);
  }

  const areaPoints = rows.map((row, index) => `${x(index)},${y(number(row[state.trendMetric]))}`);
  const area = createSvgElement("path", {
    d: `M ${pad.left} ${pad.top + plotHeight} L ${areaPoints.join(" L ")} L ${x(rows.length - 1)} ${pad.top + plotHeight} Z`,
    class: "trend-area",
  });
  const path = createSvgElement("polyline", {
    points: areaPoints.join(" "),
    class: "trend-line",
  });
  svg.append(area, path);

  const labelIndexes = [...new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1])];
  for (const index of labelIndexes) {
    const label = createSvgElement("text", {
      x: x(index),
      y: height - 8,
      class: "trend-axis-label",
      "text-anchor": index === 0 ? "start" : index === rows.length - 1 ? "end" : "middle",
    });
    label.textContent = new Date(rows[index].dt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    svg.append(label);
  }

  rows.forEach((row, index) => {
    const value = number(row[state.trendMetric]);
    const point = createSvgElement("circle", {
      cx: x(index),
      cy: y(value),
      r: rows.length > 90 ? 3 : 4,
      class: "trend-point",
      tabindex: "0",
    });
    const fullDate = dateFormat.format(new Date(row.dt));
    const title = createSvgElement("title");
    title.textContent = `${metric.label}: ${metric.format(value)} — ${fullDate}`;
    point.append(title);
    svg.append(point);
  });

  const crosshair = createSvgElement("g", { class: "trend-crosshair" });
  const verticalLine = createSvgElement("line", {
    y1: pad.top,
    y2: pad.top + plotHeight,
    class: "trend-crosshair-line",
  });
  const horizontalLine = createSvgElement("line", {
    x1: pad.left,
    x2: width - pad.right,
    class: "trend-crosshair-line",
  });
  const activePoint = createSvgElement("circle", {
    r: 6,
    class: "trend-crosshair-point",
  });
  crosshair.append(verticalLine, horizontalLine, activePoint);
  svg.append(crosshair);

  const hitArea = createSvgElement("rect", {
    x: pad.left,
    y: pad.top,
    width: plotWidth,
    height: plotHeight,
    class: "trend-hit-area",
  });
  let activeIndex = -1;
  const activateCrosshair = (event) => {
    const bounds = svg.getBoundingClientRect();
    const pointerX = ((event.clientX - bounds.left) / bounds.width) * width;
    const ratio = Math.min(1, Math.max(0, (pointerX - pad.left) / plotWidth));
    const index = Math.round(ratio * Math.max(0, rows.length - 1));
    const row = rows[index];
    const value = number(row[state.trendMetric]);
    const pointX = x(index);
    const pointY = y(value);
    verticalLine.setAttribute("x1", pointX);
    verticalLine.setAttribute("x2", pointX);
    horizontalLine.setAttribute("y1", pointY);
    horizontalLine.setAttribute("y2", pointY);
    activePoint.setAttribute("cx", pointX);
    activePoint.setAttribute("cy", pointY);
    crosshair.classList.add("visible");

    if (activeIndex !== index) {
      const fullDate = dateFormat.format(new Date(row.dt));
      showTooltip(
        event,
        `<div class="tooltip-title">${metric.label}: ${metric.format(value)}</div><div class="tooltip-subtitle">${fullDate} · nearest daily point</div>`,
      );
      activeIndex = index;
    } else {
      positionTooltip(event);
    }
  };
  hitArea.addEventListener("pointermove", activateCrosshair);
  hitArea.addEventListener("pointerdown", activateCrosshair);
  hitArea.addEventListener("pointerleave", () => {
    activeIndex = -1;
    crosshair.classList.remove("visible");
    hideTooltip();
  });
  svg.append(hitArea);

  els.trendChart.append(svg);
}

function updateAccordionHeight() {
  if (els.accordionHeader && els.accordionHeader.classList.contains("active")) {
    els.accordionContent.style.maxHeight = els.accordionContent.scrollHeight + "px";
  }
}

function shortValue(value, start = 8, end = 6) {
  const text = String(value || "");
  if (!text) return "—";
  if (text.length <= start + end + 3) return text;
  return `${text.slice(0, start)}…${text.slice(-end)}`;
}

function normalizedStatus(value) {
  return String(value || "Unknown").replace(/^TRADE_STATUS_/, "").replaceAll("_", " ");
}

function marketUrl(metadata) {
  if (metadata?.eventSlug) return `https://polymarket.com/event/${encodeURIComponent(metadata.eventSlug)}`;
  if (metadata?.slug) return `https://polymarket.com/market/${encodeURIComponent(metadata.slug)}`;
  return "";
}

function renderTradeStats() {
  const trades = state.trades;
  const sum = (field) => trades.reduce((total, trade) => total + number(trade[field]), 0);
  const owners = new Set(trades.map((trade) => trade.owner).filter(Boolean));
  const makers = trades.filter((trade) => String(trade.tradeType).toUpperCase() === "MAKER").length;
  const takers = trades.filter((trade) => String(trade.tradeType).toUpperCase() === "TAKER").length;
  const settled = trades.filter((trade) => ["CONFIRMED", "MINED"].includes(normalizedStatus(trade.status))).length;

  els.detailTradeCount.textContent = fmtInt.format(trades.length);
  els.detailTradeValue.textContent = fmtCompactUsd.format(sum("sizeUsdc"));
  els.detailFees.textContent = fmtPreciseUsd.format(sum("feeUsdc"));
  els.detailBuilderFees.textContent = fmtPreciseUsd.format(sum("builderFee"));
  els.detailOwners.textContent = fmtInt.format(owners.size);
  els.detailTradeMix.textContent = trades.length ? `${fmtInt.format(makers)} / ${fmtInt.format(takers)}` : "—";
  els.detailStatus.textContent = trades.length ? `${Math.round((settled / trades.length) * 100)}%` : "—";
}

function appendDetailValue(container, label, value, href = "") {
  const item = document.createElement("div");
  item.className = "trade-detail-item";
  const key = document.createElement("span");
  key.textContent = label;
  const content = href ? document.createElement("a") : document.createElement("code");
  content.textContent = value === null || value === undefined || value === "" ? "—" : String(value);
  if (href) {
    content.href = href;
    content.target = "_blank";
    content.rel = "noreferrer";
  }
  item.append(key, content);
  container.append(item);
}

function toggleTradeDetails(row, trade) {
  const existing = row.nextElementSibling;
  if (existing?.classList.contains("trade-detail-row")) {
    existing.remove();
    row.setAttribute("aria-expanded", "false");
    return;
  }

  const detailRow = document.createElement("tr");
  detailRow.className = "trade-detail-row";
  const cell = document.createElement("td");
  cell.colSpan = 12;
  const grid = document.createElement("div");
  grid.className = "trade-detail-grid";
  const metadata = state.marketMetadata.get(trade.market);
  const fields = [
    ["Trade ID", trade.id],
    ["Trade type", trade.tradeType],
    ["Taker order hash", trade.takerOrderHash],
    ["Builder field", trade.builder],
    ["Builder code", trade.builderCode],
    ["Market condition ID", trade.market],
    ["Asset token ID", trade.assetId],
    ["Side", trade.side],
    ["Shares", trade.size],
    ["Value (USDC)", trade.sizeUsdc],
    ["Price", trade.price],
    ["Status", trade.status],
    ["Outcome", trade.outcome],
    ["Outcome index", trade.outcomeIndex],
    ["Owner ID", trade.owner],
    ["Maker address", trade.maker],
    ["Match time", parseTradeTime(trade.matchTime)?.toISOString() || trade.matchTime],
    ["Bucket index", trade.bucketIndex],
    ["Fee", trade.fee],
    ["Fee (USDC)", trade.feeUsdc],
    ["Builder fee", trade.builderFee],
    ["Created at", trade.createdAt],
    ["Updated at", trade.updatedAt],
  ];
  for (const [label, value] of fields) appendDetailValue(grid, label, value);
  if (metadata?.question) appendDetailValue(grid, "Market title", metadata.question, marketUrl(metadata));
  if (trade.transactionHash) {
    appendDetailValue(
      grid,
      "Transaction hash",
      trade.transactionHash,
      `https://polygonscan.com/tx/${encodeURIComponent(trade.transactionHash)}`,
    );
  }
  cell.append(grid);
  detailRow.append(cell);
  row.after(detailRow);
  row.setAttribute("aria-expanded", "true");
}

function renderTrades() {
  els.rawTrades.textContent = JSON.stringify({
    limit: state.tradeMeta.limit,
    count: state.tradeMeta.count,
    next_cursor: state.nextCursor,
    loaded_count: state.trades.length,
    data: state.trades,
  }, null, 2);
  const hasMore = state.nextCursor && state.nextCursor !== "LTE=";
  const pageMeta = state.tradeMeta.limit
    ? ` · last page ${fmtInt.format(state.tradeMeta.count)}/${fmtInt.format(state.tradeMeta.limit)}`
    : "";
  els.cursorState.textContent = state.loading
    ? `${fmtInt.format(state.trades.length)} loaded · loading…`
    : `${fmtInt.format(state.trades.length)} loaded${pageMeta} · ${hasMore ? "more available" : "end reached"}`;
  els.loadNextTrades.disabled = !hasMore || state.loading;
  renderTradeStats();

  els.tradeRows.innerHTML = "";
  if (state.trades.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 12;
    cell.className = "muted empty-table-cell";
    cell.textContent = "No trades attributed for this builder, window, and filter set.";
    row.append(cell);
    els.tradeRows.append(row);
  } else {
    for (const trade of state.trades) {
      const row = els.tradeRowTemplate.content.firstElementChild.cloneNode(true);
      const tradeTime = parseTradeTime(trade.matchTime) || parseTradeTime(trade.createdAt);
      row.querySelector(".trade-time").textContent = tradeTime ? tradeTime.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }) : "—";

      const type = String(trade.tradeType || "Unknown").toUpperCase();
      const typeEl = row.querySelector(".trade-type");
      typeEl.textContent = type;
      typeEl.classList.add(type === "MAKER" ? "maker" : "taker");

      const sideEl = row.querySelector(".trade-side");
      const side = String(trade.side || "Unknown").toUpperCase();
      sideEl.textContent = side;
      sideEl.classList.add(side === "BUY" ? "buy" : "sell");

      row.querySelector(".trade-size").textContent = fmtPreciseUsd.format(number(trade.sizeUsdc));
      row.querySelector(".trade-shares").textContent = fmtDecimal.format(number(trade.size));
      row.querySelector(".trade-price").textContent = number(trade.price).toFixed(4);
      row.querySelector(".trade-outcome").textContent = trade.outcome || "—";

      const status = normalizedStatus(trade.status);
      const statusEl = row.querySelector(".trade-status");
      statusEl.textContent = status;
      statusEl.className = `trade-status ${status.toLowerCase().replaceAll(" ", "-")}`;
      row.querySelector(".trade-fee").textContent = fmtPreciseUsd.format(number(trade.feeUsdc));
      row.querySelector(".trade-maker").textContent = shortValue(trade.maker);
      row.querySelector(".trade-maker").title = trade.maker || "";

      const metadata = state.marketMetadata.get(trade.market);
      const marketEl = row.querySelector(".trade-market");
      const marketLink = marketUrl(metadata);
      const marketContent = marketLink ? document.createElement("a") : document.createElement("span");
      marketContent.textContent = metadata?.question || shortValue(trade.market, 10, 8);
      marketContent.title = metadata?.question || trade.market || "";
      if (marketLink) {
        marketContent.href = marketLink;
        marketContent.target = "_blank";
        marketContent.rel = "noreferrer";
      }
      marketEl.append(marketContent);

      const txEl = row.querySelector(".trade-tx");
      if (trade.transactionHash) {
        const txLink = document.createElement("a");
        txLink.href = `https://polygonscan.com/tx/${encodeURIComponent(trade.transactionHash)}`;
        txLink.target = "_blank";
        txLink.rel = "noreferrer";
        txLink.textContent = "View";
        txLink.title = trade.transactionHash;
        txEl.append(txLink);
      } else {
        txEl.textContent = "—";
      }

      row.title = "Click to inspect every API field";
      row.addEventListener("click", (event) => {
        if (event.target.closest("a, button")) return;
        toggleTradeDetails(row, trade);
      });
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggleTradeDetails(row, trade);
        }
      });
      els.tradeRows.append(row);
    }
  }

  updateAccordionHeight();
}

function renderDetail() {
  if (!state.selected) {
    els.emptyDetail.classList.remove("hidden");
    els.detailContent.classList.add("hidden");
    document.body.classList.remove("detail-selected");
    renderGlobalVolumeChart();
    return;
  }

  const builder = state.selected;
  els.emptyDetail.classList.add("hidden");
  els.detailContent.classList.remove("hidden");
  document.body.classList.add("detail-selected");
  setAvatar(els.detailAvatar, builder);
  els.detailName.textContent = builder.builder || "Unnamed builder";
  const officialLink = primaryOfficialLink(builder.metadata);
  if (officialLink) {
    const label = websiteLabel(officialLink.url);
    els.detailWebsite.href = officialLink.url;
    els.detailWebsite.title = `Open ${builder.builder || label} official ${officialLink.type}`;
    els.detailWebsite.setAttribute(
      "aria-label",
      `Open ${builder.builder || label} official ${officialLink.type} (opens in a new tab)`,
    );
    els.detailWebsite.querySelector(".detail-website-label").textContent = label;
    els.detailWebsite.classList.remove("hidden");
  } else {
    els.detailWebsite.removeAttribute("href");
    els.detailWebsite.removeAttribute("title");
    els.detailWebsite.removeAttribute("aria-label");
    els.detailWebsite.classList.add("hidden");
  }
  els.detailCode.textContent = builder.builderCode || "Legacy / empty builder code";
  els.detailVolume.textContent = fmtCompactUsd.format(number(builder.volume));
  els.detailUsers.textContent = fmtInt.format(number(builder.activeUsers));
  els.detailRangeLabel.textContent = detailRanges[state.detailRange].label;
  renderTrendChart();
  renderTrades();
}

function periodLabel(period) {
  return {
    DAY: "Day",
    WEEK: "Week",
    MONTH: "Month",
    ALL: "All",
  }[period] || period;
}

function maxLoadedRank() {
  return Math.max(1, ...state.builders.map((builder) => number(builder.rank)));
}

let trackerUpdateFrame = 0;

function scheduleViraeTrackerUpdate() {
  if (trackerUpdateFrame) return;
  trackerUpdateFrame = requestAnimationFrame(() => {
    trackerUpdateFrame = 0;
    updateViraeTrackerViewport();
  });
}

function updateViraeTrackerViewport() {
  if (els.viraeTracker.classList.contains("hidden")) return;

  const shellRect = els.leaderboardShell.getBoundingClientRect();
  const pageInset = window.innerWidth <= 900 ? 12 : Math.max(12, shellRect.left);
  const trackerWidth = window.innerWidth <= 900
    ? window.innerWidth - 24
    : Math.min(shellRect.width, window.innerWidth - pageInset - 12);
  els.viraeTracker.style.left = `${pageInset}px`;
  els.viraeTracker.style.width = `${Math.max(280, trackerWidth)}px`;

  const tracked = trackedBuilder();
  if (!tracked) return;

  const loadedMax = maxLoadedRank();
  const trackedRank = number(tracked.rank);
  const rankPct = loadedMax <= 1 ? 0 : ((trackedRank - 1) / (loadedMax - 1)) * 100;
  els.viraeRankMarker.style.left = `${Math.min(100, Math.max(0, rankPct))}%`;

  const trackerRect = els.viraeTracker.getBoundingClientRect();
  const topBoundary = Math.max(0, els.topbar.getBoundingClientRect().bottom);
  const bottomBoundary = Math.min(window.innerHeight, trackerRect.top - 8);
  const visibleRows = [...els.builderRows.querySelectorAll("tr[data-rank]")].filter((row) => {
    const rect = row.getBoundingClientRect();
    return rect.bottom > topBoundary && rect.top < bottomBoundary;
  });
  const visibleRanks = visibleRows.map((row) => number(row.dataset.rank)).filter(Boolean);
  if (!visibleRanks.length) {
    els.viraeTrackerStatus.textContent = `Loaded through rank #${fmtInt.format(loadedMax)}`;
    els.viraeVisibleRange.style.width = "0%";
    return;
  }

  const visibleMin = Math.min(...visibleRanks);
  const visibleMax = Math.max(...visibleRanks);
  const rangeStart = loadedMax <= 1 ? 0 : ((visibleMin - 1) / (loadedMax - 1)) * 100;
  const rangeEnd = loadedMax <= 1 ? 100 : ((visibleMax - 1) / (loadedMax - 1)) * 100;
  els.viraeVisibleRange.style.left = `${Math.min(100, Math.max(0, rangeStart))}%`;
  els.viraeVisibleRange.style.width = `${Math.max(2, Math.min(100, rangeEnd) - Math.max(0, rangeStart))}%`;

  const trackedRow = els.builderRows.querySelector(`tr[data-code="${CSS.escape(tracked.builderCode)}"]`);
  const trackedRect = trackedRow?.getBoundingClientRect();
  const trackedInView = trackedRect && trackedRect.bottom > topBoundary && trackedRect.top < bottomBoundary;
  const visibleLabel = `visible #${fmtInt.format(visibleMin)}–#${fmtInt.format(visibleMax)}`;
  if (trackedInView) {
    els.viraeTrackerStatus.textContent = `In view · ${visibleLabel}`;
  } else if (trackedRect?.top >= bottomBoundary) {
    const distance = Math.max(0, trackedRank - visibleMax);
    els.viraeTrackerStatus.textContent = distance
      ? `↓ ${fmtInt.format(distance)} ranks below ${visibleLabel}`
      : `↓ Virae.ai row is below ${visibleLabel}`;
  } else if (trackedRect?.bottom <= topBoundary) {
    const distance = Math.max(0, visibleMin - trackedRank);
    els.viraeTrackerStatus.textContent = distance
      ? `↑ ${fmtInt.format(distance)} ranks above ${visibleLabel}`
      : `↑ Virae.ai row is above ${visibleLabel}`;
  } else {
    els.viraeTrackerStatus.textContent = `Rank #${fmtInt.format(trackedRank)} · ${visibleLabel}`;
  }
}

function renderViraeTracker() {
  const tracked = trackedBuilder();
  document.body.classList.add("virae-tracker-active");
  els.viraeTracker.classList.remove("hidden");
  els.viraeTrackerPeriod.textContent = periodLabel(state.period);

  if (tracked) {
    setAvatar(els.viraeTrackerAvatar, tracked);
    els.viraeTrackerRank.textContent = `#${fmtInt.format(number(tracked.rank))}`;
    els.viraeTrackerVolume.textContent = fmtCompactUsd.format(number(tracked.volume));
    els.viraeTrackerUsers.textContent = fmtInt.format(number(tracked.activeUsers));
    els.viraeTrackerButton.disabled = false;
    els.viraeTrackerButton.setAttribute(
      "aria-label",
      `Virae.ai is rank ${tracked.rank} for ${periodLabel(state.period)}. Jump to its leaderboard row.`,
    );
    els.viraeRankMarker.classList.remove("searching");
  } else {
    els.viraeTrackerAvatar.innerHTML = "";
    els.viraeTrackerAvatar.textContent = "V";
    els.viraeTrackerRank.textContent = state.trackedBuilderStatus === "not-found" ? "N/R" : "…";
    els.viraeTrackerVolume.textContent = "—";
    els.viraeTrackerUsers.textContent = "—";
    els.viraeTrackerButton.disabled = true;
    els.viraeTrackerStatus.textContent = state.trackedBuilderStatus === "not-found"
      ? `Not ranked in ${periodLabel(state.period)}`
      : `Scanning through rank #${fmtInt.format(maxLoadedRank())}…`;
    els.viraeTrackerButton.setAttribute("aria-label", els.viraeTrackerStatus.textContent);
    els.viraeVisibleRange.style.width = "0%";
    els.viraeRankMarker.classList.add("searching");
  }

  scheduleViraeTrackerUpdate();
}

function render() {
  renderBuilders();
  renderDetail();
  renderViraeTracker();
  renderMobileNavigation();
}

function updateBuilderLoadStatus() {
  if (state.isLoadingBuilders) {
    els.loadMoreBuilders.textContent = "Loading more projects...";
  } else if (state.hasMoreBuilders) {
    els.loadMoreBuilders.textContent = "Scroll to load more projects";
  } else {
    els.loadMoreBuilders.textContent = "All projects loaded";
  }
}

async function loadBuilders({ reset = false } = {}) {
  if (state.isLoadingBuilders) return;
  if (!reset && !state.hasMoreBuilders) return;

  if (reset) {
    state.builders = [];
    state.nextOffset = 0;
    state.selected = null;
    state.trades = [];
    state.nextCursor = null;
    state.tradeMeta = { limit: 0, count: 0 };
    state.detailVolumes = [];
    state.hasMoreBuilders = true;
    state.trackedBuilderStatus = "loading";
  }

  state.isLoadingBuilders = true;
  els.refreshButton.disabled = true;
  updateBuilderLoadStatus();
  render();

  const requestedPeriod = state.period;
  try {
    const page = await api(
      `/api/builders/leaderboard?timePeriod=${requestedPeriod}&limit=50&offset=${state.nextOffset}`,
    );
    if (requestedPeriod !== state.period) return;
    state.builders = [...state.builders, ...page.map(withBuilderMetadata)];
    state.nextOffset += page.length;
    state.hasMoreBuilders = page.length === 50;
  } finally {
    state.isLoadingBuilders = false;
    els.refreshButton.disabled = false;
    updateBuilderLoadStatus();
  }
  render();
  loadDailyVolumes().then(() => {
    if (requestedPeriod === state.period) renderDetail();
  });
}

async function waitForBuilderLoadingToFinish() {
  while (state.isLoadingBuilders) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function ensureTrackedBuilderLoaded() {
  if (state.trackedBuilderPromise) await state.trackedBuilderPromise;
  if (trackedBuilder()) {
    state.trackedBuilderStatus = "found";
    renderViraeTracker();
    return trackedBuilder();
  }

  const requestedPeriod = state.period;
  state.trackedBuilderStatus = "loading";
  renderViraeTracker();
  const promise = (async () => {
    while (
      requestedPeriod === state.period &&
      !trackedBuilder() &&
      state.hasMoreBuilders
    ) {
      await waitForBuilderLoadingToFinish();
      if (requestedPeriod !== state.period) return null;
      const previousOffset = state.nextOffset;
      await loadBuilders({ reset: false });
      if (state.nextOffset === previousOffset) break;
    }

    if (requestedPeriod !== state.period) return null;
    state.trackedBuilderStatus = trackedBuilder() ? "found" : "not-found";
    render();
    return trackedBuilder();
  })();
  state.trackedBuilderPromise = promise;
  try {
    return await promise;
  } finally {
    if (state.trackedBuilderPromise === promise) state.trackedBuilderPromise = null;
  }
}

async function loadDailyVolumes({ force = false } = {}) {
  if (state.volumes.length && !force) return state.volumes;
  if (state.volumeLoading) return state.volumeLoading;
  state.volumeLoading = api("/api/builders/volume?timePeriod=DAY")
    .then((volumes) => {
      state.volumes = Array.isArray(volumes) ? volumes : [];
      return state.volumes;
    })
    .catch((error) => {
      console.warn(error);
      state.volumes = [];
      return state.volumes;
    })
    .finally(() => {
      state.volumeLoading = null;
    });
  return state.volumeLoading;
}

async function loadDetailVolumes() {
  state.detailVolumes = await loadDailyVolumes();
}

function unixFromDetailRange() {
  const days = detailRanges[state.detailRange].days;
  if (!days) return "";
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days + 1);
  return String(Math.floor(date.getTime() / 1000));
}

async function loadMarketMetadata(trades) {
  const missing = [...new Set(
    trades
      .map((trade) => trade.market)
      .filter((conditionId) => conditionId && !state.marketMetadata.has(conditionId)),
  )];
  if (!missing.length) return;

  const chunks = [];
  for (let index = 0; index < missing.length; index += 40) chunks.push(missing.slice(index, index + 40));
  await Promise.all(chunks.map(async (conditionIds) => {
    const params = new URLSearchParams();
    for (const conditionId of conditionIds) params.append("condition_ids", conditionId);
    try {
      const markets = await api(`/api/markets?${params}`);
      const found = new Set();
      for (const market of Array.isArray(markets) ? markets : []) {
        if (!market.conditionId) continue;
        found.add(market.conditionId);
        state.marketMetadata.set(market.conditionId, {
          question: market.question || "",
          slug: market.slug || "",
          eventSlug: market.events?.[0]?.slug || "",
          icon: market.icon || market.image || "",
        });
      }
      for (const conditionId of conditionIds) {
        if (!found.has(conditionId)) state.marketMetadata.set(conditionId, null);
      }
    } catch (error) {
      console.warn("Market metadata lookup failed", error);
    }
  }));
}

async function loadTrades({ append = false } = {}) {
  if (!state.selected?.builderCode) return;
  const selectedCode = state.selected.builderCode;
  state.loading = true;
  els.loadNextTrades.disabled = true;
  els.tradeError.classList.add("hidden");
  els.tradeError.textContent = "";
  try {
    const params = new URLSearchParams({ builder_code: selectedCode });
    const after = unixFromDetailRange();
    if (after) params.set("after", after);
    if (append && state.nextCursor) params.set("next_cursor", state.nextCursor);
    for (const [key, value] of Object.entries(state.tradeFilters)) {
      if (value) params.set(key, value);
    }
    const payload = await api(`/api/builder/trades?${params}`);
    if (state.selected?.builderCode !== selectedCode) return;
    const nextRows = payload.data || [];
    state.trades = append ? [...state.trades, ...nextRows] : nextRows;
    state.nextCursor = payload.next_cursor || null;
    state.tradeMeta = {
      limit: number(payload.limit),
      count: number(payload.count),
    };
    renderTrades();
    await loadMarketMetadata(nextRows);
  } catch (error) {
    if (state.selected?.builderCode === selectedCode) {
      els.tradeError.textContent = error instanceof Error ? error.message : "Unable to load builder trades.";
      els.tradeError.classList.remove("hidden");
    }
  } finally {
    state.loading = false;
  }
  if (state.selected?.builderCode === selectedCode) renderTrades();
}

async function selectBuilder(builder) {
  state.selected = builder;
  state.trades = [];
  state.nextCursor = null;
  state.tradeMeta = { limit: 0, count: 0 };
  render();
  await loadDetailVolumes();
  await loadTrades({ append: false });
  render();
}

async function handleSearchInput() {
  const match = firstSearchMatch();
  if (!match) {
    renderBuilders();
    return;
  }

  if (state.selected?.builderCode === match.builderCode) {
    renderBuilders();
    scrollBuilderRowIntoView(match.builderCode);
    return;
  }

  await selectBuilder(match);
  scrollBuilderRowIntoView(match.builderCode);
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
    "takerOrderHash",
    "builder",
    "builderCode",
    "market",
    "assetId",
    "side",
    "size",
    "sizeUsdc",
    "price",
    "status",
    "outcome",
    "outcomeIndex",
    "owner",
    "maker",
    "transactionHash",
    "matchTime",
    "bucketIndex",
    "fee",
    "feeUsdc",
    "builderFee",
    "createdAt",
    "updatedAt",
    "marketTitle",
    "marketUrl",
  ];
  const rows = state.trades.map((trade) => {
    const metadata = state.marketMetadata.get(trade.market);
    return columns.map((column) => {
      if (column === "marketTitle") return csvValue(metadata?.question || "");
      if (column === "marketUrl") return csvValue(marketUrl(metadata));
      return csvValue(trade[column]);
    }).join(",");
  });
  download(`${state.selected?.builder || "builder"}-trades.csv`, [columns.join(","), ...rows].join("\n"), "text/csv");
}

// Tab sliding indicator
function updateSegmentedIndicator() {
  const container = document.querySelector(".segmented");
  if (!container) return;
  const activeBtn = container.querySelector("button.active");
  let indicator = container.querySelector(".segmented-indicator");
  if (!indicator) {
    indicator = document.createElement("div");
    indicator.className = "segmented-indicator";
    container.appendChild(indicator);
  }
  if (activeBtn) {
    indicator.style.left = `${activeBtn.offsetLeft}px`;
    indicator.style.width = `${activeBtn.offsetWidth}px`;
    indicator.style.height = `${activeBtn.offsetHeight}px`;
    indicator.style.top = `${activeBtn.offsetTop}px`;
  }
}

function isMobileLayout() {
  return window.matchMedia("(max-width: 900px)").matches;
}

function renderMobileNavigation() {
  const mobile = isMobileLayout();
  const activeView = state.mobileView;
  document.body.dataset.mobileView = activeView;

  for (const tab of els.mobileViewTabs) {
    const active = tab.dataset.mobileView === activeView;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  }

  const panels = [
    [els.leaderboardPanel, "leaderboardTab", "leaderboard"],
    [els.marketVolumePanel, "marketVolumeTab", "market"],
  ];
  for (const [panel, labelledBy, view] of panels) {
    if (mobile) {
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", labelledBy);
      panel.setAttribute("aria-hidden", String(view !== activeView && !document.body.classList.contains("detail-selected")));
    } else {
      panel.removeAttribute("role");
      panel.removeAttribute("aria-labelledby");
      panel.removeAttribute("aria-hidden");
    }
  }

  if (mobile && activeView === "market" && !state.selected) {
    renderGlobalVolumeChart();
  }
  scheduleViraeTrackerUpdate();
}

function setMobileView(view, { restoreScroll = true } = {}) {
  if (!["leaderboard", "market"].includes(view)) return;

  if (view === state.mobileView) {
    renderMobileNavigation();
    if (isMobileLayout() && !restoreScroll) {
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
    }
    return;
  }

  state.mobileScrollPositions[state.mobileView] = window.scrollY;
  state.mobileView = view;
  renderMobileNavigation();

  if (!isMobileLayout()) return;
  const nextScrollPosition = restoreScroll ? state.mobileScrollPositions[view] : 0;
  requestAnimationFrame(() => {
    window.scrollTo({ top: nextScrollPosition, behavior: "auto" });
  });
}

// Event Listeners Wire-up
for (const tab of els.mobileViewTabs) {
  tab.addEventListener("click", () => setMobileView(tab.dataset.mobileView));
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextView = event.key === "ArrowLeft" || event.key === "Home" ? "leaderboard" : "market";
    setMobileView(nextView);
    els.mobileViewTabs.find((item) => item.dataset.mobileView === nextView)?.focus();
  });
}

document.querySelectorAll("[data-period]").forEach((button) => {
  button.addEventListener("click", async () => {
    document.querySelectorAll("[data-period]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    updateSegmentedIndicator();
    state.period = button.dataset.period;
    await waitForBuilderLoadingToFinish();
    await loadBuilders({ reset: true });
    await ensureTrackedBuilderLoaded();
  });
});

els.searchInput.addEventListener("input", handleSearchInput);
els.verifiedOnly.addEventListener("change", renderBuilders);
els.refreshButton.addEventListener("click", async () => {
  state.volumes = [];
  const volumesPromise = loadDailyVolumes({ force: true });
  await waitForBuilderLoadingToFinish();
  await Promise.all([loadBuilders({ reset: true }), volumesPromise]);
  await ensureTrackedBuilderLoaded();
  state.detailVolumes = state.volumes;
  render();
});
els.loadNextTrades.addEventListener("click", () => loadTrades({ append: true }));
els.downloadJson.addEventListener("click", () => {
  const markets = Object.fromEntries(
    [...new Set(state.trades.map((trade) => trade.market).filter(Boolean))]
      .map((conditionId) => [conditionId, state.marketMetadata.get(conditionId) || null]),
  );
  download(`${state.selected?.builder || "builder"}-trades.json`, JSON.stringify({
    builder: state.selected,
    filters: state.tradeFilters,
    limit: state.tradeMeta.limit,
    count: state.tradeMeta.count,
    next_cursor: state.nextCursor,
    markets,
    data: state.trades,
  }, null, 2), "application/json");
});
els.downloadCsv.addEventListener("click", downloadCsv);

function tradeFiltersFromInputs() {
  return {
    id: els.tradeIdFilter.value.trim(),
    market: els.marketFilter.value.trim(),
    asset_id: els.assetFilter.value.trim(),
  };
}

function validateTradeFilters(filters) {
  if (filters.market && !/^0x[a-fA-F0-9]{64}$/.test(filters.market)) {
    return "Market condition ID must be a 32-byte 0x-prefixed hex value.";
  }
  if (filters.asset_id && !/^\d+$/.test(filters.asset_id)) {
    return "Asset token ID must contain digits only.";
  }
  return "";
}

els.applyTradeFilters.addEventListener("click", async () => {
  const filters = tradeFiltersFromInputs();
  const error = validateTradeFilters(filters);
  if (error) {
    els.tradeError.textContent = error;
    els.tradeError.classList.remove("hidden");
    return;
  }
  state.tradeFilters = filters;
  state.trades = [];
  state.nextCursor = null;
  state.tradeMeta = { limit: 0, count: 0 };
  renderTrades();
  await loadTrades();
});

els.clearTradeFilters.addEventListener("click", async () => {
  els.tradeIdFilter.value = "";
  els.marketFilter.value = "";
  els.assetFilter.value = "";
  state.tradeFilters = { id: "", market: "", asset_id: "" };
  state.trades = [];
  state.nextCursor = null;
  state.tradeMeta = { limit: 0, count: 0 };
  renderTrades();
  await loadTrades();
});

document.querySelectorAll("[data-detail-range]").forEach((button) => {
  button.addEventListener("click", async () => {
    if (button.dataset.detailRange === state.detailRange) return;
    document.querySelectorAll("[data-detail-range]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.detailRange = button.dataset.detailRange;
    state.trades = [];
    state.nextCursor = null;
    state.tradeMeta = { limit: 0, count: 0 };
    renderDetail();
    if (!state.selected) return;
    await loadDetailVolumes();
    await loadTrades({ append: false });
    renderDetail();
  });
});

document.querySelectorAll("[data-trend-metric]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-trend-metric]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.trendMetric = button.dataset.trendMetric;
    renderTrendChart();
  });
});

// Table sorting header click events
document.querySelectorAll("th.sortable").forEach((th) => {
  th.tabIndex = 0;
  th.setAttribute("role", "button");
  const sort = () => {
    const col = th.dataset.sort;
    if (state.sortColumn === col) {
      state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
    } else {
      state.sortColumn = col;
      state.sortDirection = (col === "volume" || col === "users") ? "desc" : "asc";
    }
    renderBuilders();
  };
  th.addEventListener("click", sort);
  th.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      sort();
    }
  });
});

// Copy Builder Code Button
if (els.copyCodeButton) {
  els.copyCodeButton.addEventListener("click", async () => {
    if (!state.selected || !state.selected.builderCode) return;
    try {
      await navigator.clipboard.writeText(state.selected.builderCode);
      
      const originalSvg = els.copyCodeButton.innerHTML;
      els.copyCodeButton.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--green);"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
      els.copyCodeButton.title = "Copied!";
      
      setTimeout(() => {
        els.copyCodeButton.innerHTML = originalSvg;
        els.copyCodeButton.title = "Copy Builder Code";
      }, 2000);
    } catch (err) {
      console.error("Failed to copy code: ", err);
    }
  });
}

// Collapsible raw JSON data
if (els.accordionHeader) {
  els.accordionHeader.addEventListener("click", () => {
    els.accordionHeader.classList.toggle("active");
    els.accordionHeader.setAttribute(
      "aria-expanded",
      String(els.accordionHeader.classList.contains("active")),
    );
    const content = els.accordionContent;
    if (content.style.maxHeight && content.style.maxHeight !== "0px") {
      content.style.maxHeight = "0px";
    } else {
      content.style.maxHeight = content.scrollHeight + "px";
    }
  });
}

// Back to Leaderboard button on mobile
if (els.backToListButton) {
  els.backToListButton.addEventListener("click", () => {
    state.selected = null;
    state.trades = [];
    state.nextCursor = null;
    render();
    setMobileView("leaderboard", { restoreScroll: false });
  });
}

els.viraeTrackerButton.addEventListener("click", () => {
  const tracked = trackedBuilder();
  if (!tracked) return;

  if (isMobileLayout() && state.selected) {
    state.selected = null;
    state.trades = [];
    state.nextCursor = null;
    state.tradeMeta = { limit: 0, count: 0 };
    state.mobileView = "leaderboard";
    render();
  }

  const row = els.builderRows.querySelector(`tr[data-code="${CSS.escape(tracked.builderCode)}"]`);
  if (!row) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  state.trackedJumpUntil = Date.now() + 1400;
  row.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
  row.classList.remove("tracked-jump");
  requestAnimationFrame(() => row.classList.add("tracked-jump"));
  setTimeout(() => {
    state.trackedJumpUntil = 0;
    els.builderRows.querySelector("tr.tracked-builder-row")?.classList.remove("tracked-jump");
  }, 1400);
});

// Initial Loading & Visual Setup
applyCuratedNavigation();
updateSegmentedIndicator();
renderMobileNavigation();
window.addEventListener("resize", () => {
  updateSegmentedIndicator();
  renderMobileNavigation();
  scheduleViraeTrackerUpdate();
});
window.addEventListener("scroll", scheduleViraeTrackerUpdate, { passive: true });

const builderLoadObserver = new IntersectionObserver((entries) => {
  if (entries.some((entry) => entry.isIntersecting)) {
    loadBuilders({ reset: false });
  }
}, {
  root: null, // Use the browser viewport since we removed local scrollbars
  rootMargin: "240px 0px",
});
builderLoadObserver.observe(els.loadMoreBuilders);
updateBuilderLoadStatus();

loadBuilders({ reset: true }).then(async () => {
  await ensureTrackedBuilderLoaded();
  // Recalculate indicators after layout settles
  setTimeout(updateSegmentedIndicator, 100);
}).catch((error) => {
  els.builderRows.innerHTML = "";
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = 5;
  cell.setAttribute("role", "alert");
  cell.textContent = `Failed to load data: ${error instanceof Error ? error.message : "Unknown error"}`;
  row.append(cell);
  els.builderRows.append(row);
  console.error(error);
});
