/**
 * Produce reviewable metadata candidates without modifying the curated file.
 *
 * The leaderboard is authoritative for builderCode. pm.wiki is used only as a
 * discovery index for project-controlled links; every generated candidate
 * should still be reviewed before it is copied into builder-metadata.js.
 */
const projectSlugs = new Map([
  ["betmoar", "betmoar"],
  ["Gate", "gate"],
  ["traderline", "traderline"],
  ["polymtrade", "polymtrade"],
  ["SpreadCore.xyz", "spreadcore-xyz"],
  ["MagicMarkets", "magicmarkets"],
  ["Jupiter", "jupiter"],
  ["MetaMask", "metamask"],
  ["PolyCop", "polycop"],
  ["standtrade", "stand-trade"],
  ["Sharkbetting.com", "sharkbetting-com"],
  ["Bitget Wallet", "bitget-wallet"],
  ["POTS", "pots"],
  ["polytraderpro", "polytraderpro"],
  ["NautilusTrader", "nautilustrader"],
  ["Bagel", "bagel"],
  ["EVplusAI", "evplusai"],
  ["swaps.xyz", "swaps-xyz"],
  ["Preddy.trade", "preddy-trade"],
  ["Polytrader.app", "polytrader-app"],
  ["Polygun", "polygun"],
  ["Kreo", "kreo"],
  ["senal.io", "senal-io"],
  ["Bullpen", "bullpenfi"],
  ["OVERDOG", "overdog"],
  ["Share", "share"],
  ["Byreal", "byreal"],
  ["Firefly", "firefly"],
  ["HEXBIT", "hexbit"],
  ["Phemex", "phemex"],
  ["SafePal", "safepal"],
  ["Axiom", "axiom"],
  ["Tailgate", "tailgate"],
  ["Olympusx.app", "olympus"],
  ["Deepcoin", "deepcoin"],
  ["Polywatchdog.com", "polywatchdog-com"],
  ["WagerUpPilot", "wageruppilot"],
  ["TruthX.com", "truthx-com"],
  ["almanac.market", "almanac"],
  ["Ask Gina", "ask-gina"],
  ["PolyTap Bot", "polytap-bot"],
  ["Pulse Market", "pulse-market"],
  ["Predict Engine", "predict-engine"],
  ["polyinit.com", "polyinit-com"],
  ["Polycool", "polycool"],
  ["SpectraView", "spectraview"],
  ["Atomic Wallet", "atomic-wallet"],
  ["deltaforge", "deltaforge"],
  ["Lash", "lash"],
  ["Synthesis.Trade", "synthesis"],
  ["Predex.dev", "predex-dev"],
  ["Polycule", "polycule"],
  ["GambitMarkets", "gambitmarkets"],
  ["Amplifi", "amplifi"],
  ["wick.trade", "wick-trade"],
  ["ZOOMEX", "zoomex123"],
  ["Predictu", "predictu"],
  ["Fortuna", "fortuna"],
  ["Bravado", "bravado"],
  ["Crisp.trade", "crisp-trade"],
  ["billion live", "billion-live"],
  ["Rainmaker", "rainmaker"],
  ["FORS", "fors"],
  ["Hotcoin", "hotcoin"],
  ["Ratio.you", "ratio"],
  ["justbeepit", "justbeepit"],
  ["PolyScalping", "polyscalping"],
  ["Zengo", "zengo"],
  ["okbet.trade", "okbet"],
  ["Simmer.Markets", "simmer"],
  ["Ares", "ares"],
  ["Insiders.bot", "insiders-bot"],
  ["JexTrade.com", "jextrade"],
  ["BloFin Wallet", "blofin-wallet"],
  ["Coinpilot", "coinpilot"],
  ["KuCoin Web3", "kucoin-web3"],
  ["Predx.Pro", "predx"],
  ["Synoptic", "synoptic"],
  ["ArbitradePro", "arbitradepro"],
  ["Nomos", "nomos"],
  ["Manic.Trade", "manic-trade"],
  ["merlin.trade", "merlin"],
  ["CarbonCopy", "carboncopy"],
  ["Datadash", "datadash"],
  ["River Markets", "river-markets"],
  ["NOKS.COM", "noks-com"],
  ["FlipX", "flipx"],
  ["UnifAI Network", "unifai"],
  ["Onsight", "onsight"],
  ["Lute", "lute"],
  ["Chance.tech", "chance"],
  ["Predikt.gg", "predikt-gg"],
  ["Kickr.fun", "kickr-fun"],
  ["Airavat", "airavat-the-terminal-for-alternative-markets"],
  ["BigONE Global", "bigone-global"],
  ["BC.GAME", "bc-game"],
  ["FrenFlow", "frenflow"],
  ["polyrust", "polyrust"],
  ["ravn.gg", "ravn-gg"],
  ["Clover", "clover"],
  ["Rainbow", "rainbow"],
  ["tread.fi", "tread-fi"],
  ["Stair-AI", "stair-ai"],
  ["neuball", "neuball"],
  ["FereAI.xyz", "fere-ai"],
  ["ZEIT Finance", "zeit-finance"],
  ["sides.trade", "sides"],
  ["PolyX - poly-x.trade", "polyx-poly-x-trade"],
  ["Polyterm", "polyterm"],
  ["Boosted.Trading", "boosted-trading-your-complete-trading-operating-system"],
  ["Predicade", "predicade"],
  ["Hunch", "hunch"],
  ["Omen Trading", "omen-trading"],
]);

function addLink(links, input) {
  if (!input) return;
  let value = input.replaceAll("\\u0026", "&");
  if (value.startsWith("http://")) value = `https://${value.slice(7)}`;

  let url;
  try {
    url = new URL(value);
  } catch {
    return;
  }

  const host = url.hostname.toLowerCase();
  if (host === "twitter.com" || host === "www.twitter.com") {
    url.hostname = "x.com";
    links.x ??= url.href;
  } else if (host === "x.com" || host === "www.x.com") {
    links.x ??= url.href;
  } else if (host === "t.me") {
    links.telegram ??= url.href;
  } else if (host.includes("discord.")) {
    links.discord ??= url.href;
  } else if (host === "github.com") {
    links.github ??= url.href;
  } else if (!host.includes("pm.wiki")) {
    links.website ??= url.href;
  }
}

async function loadLeaderboard() {
  const builders = [];
  for (let offset = 0; offset < 1_000; offset += 50) {
    const url = new URL("https://data-api.polymarket.com/v1/builders/leaderboard");
    url.searchParams.set("timePeriod", "MONTH");
    url.searchParams.set("limit", "50");
    url.searchParams.set("offset", String(offset));
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Leaderboard request failed: ${response.status}`);
    const page = await response.json();
    builders.push(...page);
    if (page.length < 50) break;
  }
  return builders;
}

async function discoverProfile(builder, slug) {
  const source = `https://pm.wiki/projects/${slug}`;
  const response = await fetch(source);
  if (!response.ok) return null;
  const html = await response.text();
  const match = html.match(
    /"about":\{"@type":"Organization","name":"([^"]*)","description":"[\s\S]*?","url":"([^"]*)","logo":"[^"]*","sameAs":\[([^\]]*)\]/,
  );
  if (!match) return null;

  const links = {};
  addLink(links, match[2]);
  for (const item of match[3].matchAll(/"([^"]+)"/g)) addLink(links, item[1]);

  return {
    builderCode: builder.builderCode,
    name: builder.builder,
    links,
    source,
  };
}

const leaderboard = await loadLeaderboard();
const buildersByName = new Map(leaderboard.map((builder) => [builder.builder, builder]));
const candidates = [];

for (const entries of Array.from(projectSlugs.entries()).reduce((groups, entry, index) => {
  const group = Math.floor(index / 12);
  groups[group] ??= [];
  groups[group].push(entry);
  return groups;
}, [])) {
  const batch = await Promise.all(entries.map(async ([name, slug]) => {
    const builder = buildersByName.get(name);
    return builder ? discoverProfile(builder, slug) : null;
  }));
  candidates.push(...batch.filter(Boolean));
}

if (process.argv.includes("--compact")) {
  for (const candidate of candidates) {
    const slug = candidate.source.split("/").at(-1);
    console.log(`  ${JSON.stringify([
      candidate.builderCode,
      candidate.name,
      slug,
      candidate.links,
    ])},`);
  }
} else {
  console.log(JSON.stringify(candidates, null, 2));
}
console.error(`Discovered ${candidates.length} reviewable profile candidates.`);
