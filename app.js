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
  
  // Detail sidebar elements
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
    cell.textContent = "No builders match the current filters.";
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

  const rows = state.volumes
    .filter((row) => row.builderCode === state.selected.builderCode)
    .sort((a, b) => new Date(a.dt) - new Date(b.dt))
    .slice(-18);

  if (!rows.length) {
    els.volumeBars.innerHTML = `<span class="muted" style="margin: auto;">No time-series rows for this period.</span>`;
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
      
      const timeStr = new Date(trade.matchTime || trade.createdAt).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
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
    renderGlobalVolumeChart();
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

// Event Listeners Wire-up
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

// Initial Loading
loadBuilders({ reset: true }).catch((error) => {
  els.builderRows.innerHTML = `<tr><td colspan="5">Failed to load data: ${error.message}</td></tr>`;
  console.error(error);
});
