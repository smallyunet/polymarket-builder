const state = {
  period: "MONTH",
  detailRange: "30d",
  builders: [],
  volumes: [],
  detailVolumes: [],
  nextOffset: 0,
  selected: null,
  trades: [],
  nextCursor: null,
  loading: false,
  isLoadingBuilders: false,
  hasMoreBuilders: true,
  sortColumn: null,
  sortDirection: "asc",
};

const els = {
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
  detailCode: document.querySelector("#detailCode"),
  detailVolume: document.querySelector("#detailVolume"),
  detailUsers: document.querySelector("#detailUsers"),
  detailRangeLabel: document.querySelector("#detailRangeLabel"),
  rawTrades: document.querySelector("#rawTrades"),
  cursorState: document.querySelector("#cursorState"),
  volumeBars: document.querySelector("#volumeBars"),
  loadNextTrades: document.querySelector("#loadNextTrades"),
  downloadJson: document.querySelector("#downloadJson"),
  downloadCsv: document.querySelector("#downloadCsv"),
  
  // Newly added elements
  globalVolumeChart: document.querySelector("#globalVolumeChart"),
  globalChartLegend: document.querySelector("#globalChartLegend"),
  globalYAxis: document.querySelector("#globalYAxis"),
  singleYAxis: document.querySelector("#singleYAxis"),
  copyCodeButton: document.querySelector("#copyCodeButton"),
  tradeRows: document.querySelector("#tradeRows"),
  tradeRowTemplate: document.querySelector("#tradeRowTemplate"),
  accordionHeader: document.querySelector("#accordionHeader"),
  accordionContent: document.querySelector("#accordionContent"),
  backToListButton: document.querySelector("#backToListButton"),
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

const detailRanges = {
  "7d": { label: "Last 7 days", days: 7, volumePeriod: "WEEK" },
  "30d": { label: "Last 30 days", days: 30, volumePeriod: "MONTH" },
  all: { label: "All time", days: null, volumePeriod: "ALL" },
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

function builderMatchesSearch(builder, query = searchQuery()) {
  if (!query) return false;
  return (
    builder.builder?.toLowerCase().includes(query) ||
    builder.builderCode?.toLowerCase().includes(query)
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
    if (th.dataset.sort === state.sortColumn) {
      th.classList.add(state.sortDirection);
    }
  });

  const rows = visibleAndSortedBuilders();
  const query = searchQuery();

  for (const builder of rows) {
    const row = els.rowTemplate.content.firstElementChild.cloneNode(true);
    row.dataset.code = builder.builderCode;
    if (state.selected?.builderCode === builder.builderCode) row.classList.add("active");
    if (builderMatchesSearch(builder, query)) row.classList.add("search-match");
    row.querySelector(".rank-cell").textContent = `#${builder.rank}`;
    row.querySelector(".builder-name").textContent = builder.builder || "Unnamed builder";
    
    // Status with premium badge
    const statusEl = row.querySelector(".builder-status");
    if (builder.verified) {
      statusEl.innerHTML = `<span style="color:var(--blue-hover); display:inline-flex; align-items:center; gap:4px; font-weight:600;"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg> Verified</span>`;
    } else {
      statusEl.textContent = "Unverified";
      statusEl.style.color = "var(--ink-subtle)";
    }
    
    row.querySelector(".volume-cell").textContent = fmtCompactUsd.format(number(builder.volume));
    row.querySelector(".users-cell").textContent = fmtInt.format(number(builder.activeUsers));
    row.querySelector(".code-cell").textContent = shortCode(builder.builderCode);
    setAvatar(row.querySelector(".avatar"), builder);
    row.addEventListener("click", () => selectBuilder(builder));
    els.builderRows.append(row);
  }

  if (!rows.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
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

  // Map builder code to name
  const codeToName = {};
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
          <div style="font-weight: 600; margin-bottom: 2px;">${builderName}</div>
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

function renderVolumeBars() {
  els.volumeBars.innerHTML = "";
  els.singleYAxis.innerHTML = "";
  
  if (!state.selected) return;

  const rows = state.detailVolumes
    .filter((row) => row.builderCode === state.selected.builderCode)
    .sort((a, b) => new Date(a.dt) - new Date(b.dt))
    .slice(state.detailRange === "7d" ? -7 : -18);

  if (!rows.length) {
    els.volumeBars.innerHTML = `<span class="muted" style="margin: auto;">No time-series rows for this window.</span>`;
    return;
  }

  const max = Math.max(...rows.map((row) => number(row.volume)), 1);

  // Render Y Axis
  renderYAxis(els.singleYAxis, max);

  rows.forEach((row, idx) => {
    const vol = number(row.volume);
    const pct = (vol / max) * 100;

    const column = document.createElement("div");
    column.className = "single-bar-column";

    const fill = document.createElement("div");
    fill.className = "single-bar-fill";
    fill.style.height = "0%"; // Initial height for transition

    const dateObj = new Date(row.dt.split("T")[0] + "T00:00:00");
    const dateFormatted = dateObj.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
    const dateFormattedFull = dateObj.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric"
    });

    const tooltipHtml = `
      <div style="font-weight: 600; margin-bottom: 2px;">${state.selected.builder || 'Builder'}</div>
      <div style="color: var(--blue-hover); font-weight: 700; font-size: 13px;">${fmtUsd.format(vol)}</div>
      <div style="color: var(--ink-subtle); font-size: 10px; margin-top: 2px;">${dateFormattedFull}</div>
    `;
    fill.addEventListener("mouseover", (e) => showTooltip(e, tooltipHtml));
    fill.addEventListener("mousemove", positionTooltip);
    fill.addEventListener("mouseout", hideTooltip);

    column.append(fill);

    const label = document.createElement("span");
    label.className = "single-bar-label";
    label.textContent = dateFormatted;
    column.append(label);

    els.volumeBars.append(column);

    // Staggered slide-up entry animation
    setTimeout(() => {
      fill.style.height = `${Math.max(3, pct)}%`;
    }, 50 + idx * 25);
  });
}

function updateAccordionHeight() {
  if (els.accordionHeader && els.accordionHeader.classList.contains("active")) {
    els.accordionContent.style.maxHeight = els.accordionContent.scrollHeight + "px";
  }
}

function renderTrades() {
  els.rawTrades.textContent = JSON.stringify(state.trades, null, 2);
  els.cursorState.textContent = state.nextCursor && state.nextCursor !== "LTE=" ? `next_cursor: ${state.nextCursor}` : "End of pages";
  els.loadNextTrades.disabled = !state.nextCursor || state.nextCursor === "LTE=" || state.loading;

  // Render Trades Table Rows
  els.tradeRows.innerHTML = "";
  
  if (state.trades.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.className = "muted";
    cell.style.textAlign = "center";
    cell.textContent = "No trades attributed in this period.";
    row.append(cell);
    els.tradeRows.append(row);
  } else {
    for (const trade of state.trades) {
      const row = els.tradeRowTemplate.content.firstElementChild.cloneNode(true);
      
      const tradeTime = parseTradeTime(trade.matchTime) || parseTradeTime(trade.createdAt);
      const timeStr = tradeTime ? tradeTime.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }) : "-";
      row.querySelector(".trade-time").textContent = timeStr;
      
      const sideEl = row.querySelector(".trade-side");
      const side = (trade.side || "BUY").toUpperCase();
      sideEl.textContent = side;
      if (side === "BUY") {
        sideEl.classList.add("buy");
      } else {
        sideEl.classList.add("sell");
      }
      
      row.querySelector(".trade-size").textContent = fmtUsd.format(number(trade.sizeUsdc));
      
      const priceVal = number(trade.price);
      row.querySelector(".trade-price").textContent = priceVal.toFixed(2);
      
      row.querySelector(".trade-outcome").textContent = trade.outcome || "-";
      
      const mktEl = row.querySelector(".trade-market");
      mktEl.textContent = trade.market || "Unknown market";
      mktEl.title = trade.market || "";
      
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
  els.detailCode.textContent = builder.builderCode || "Legacy / empty builder code";
  els.detailVolume.textContent = fmtCompactUsd.format(number(builder.volume));
  els.detailUsers.textContent = fmtInt.format(number(builder.activeUsers));
  els.detailRangeLabel.textContent = detailRanges[state.detailRange].label;
  renderVolumeBars();
  renderTrades();
}

function render() {
  renderBuilders();
  renderDetail();
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
    state.detailVolumes = [];
    state.hasMoreBuilders = true;
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
    state.builders = [...state.builders, ...page];
    state.nextOffset += page.length;
    state.hasMoreBuilders = page.length === 50;
  } finally {
    state.isLoadingBuilders = false;
    els.refreshButton.disabled = false;
    updateBuilderLoadStatus();
  }
  render();
  loadVolumes(requestedPeriod).then(() => {
    if (requestedPeriod === state.period) renderDetail();
  });
}

async function loadVolumes(period = state.period) {
  try {
    const volumes = await api(`/api/builders/volume?timePeriod=${period}`);
    if (period === state.period) state.volumes = volumes;
  } catch (error) {
    console.warn(error);
    if (period === state.period) state.volumes = [];
  }
}

async function loadDetailVolumes() {
  const period = detailRanges[state.detailRange].volumePeriod;
  try {
    state.detailVolumes = await api(`/api/builders/volume?timePeriod=${period}`);
  } catch (error) {
    console.warn(error);
    state.detailVolumes = [];
  }
}

function unixFromDetailRange() {
  const days = detailRanges[state.detailRange].days;
  if (!days) return "";
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days + 1);
  return String(Math.floor(date.getTime() / 1000));
}

async function loadTrades({ append = false } = {}) {
  if (!state.selected?.builderCode) return;
  state.loading = true;
  els.loadNextTrades.disabled = true;
  try {
    const params = new URLSearchParams({ builder_code: state.selected.builderCode });
    const after = unixFromDetailRange();
    if (after) params.set("after", after);
    if (append && state.nextCursor) params.set("next_cursor", state.nextCursor);
    const payload = await api(`/api/builder/trades?${params}`);
    state.trades = append ? [...state.trades, ...(payload.data || [])] : payload.data || [];
    state.nextCursor = payload.next_cursor || null;
  } finally {
    state.loading = false;
  }
  renderTrades();
}

async function selectBuilder(builder) {
  state.selected = builder;
  state.trades = [];
  state.nextCursor = null;
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

// Event Listeners Wire-up
document.querySelectorAll("[data-period]").forEach((button) => {
  button.addEventListener("click", async () => {
    document.querySelectorAll("[data-period]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    updateSegmentedIndicator();
    state.period = button.dataset.period;
    await loadBuilders({ reset: true });
  });
});

els.searchInput.addEventListener("input", handleSearchInput);
els.verifiedOnly.addEventListener("change", renderBuilders);
els.refreshButton.addEventListener("click", () => loadBuilders({ reset: true }));
els.loadNextTrades.addEventListener("click", () => loadTrades({ append: true }));
els.downloadJson.addEventListener("click", () => {
  download(`${state.selected?.builder || "builder"}-trades.json`, JSON.stringify(state.trades, null, 2), "application/json");
});
els.downloadCsv.addEventListener("click", downloadCsv);

document.querySelectorAll("[data-detail-range]").forEach((button) => {
  button.addEventListener("click", async () => {
    if (button.dataset.detailRange === state.detailRange) return;
    document.querySelectorAll("[data-detail-range]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.detailRange = button.dataset.detailRange;
    state.trades = [];
    state.nextCursor = null;
    renderDetail();
    if (!state.selected) return;
    await loadDetailVolumes();
    await loadTrades({ append: false });
    renderDetail();
  });
});

// Table sorting header click events
document.querySelectorAll("th.sortable").forEach((th) => {
  th.addEventListener("click", () => {
    const col = th.dataset.sort;
    if (state.sortColumn === col) {
      state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
    } else {
      state.sortColumn = col;
      state.sortDirection = (col === "volume" || col === "users") ? "desc" : "asc";
    }
    renderBuilders();
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
  });
}

// Initial Loading & Visual Setup
updateSegmentedIndicator();
window.addEventListener("resize", updateSegmentedIndicator);

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

loadBuilders({ reset: true }).then(() => {
  // Recalculate indicators after layout settles
  setTimeout(updateSegmentedIndicator, 100);
}).catch((error) => {
  els.builderRows.innerHTML = `<tr><td colspan="5">Failed to load data: ${error.message}</td></tr>`;
  console.error(error);
});
