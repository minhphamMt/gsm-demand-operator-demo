const data = window.__HOTSPOT_DEMO__;
let mode = "forecast";

const fmt = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
const map = document.querySelector("#zone-map");
const layer = document.querySelector("#zone-layer");
const tooltip = document.querySelector("#tooltip");
const tabs = document.querySelectorAll(".tab");

function shortTime(value) {
  return new Date(value).toLocaleString("vi-VN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function colorFromGap(gap) {
  const t = clamp((gap + 4) / 18, 0, 1);
  const stops = [
    [44, 127, 184],
    [241, 196, 83],
    [215, 48, 39],
  ];
  const left = t < 0.5 ? stops[0] : stops[1];
  const right = t < 0.5 ? stops[1] : stops[2];
  const local = t < 0.5 ? t * 2 : (t - 0.5) * 2;
  return `rgb(${Math.round(lerp(left[0], right[0], local))}, ${Math.round(
    lerp(left[1], right[1], local),
  )}, ${Math.round(lerp(left[2], right[2], local))})`;
}

function colorForZone(zone) {
  if (mode === "forecast") return colorFromGap(zone.gap);
  if (zone.isHotspot) return zone.severity >= 0.35 ? "#991b1b" : "#dc2626";
  if (zone.rawHotspot) return "#f59e0b";
  if (zone.isSurplus) return "#15986f";
  return "#94a3b8";
}

function radiusForZone(zone) {
  const base = mode === "forecast" ? zone.demandP50 : Math.max(zone.severity * 18, 2.5);
  return clamp(2.7 + base / 7.5, 3.2, 7.6);
}

function tooltipHtml(zone) {
  const status = zone.isHotspot ? "Hotspot after hysteresis" : zone.rawHotspot ? "Raw alert" : zone.isSurplus ? "Surplus" : "Stable";
  return `
    <h3>Zone ${zone.zoneId} | ${zone.name}</h3>
    <div class="tooltip-row"><span>Status</span><strong>${status}</strong></div>
    <div class="tooltip-row"><span>Demand p10/p50/p90</span><strong>${fmt.format(zone.demandP10)} / ${fmt.format(zone.demandP50)} / ${fmt.format(zone.demandP90)}</strong></div>
    <div class="tooltip-row"><span>Supply p10/p50/p90</span><strong>${fmt.format(zone.supplyP10)} / ${fmt.format(zone.supplyP50)} / ${fmt.format(zone.supplyP90)}</strong></div>
    <div class="tooltip-row"><span>Actual demand/supply</span><strong>${zone.actualDemand} / ${zone.actualSupply}</strong></div>
    <div class="tooltip-row"><span>Gap</span><strong>${fmt.format(zone.gap)}</strong></div>
    <div class="tooltip-row"><span>Severity</span><strong>${fmt.format(zone.severity)}</strong></div>
    <div class="tooltip-row"><span>Idle current</span><strong>${zone.idleCurrent}</strong></div>
    <div class="tooltip-row"><span>Rain now/forecast</span><strong>${fmt.format(zone.rain)} / ${fmt.format(zone.rainForecast15)}</strong></div>
  `;
}

function showTooltip(zone, event) {
  tooltip.innerHTML = tooltipHtml(zone);
  tooltip.hidden = false;
  const bounds = map.getBoundingClientRect();
  const x = event.clientX - bounds.left + 18;
  const y = event.clientY - bounds.top + 18;
  tooltip.style.left = `${Math.min(x, bounds.width - 292)}px`;
  tooltip.style.top = `${Math.min(y, bounds.height - 250)}px`;
}

function hideTooltip() {
  tooltip.hidden = true;
}

function renderMap() {
  layer.innerHTML = "";
  for (const zone of data.zones) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", "g");
    node.setAttribute("class", `zone-node${zone.rawHotspot && !zone.isHotspot ? " raw" : ""}`);
    node.setAttribute("transform", `translate(${zone.x} ${zone.y})`);

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("r", radiusForZone(zone));
    circle.setAttribute("fill", colorForZone(zone));
    circle.setAttribute("opacity", zone.isHotspot || mode === "forecast" ? "0.95" : "0.82");

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.textContent = zone.zoneId;

    node.append(circle, label);
    node.addEventListener("mousemove", (event) => showTooltip(zone, event));
    node.addEventListener("mouseleave", hideTooltip);
    layer.append(node);
  }
}

function zoneItem(zone, kind) {
  const metric = kind === "hotspot" ? `${fmt.format(zone.gap)} gap` : `${fmt.format(zone.surplus)} surplus`;
  const sub = kind === "hotspot" ? `severity ${fmt.format(zone.severity)} | idle ${zone.idleCurrent}` : `supply p50 ${fmt.format(zone.supplyP50)} | demand p50 ${fmt.format(zone.demandP50)}`;
  return `
    <div class="zone-item">
      <div class="zone-badge">${zone.zoneId}</div>
      <div class="zone-name">
        <strong>${zone.name}</strong>
        <span>${sub}</span>
      </div>
      <div class="zone-metric">
        <strong>${metric}</strong>
        <span>${zone.tier}</span>
      </div>
    </div>
  `;
}

function renderLists() {
  const hotspotList = document.querySelector("#hotspot-list");
  const surplusList = document.querySelector("#surplus-list");
  hotspotList.innerHTML = data.topHotspots.length
    ? data.topHotspots.map((zone) => zoneItem(zone, "hotspot")).join("")
    : `<div class="empty">No hotspot after hysteresis</div>`;
  surplusList.innerHTML = data.topSurplus.length
    ? data.topSurplus.map((zone) => zoneItem(zone, "surplus")).join("")
    : `<div class="empty">No surplus zone</div>`;
}

function renderLegend() {
  const legend = document.querySelector("#legend");
  if (mode === "forecast") {
    legend.innerHTML = `<span>Supply surplus</span><span class="legend-swatch"></span><span>High gap</span>`;
    return;
  }
  legend.innerHTML = `
    <span class="legend-hotspot"><span class="legend-dot"></span>Hotspot</span>
    <span class="legend-hotspot"><span class="legend-dot surplus"></span>Surplus</span>
  `;
}

function renderMeta() {
  document.querySelector("#scenario-t0").textContent = shortTime(data.scenario.t0);
  document.querySelector("#scenario-forecast").textContent = `${shortTime(data.scenario.forecastTs)} | h${data.scenario.horizonMin}`;
  document.querySelector("#scenario-regime").textContent = data.scenario.regime;
  document.querySelector("#scenario-gap-mode").textContent = data.scenario.gapMode;
  document.querySelector("#stat-hotspots").textContent = data.summary.hotspots;
  document.querySelector("#stat-raw").textContent = data.summary.rawHotspots;
  document.querySelector("#stat-surplus").textContent = data.summary.surplusZones;
  document.querySelector("#stat-gap").textContent = fmt.format(data.summary.totalGap);
  document.querySelector("#hotspot-count").textContent = `${data.topHotspots.length} zone`;
  document.querySelector("#surplus-count").textContent = `${data.topSurplus.length} zone`;
}

function renderModeCopy() {
  const title = document.querySelector("#map-title");
  const subtitle = document.querySelector("#map-subtitle");
  if (mode === "forecast") {
    title.textContent = "Forecast gap by zone";
    subtitle.textContent = "Circle size follows p50 demand. Color follows forecast demand-supply gap.";
  } else {
    title.textContent = "Hotspot detection result";
    subtitle.textContent = "Red zones are active hotspots after hysteresis. Green zones are surplus sources.";
  }
}

function render() {
  renderMeta();
  renderLegend();
  renderModeCopy();
  renderMap();
  renderLists();
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    mode = tab.dataset.mode;
    tabs.forEach((item) => item.classList.toggle("active", item === tab));
    render();
  });
});

render();
