const data = window.__HOTSPOT_DEMO__;
let mode = "forecast";

const fmt = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
const intFmt = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const map = document.querySelector("#zone-map");
const zoneLayer = document.querySelector("#zone-layer");
const flowLayer = document.querySelector("#flow-layer");
const tooltip = document.querySelector("#tooltip");
const tabs = document.querySelectorAll(".tab");
const replayButton = document.querySelector("#replay-button");

const SIMULATION_STEPS = 7;
const STABILIZE_THRESHOLD = 1.5;

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

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sortByGapDesc(zones) {
  return [...zones].sort((left, right) => right.gap - left.gap);
}

function sortByGapAsc(zones) {
  return [...zones].sort((left, right) => left.gap - right.gap);
}

function buildSimulation() {
  const baseZones = deepClone(data.zones).map((zone) => ({
    ...zone,
    gapInitial: zone.gap,
    supplyInitial: zone.supplyP50,
    demandInitial: zone.demandP50,
    supportReceived: 0,
    supportSent: 0,
    activationIncoming: 0,
    availableInitial: Math.max(1, Math.round(zone.supplyP50)),
    outgoingCapacity: Math.max(1, Math.floor(zone.supplyP50 * 0.35)),
  }));

  const donors = sortByGapAsc(baseZones).slice(0, 14);
  const hotspots = sortByGapDesc(baseZones).slice(0, 10);
  const flows = [];
  let relocationPool = donors.reduce((sum, zone) => sum + zone.outgoingCapacity, 0);

  hotspots.forEach((target, hotspotIndex) => {
    const targetNeed = Math.max(1, Math.ceil(target.gapInitial * 0.48));
    let remainingNeed = targetNeed;

    const nearbyDonors = [...donors].sort((left, right) => {
      const leftDistance = Math.hypot(left.x - target.x, left.y - target.y);
      const rightDistance = Math.hypot(right.x - target.x, right.y - target.y);
      return leftDistance - rightDistance;
    });

    nearbyDonors.forEach((source) => {
      if (source.zoneId === target.zoneId || remainingNeed <= 0 || source.outgoingCapacity <= 0) return;
      const units = Math.min(source.outgoingCapacity, remainingNeed, hotspotIndex < 4 ? 3 : 2);
      if (units < 1) return;

      source.outgoingCapacity -= units;
      source.supportSent += units;
      target.supportReceived += units;
      remainingNeed -= units;

      const flowIndex = flows.length;
      const startStep = 1 + (flowIndex % 3);
      const endStep = Math.min(SIMULATION_STEPS, startStep + 2 + (flowIndex % 2));

      flows.push({
        id: `move-${source.zoneId}-${target.zoneId}-${flowIndex}`,
        sourceId: source.zoneId,
        targetId: target.zoneId,
        units,
        type: "relocation",
        startStep,
        endStep,
      });
    });

    // A small reserve activation completes the plan when relocation alone cannot cover the forecast gap.
    target.activationIncoming = Math.max(0, Math.ceil(target.gapInitial - target.supportReceived - 0.75));
  });

  const states = [];
  for (let step = 0; step <= SIMULATION_STEPS; step += 1) {
    const progress = step / SIMULATION_STEPS;
    const zones = baseZones.map((zone) => {
      const sent = flows
        .filter((flow) => flow.sourceId === zone.zoneId && step >= flow.startStep)
        .reduce((sum, flow) => sum + flow.units, 0);
      const incoming = flows
        .filter((flow) => flow.targetId === zone.zoneId)
        .reduce((sum, flow) => {
          const deliveryProgress = clamp((step - flow.startStep) / Math.max(1, flow.endStep - flow.startStep), 0, 1);
          return sum + Math.round(flow.units * deliveryProgress);
        }, 0);
      const activationProgress = clamp((step - 2) / Math.max(1, SIMULATION_STEPS - 2), 0, 1);
      const activated = Math.round(zone.activationIncoming * activationProgress);
      const supplyP50 = zone.supplyInitial + incoming + activated - sent;
      const gap = Math.max(0, zone.gapInitial - (incoming + activated) * 0.96 + sent * 0.3);
      const severity = clamp(zone.gapInitial === 0 ? 0 : gap / Math.max(zone.demandInitial, 1), 0, 1);
      const stabilized = gap <= STABILIZE_THRESHOLD;
      const isSurplus = sent > 0;
      return {
        ...zone,
        supplyP50,
        supplyP10: Math.max(0, zone.supplyP10 + (incoming + activated) * 0.82 - sent),
        supplyP90: zone.supplyP90 + (incoming + activated) * 1.08 - sent,
        gap,
        severity,
        availableVehicles: zone.availableInitial + incoming + activated - sent,
        supportReceived: incoming,
        supportSent: sent,
        activationIncoming: activated,
        isHotspot: !stabilized && gap > 2.2,
        rawHotspot: !stabilized && gap > 1.4,
        isSurplus,
        stabilized,
        surplus: isSurplus ? sent : 0,
      };
    });

    const visibleFlows = flows
      .filter((flow) => step >= flow.startStep)
      .map((flow) => ({
        ...flow,
        active: step < flow.endStep,
        progress: clamp((step - flow.startStep) / Math.max(1, flow.endStep - flow.startStep), 0, 1),
      }));

    const previousZones = states.at(-1)?.zones;
    zones.forEach((zone) => {
      const previous = previousZones?.find((item) => item.zoneId === zone.zoneId);
      zone.vehicleDeltaStep = previous ? zone.availableVehicles - previous.availableVehicles : 0;
    });

    states.push({
      progress,
      zones,
      flows: visibleFlows,
      summary: summarizeZones(zones, flows),
      topHotspots: sortByGapDesc(zones).filter((zone) => zone.isHotspot).slice(0, 8),
      topSurplus: sortByGapAsc(zones).filter((zone) => zone.isSurplus).slice(0, 8),
      plan: buildPlanRows(flows, baseZones, step),
    });
  }

  return {
    flows,
    states,
    totalRelocationUnits: flows.reduce((sum, flow) => sum + flow.units, 0),
    totalActivationUnits: baseZones.reduce((sum, zone) => sum + zone.activationIncoming, 0),
    relocationPool,
  };
}

function summarizeZones(zones, flows) {
  return {
    hotspots: zones.filter((zone) => zone.isHotspot).length,
    rawHotspots: zones.filter((zone) => zone.rawHotspot).length,
    surplusZones: zones.filter((zone) => zone.isSurplus).length,
    totalGap: zones.reduce((sum, zone) => sum + zone.gap, 0),
    moves: flows.length,
    stabilized: zones.filter((zone) => zone.stabilized).length,
  };
}

function buildPlanRows(flows, zones, step) {
  const zoneById = new Map(zones.map((zone) => [zone.zoneId, zone]));
  return flows
    .slice()
    .sort((left, right) => right.units - left.units)
    .slice(0, 8)
    .map((flow) => ({
      ...flow,
      sourceName: zoneById.get(flow.sourceId)?.name ?? `Zone ${flow.sourceId}`,
      targetName: zoneById.get(flow.targetId)?.name ?? `Zone ${flow.targetId}`,
      delivered: Math.round(flow.units * clamp((step - flow.startStep) / Math.max(1, flow.endStep - flow.startStep), 0, 1)),
      etaMin: Math.round(8 + Math.abs(flow.sourceId - flow.targetId) * 1.6),
    }));
}

const simulation = buildSimulation();
let simStep = 0;
let timerId = 0;

function currentState() {
  return simulation.states[simStep];
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
  if (mode === "hotspot") {
    if (zone.isHotspot) return zone.severity >= 0.35 ? "#991b1b" : "#dc2626";
    if (zone.rawHotspot) return "#f59e0b";
    if (zone.isSurplus) return "#15986f";
    return "#94a3b8";
  }
  if (zone.stabilized) return "#15986f";
  if (zone.supportReceived > 0.2) return zone.gap > 2.4 ? "#f59e0b" : "#22c55e";
  if (zone.isSurplus) return "#0f766e";
  return colorFromGap(zone.gap);
}

function radiusForZone(zone) {
  const base = mode === "forecast" ? zone.demandP50 : Math.max(zone.severity * 18, 2.5);
  return clamp(2.7 + base / 7.5, 3.2, 7.6);
}

function relocationStatus(zone) {
  if (zone.stabilized) return "Recovered after relocation";
  if (zone.supportReceived > 0.2) return "Receiving inbound support";
  if (zone.isSurplus) return "Sending support outward";
  return zone.isHotspot ? "Still under pressure" : "Stable";
}

function tooltipHtml(zone) {
  const status =
    mode === "relocation"
      ? relocationStatus(zone)
      : zone.isHotspot
        ? "Hotspot after hysteresis"
        : zone.rawHotspot
          ? "Raw alert"
          : zone.isSurplus
            ? "Surplus"
            : "Stable";
  return `
    <h3>Zone ${zone.zoneId} | ${zone.name}</h3>
    <div class="tooltip-row"><span>Status</span><strong>${status}</strong></div>
    <div class="tooltip-row"><span>Available vehicles now</span><strong>${intFmt.format(zone.availableVehicles)}</strong></div>
    <div class="tooltip-row"><span>Vehicles before plan</span><strong>${intFmt.format(zone.availableInitial)}</strong></div>
    <div class="tooltip-row"><span>Demand p10/p50/p90</span><strong>${fmt.format(zone.demandP10)} / ${fmt.format(zone.demandP50)} / ${fmt.format(zone.demandP90)}</strong></div>
    <div class="tooltip-row"><span>Supply p10/p50/p90</span><strong>${fmt.format(zone.supplyP10)} / ${fmt.format(zone.supplyP50)} / ${fmt.format(zone.supplyP90)}</strong></div>
    <div class="tooltip-row"><span>Gap</span><strong>${fmt.format(zone.gap)}</strong></div>
    <div class="tooltip-row"><span>Severity</span><strong>${fmt.format(zone.severity)}</strong></div>
    <div class="tooltip-row"><span>Inbound relocation</span><strong>${fmt.format(zone.supportReceived)}</strong></div>
    <div class="tooltip-row"><span>Activation top-up</span><strong>${fmt.format(zone.activationIncoming)}</strong></div>
    <div class="tooltip-row"><span>Outbound support</span><strong>${fmt.format(zone.supportSent)}</strong></div>
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

function zoneNodeClass(zone) {
  const names = ["zone-node"];
  if (zone.rawHotspot && !zone.isHotspot) names.push("raw");
  if (mode === "relocation" && zone.stabilized) names.push("relieved");
  if (mode === "relocation" && zone.vehicleDeltaStep > 0) names.push("vehicle-up");
  if (mode === "relocation" && zone.vehicleDeltaStep < 0) names.push("vehicle-down");
  return names.join(" ");
}

function renderFlows(state) {
  flowLayer.innerHTML = "";
  if (mode !== "relocation") return;

  const zones = new Map(state.zones.map((zone) => [zone.zoneId, zone]));
  for (const flow of state.flows) {
    const source = zones.get(flow.sourceId);
    const target = zones.get(flow.targetId);
    if (!source || !target) continue;

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const controlX = (source.x + target.x) / 2 + (target.y - source.y) * 0.08;
    const controlY = (source.y + target.y) / 2 - (target.x - source.x) * 0.08;
    path.setAttribute("class", `flow-link${flow.active ? " active" : ""}`);
    path.setAttribute("d", `M ${source.x} ${source.y} Q ${controlX} ${controlY} ${target.x} ${target.y}`);
    flowLayer.append(path);

    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    const dotX = (1 - flow.progress) * (1 - flow.progress) * source.x + 2 * (1 - flow.progress) * flow.progress * controlX + flow.progress * flow.progress * target.x;
    const dotY = (1 - flow.progress) * (1 - flow.progress) * source.y + 2 * (1 - flow.progress) * flow.progress * controlY + flow.progress * flow.progress * target.y;
    dot.setAttribute("class", "flow-dot");
    dot.setAttribute("cx", dotX);
    dot.setAttribute("cy", dotY);
    dot.setAttribute("r", clamp(0.55 + flow.units / 7.5, 0.65, 1.3));
    flowLayer.append(dot);
  }
}

function renderMap() {
  const state = currentState();
  zoneLayer.innerHTML = "";
  renderFlows(state);

  for (const zone of state.zones) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", "g");
    node.setAttribute("class", zoneNodeClass(zone));
    node.setAttribute("transform", `translate(${zone.x} ${zone.y})`);

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("r", radiusForZone(zone));
    circle.setAttribute("fill", colorForZone(zone));
    circle.setAttribute("opacity", zone.isHotspot || mode === "forecast" ? "0.95" : "0.84");

    const code = document.createElementNS("http://www.w3.org/2000/svg", "text");
    code.setAttribute("class", "zone-code");
    code.textContent = `Z${zone.zoneId}`;

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("class", "zone-value");
    label.textContent = intFmt.format(zone.availableVehicles);

    node.append(circle, code, label);
    if (mode === "relocation" && zone.vehicleDeltaStep !== 0) {
      const delta = document.createElementNS("http://www.w3.org/2000/svg", "text");
      delta.setAttribute("class", "vehicle-delta");
      delta.setAttribute("y", radiusForZone(zone) + 2.4);
      delta.textContent = `${zone.vehicleDeltaStep > 0 ? "+" : ""}${intFmt.format(zone.vehicleDeltaStep)}`;
      node.append(delta);
    }
    node.addEventListener("mousemove", (event) => showTooltip(zone, event));
    node.addEventListener("mouseleave", hideTooltip);
    zoneLayer.append(node);
  }
}

function zoneItem(zone, kind) {
  const metric =
    kind === "hotspot"
      ? `${fmt.format(zone.gap)} gap`
      : kind === "surplus"
        ? `${fmt.format(zone.surplus)} sent`
        : `${fmt.format(zone.supportReceived)} inbound`;
  const sub =
    kind === "hotspot"
      ? `severity ${fmt.format(zone.severity)} | support ${fmt.format(zone.supportReceived)}`
      : kind === "surplus"
        ? `gap now ${fmt.format(zone.gap)} | still stable`
        : `activation ${fmt.format(zone.activationIncoming)} | outbound ${fmt.format(zone.supportSent)}`;
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

function planItem(row) {
  return `
    <div class="plan-item">
      <strong class="plan-route">Zone ${row.sourceId} ${row.sourceName} -> Zone ${row.targetId} ${row.targetName}</strong>
      <div class="plan-meta">
        <span>${fmt.format(row.delivered)} / ${fmt.format(row.units)} units delivered</span>
        <span>ETA ${row.etaMin} min</span>
      </div>
    </div>
  `;
}

function renderLists() {
  const state = currentState();
  const hotspotList = document.querySelector("#hotspot-list");
  const surplusList = document.querySelector("#surplus-list");
  const planList = document.querySelector("#plan-list");

  hotspotList.innerHTML = state.topHotspots.length
    ? state.topHotspots.map((zone) => zoneItem(zone, "hotspot")).join("")
    : `<div class="empty">Hotspots have been stabilized</div>`;
  surplusList.innerHTML = state.topSurplus.length
    ? state.topSurplus.map((zone) => zoneItem(zone, "surplus")).join("")
    : `<div class="empty">No zone is sending support yet</div>`;
  planList.innerHTML = state.plan.length
    ? state.plan.map((row) => planItem(row)).join("")
    : `<div class="empty">Relocation plan is warming up</div>`;
}

function renderLegend() {
  const legend = document.querySelector("#legend");
  if (mode === "forecast") {
    legend.innerHTML = `<span>Supply surplus</span><span class="legend-swatch"></span><span>High gap</span>`;
    return;
  }
  if (mode === "hotspot") {
    legend.innerHTML = `
      <span class="legend-hotspot"><span class="legend-dot"></span>Hotspot</span>
      <span class="legend-hotspot"><span class="legend-dot surplus"></span>Surplus</span>
    `;
    return;
  }
  legend.innerHTML = `
    <span class="legend-hotspot"><span class="legend-dot"></span>Pressure</span>
    <span class="legend-hotspot"><span class="legend-dot" style="background:#f59e0b"></span>Recovering</span>
    <span class="legend-hotspot"><span class="legend-dot surplus"></span>Stabilized</span>
  `;
}

function renderMeta() {
  const state = currentState();
  document.querySelector("#scenario-t0").textContent = shortTime(data.scenario.t0);
  document.querySelector("#scenario-forecast").textContent = `${shortTime(data.scenario.forecastTs)} | h${data.scenario.horizonMin}`;
  document.querySelector("#scenario-regime").textContent = data.scenario.regime;
  document.querySelector("#scenario-gap-mode").textContent = data.scenario.gapMode;
  document.querySelector("#stat-hotspots").textContent = state.summary.hotspots;
  document.querySelector("#stat-raw").textContent = state.summary.rawHotspots;
  document.querySelector("#stat-surplus").textContent = state.summary.surplusZones;
  document.querySelector("#stat-gap").textContent = fmt.format(data.summary.totalGap);
  document.querySelector("#stat-moves").textContent = state.summary.moves;
  document.querySelector("#stat-gap-after").textContent = fmt.format(state.summary.totalGap);
  document.querySelector("#hotspot-count").textContent = `${state.topHotspots.length} zone`;
  document.querySelector("#surplus-count").textContent = `${state.topSurplus.length} zone`;
  document.querySelector("#plan-count").textContent = `${state.plan.length} move`;
}

function renderModeCopy() {
  const title = document.querySelector("#map-title");
  const subtitle = document.querySelector("#map-subtitle");
  if (mode === "forecast") {
    title.textContent = "Forecast gap by zone";
    subtitle.textContent = "The large number is available vehicles; Z-number identifies the zone. Color follows forecast gap.";
    return;
  }
  if (mode === "hotspot") {
    title.textContent = "Hotspot detection result";
    subtitle.textContent = "The large number is available vehicles. Red zones need support; lower-pressure zones can release vehicles.";
    return;
  }
  title.textContent = "Relocation playback";
  subtitle.textContent = "Watch vehicle counts fall at source zones and jump at destinations as red pressure turns green.";
}

function renderPlayback() {
  const state = currentState();
  const phase = document.querySelector("#relocation-phase");
  const caption = document.querySelector("#relocation-caption");
  const progressFill = document.querySelector("#progress-fill");
  progressFill.style.width = `${state.progress * 100}%`;

  if (state.progress === 0) {
    phase.textContent = "TRƯỚC ĐIỀU PHỐI";
    caption.textContent = "Số lớn trong mỗi zone là lượng xe khả dụng ban đầu; các zone đỏ đang thiếu xe.";
    return;
  }
  if (state.progress < 0.34) {
    phase.textContent = "ĐANG ĐIỀU XE | Xe rời vùng nguồn";
    caption.textContent = "Zone nguồn hiện -n và số xe giảm; chấm xanh biểu diễn xe đang di chuyển.";
    return;
  }
  if (state.progress < 0.68) {
    phase.textContent = "ĐANG ĐIỀU XE | Xe đến vùng thiếu";
    caption.textContent = "Zone đích hiện +n, số xe tăng và màu chuyển dần từ đỏ sang vàng/xanh.";
    return;
  }
  if (state.progress < 1) {
    phase.textContent = "ĐANG ỔN ĐỊNH";
    caption.textContent = "Xe điều phối và xe dự phòng tiếp tục lấp khoảng thiếu tại các hotspot ưu tiên.";
    return;
  }
  phase.textContent = "SAU ĐIỀU PHỐI";
  caption.textContent = "Số xe mới được giữ trên node để so sánh; các hotspot đã đủ xe chuyển sang xanh.";
}

function render() {
  renderMeta();
  renderLegend();
  renderModeCopy();
  renderPlayback();
  renderMap();
  renderLists();
}

function stopPlayback() {
  if (timerId) {
    window.clearInterval(timerId);
    timerId = 0;
  }
}

function startPlayback() {
  stopPlayback();
  mode = "relocation";
  simStep = 0;
  tabs.forEach((item) => item.classList.toggle("active", item.dataset.mode === mode));
  render();

  timerId = window.setInterval(() => {
    simStep += 1;
    if (simStep >= simulation.states.length - 1) {
      simStep = simulation.states.length - 1;
      stopPlayback();
    }
    render();
  }, 950);
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    if (tab.dataset.mode === "relocation") {
      startPlayback();
      return;
    }
    mode = tab.dataset.mode;
    simStep = 0;
    tabs.forEach((item) => item.classList.toggle("active", item === tab));
    stopPlayback();
    render();
  });
});

replayButton.addEventListener("click", startPlayback);

render();
