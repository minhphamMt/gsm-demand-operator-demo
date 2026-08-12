import { useQuery } from "@tanstack/react-query";
import {
  Check,
  ChevronRight,
  Circle,
  CloudRain,
  LoaderCircle,
  Pause,
  Search,
  X,
} from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

import {
  campaignsQuery,
  isCampaignOperational,
  latestAgentProposalForSnapshot,
  operationalGapFor,
  plansQuery,
  replayWindowQuery,
  snapshotQuery,
  useOperatorActions,
} from "@/features/operator-data";
import type { Campaign, Proposal, Snapshot, Zone } from "@/features/operator-data";
import { projectZonesAtMinute } from "@/features/operator-dashboard/model/forecastProjection";
import { Skeleton } from "@/shared/components/ui/FeedbackStates";
import { routes } from "@/shared/config/routes";
import { formatNumber } from "@/shared/lib/format";
import { ReplayTimeline } from "./ReplayTimeline";
import { ExecutionDrawer } from "./components/ExecutionDrawer";
import { ForecastDrawer } from "./components/ForecastDrawer";
import { PlanDrawer } from "./components/PlanDrawer";
import {
  planningHorizonFor,
  stageAtLeast,
  stageHasPlan,
  resolveWorkflowStage,
  type OperatorWorkflowStage,
} from "./model/operatorWorkflow";
import { proposalCoverageForStage } from "./model/proposalCoverage";
import { scenarioPresentation } from "./model/scenarioPresentation";
import { DEFAULT_OPERATOR_REPLAY_SOURCE_AT } from "./model/defaultReplay";
import "./operator-dashboard.css";

const OperatorMap = lazy(() =>
  import("@/features/operator-map/components/OperatorMap").then(
    ({ OperatorMap: MapComponent }) => ({ default: MapComponent }),
  ),
);
type MapLayer = "gap" | "demand" | "supply";
type MapView = "city" | "core";
type MapSource = "observed" | "forecast";
type DialogKind = "approve" | "release" | "reject" | null;

export function OperatorConsoleDashboard() {
  const navigate = useNavigate();
  const [forecastMinutes, setForecastMinutes] = useState<15 | 30>(30);
  const [replaySnapshot, setReplaySnapshot] = useState<Snapshot>();
  const [selectedZoneId, setSelectedZoneId] = useState<string>();
  const [search, setSearch] = useState("");
  const [finderOpen, setFinderOpen] = useState(true);
  const [layer, setLayer] = useState<MapLayer>("gap");
  const [mapView, setMapView] = useState<MapView>("city");
  const [mapSource, setMapSource] = useState<MapSource>("observed");
  const [replayTargetAt, setReplayTargetAt] = useState<string>();
  const [forecastRun, setForecastRun] = useState<{
    horizon: 5 | 15 | 30;
    sourceAt: string;
  } | null>(null);
  const [workflowStage, setWorkflowStage] = useState<OperatorWorkflowStage>("observe");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(true);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [rejectNote, setRejectNote] = useState("");
  const snapshot = useQuery(snapshotQuery("baseline"));
  const replayAnchorRef = useRef(DEFAULT_OPERATOR_REPLAY_SOURCE_AT);
  const replayWindow = useQuery(
    replayWindowQuery(replayAnchorRef.current),
  );
  const plans = useQuery(plansQuery());
  const campaigns = useQuery(campaignsQuery());
  const actions = useOperatorActions();
  const defaultReplayStartedRef = useRef(false);

  useEffect(() => {
    if (!snapshot.data || defaultReplayStartedRef.current) return;
    defaultReplayStartedRef.current = true;
    setReplayTargetAt(DEFAULT_OPERATOR_REPLAY_SOURCE_AT);
    setDrawerOpen(false);
    actions.runReplayStep.mutate(DEFAULT_OPERATOR_REPLAY_SOURCE_AT, {
      onSuccess: (nextSnapshot) => {
        const nextAt = nextSnapshot.sourceAt ?? nextSnapshot.generatedAt;
        setReplaySnapshot(nextSnapshot);
        setForecastRun({ horizon: 5, sourceAt: nextAt });
        setWorkflowStage("forecast");
        setMapSource("forecast");
      },
      onSettled: () => setReplayTargetAt(undefined),
    });
  }, [actions.runReplayStep, snapshot.data]);

  if (snapshot.isPending)
    return (
      <div className="nf-console-loading">
        <Skeleton />
      </div>
    );
  if (snapshot.isError || !snapshot.data)
    return (
      <div className="nf-console-loading">
        <strong>Không thể nạp snapshot vận hành.</strong>
        <button
          className="btn btn-secondary"
          onClick={() => void snapshot.refetch()}
          type="button"
        >
          Thử lại
        </button>
      </div>
    );
  const activeSnapshot = replaySnapshot ?? snapshot.data;
  const latestPlan = latestAgentProposalForSnapshot(plans.data, activeSnapshot.replayStep);
  const linkedCampaign = campaigns.data?.find((item) => item.planId === latestPlan?.id);
  const campaign = campaigns.data?.find(
    (item) => item.planId === latestPlan?.id && isCampaignOperational(item),
  );
  // A terminal campaign belongs on the history page only. Its approved proposal
  // must not reappear as an actionable move or be released for a second time.
  const plan = linkedCampaign && !campaign ? undefined : latestPlan;
  const activeStage = resolveWorkflowStage(workflowStage, Boolean(campaign), plan?.status);
  const planReady = stageHasPlan(activeStage);
  const sourceAt = activeSnapshot.sourceAt ?? activeSnapshot.generatedAt;
  const observedZones = activeSnapshot.zones;
  const forecastReady = forecastRun?.sourceAt === sourceAt;
  const forecastStale = forecastRun !== null && !forecastReady;
  const displayedHorizon = forecastReady
    ? forecastRun.horizon
    : forecastMinutes;
  const zones =
    mapSource === "forecast" && forecastReady
      ? projectZonesAtMinute(
          observedZones,
          displayedHorizon,
          activeSnapshot.regime === "rain_peak",
        )
      : observedZones;
  const replayTime = formatTimeLabel(sourceAt);
  const forecastTime = addMinutesLabel(sourceAt, displayedHorizon);
  const selectedZone = zones.find((zone) => zone.id === selectedZoneId);
  const deficit = zones.reduce(
    (sum, zone) =>
      sum + Math.max(0, zone.operationalGap ?? operationalGapFor(zone)),
    0,
  );
  const available = zones.reduce(
    (sum, zone) =>
      sum + Math.max(0, -(zone.operationalGap ?? operationalGapFor(zone))),
    0,
  );
  const hotspots = zones.filter((zone) => {
    const gap = zone.operationalGap ?? operationalGapFor(zone);
    return zone.supply < 3 || (zone.demand > 0 && gap / zone.demand >= 0.3);
  }).length;
  const visibleZones = [...zones]
    .filter((zone) =>
      zone.label
        .toLocaleLowerCase("vi")
        .includes(search.toLocaleLowerCase("vi")),
    )
    .sort((a, b) => a.aiZoneId - b.aiZoneId);
  const pending =
    actions.approve.isPending ||
    actions.reject.isPending ||
    actions.activate.isPending;

  const changeReplaySource = (nextSourceAt: string) => {
    setReplayTargetAt(nextSourceAt);
    setDrawerOpen(false);
    actions.runReplayStep.mutate(nextSourceAt, {
      onSuccess: (nextSnapshot) => {
        const nextAt = nextSnapshot.sourceAt ?? nextSnapshot.generatedAt;
        setReplaySnapshot(nextSnapshot);
        setForecastRun({ horizon: 5, sourceAt: nextAt });
        setWorkflowStage("forecast");
        setMapSource("forecast");
      },
      onSettled: () => setReplayTargetAt(undefined),
    });
  };
  const changeHorizon = (value: 15 | 30) => {
    setForecastMinutes(value);
    setMapSource("observed");
    setWorkflowStage("observe");
  };
  const runForecast = () =>
    actions.generateAiDecision.mutate({ snapshotId: Number(activeSnapshot.replayStep), horizonMinutes: forecastMinutes }, {
      onSuccess: (forecastSnapshot) => {
        const forecastSourceAt = forecastSnapshot.sourceAt ?? forecastSnapshot.generatedAt;
        setReplaySnapshot(forecastSnapshot);
        setForecastRun({ horizon: forecastMinutes, sourceAt: forecastSourceAt });
        setWorkflowStage("forecast");
        setMapSource("forecast");
        setDrawerOpen(true);
      },
    });

  const optimize = () => {
    const parsedSnapshotId = Number(activeSnapshot.replayStep);
    const snapshotId = Number.isInteger(parsedSnapshotId) ? parsedSnapshotId : 0;
    actions.optimizeAiDecision.mutate(
      { snapshotId, horizonMinutes: planningHorizonFor(displayedHorizon, forecastMinutes) },
      { onSuccess: (proposal) => {
        setWorkflowStage(proposal.moves.length ? "plan" : "no_solution");
        setDrawerOpen(true);
      } },
    );
  };

  const closeDialog = () => {
    if (!pending) setDialog(null);
  };
  const approve = () => {
    if (!plan) return;
    actions.approve.mutate(
      { planId: plan.id, note: "Phê duyệt từ bảng chỉ huy vận hành" },
      { onSuccess: () => { setDialog(null); setWorkflowStage("approved"); } },
    );
  };
  const reject = () => {
    if (!plan || rejectNote.trim().length < 3) return;
    actions.reject.mutate(
      {
        planId: plan.id,
        request: { reasonCode: "other", note: rejectNote.trim() },
      },
      {
        onSuccess: () => {
          setDialog(null);
          setRejectNote("");
          setDrawerOpen(false);
          setWorkflowStage("observe");
        },
      },
    );
  };
  const activate = () => {
    if (!plan || plan.status !== "Approved") return;
    actions.activate.mutate(
      { planId: plan.id, mode: "human" },
      { onSuccess: () => { setDialog(null); setWorkflowStage("campaign"); } },
    );
  };

  return (
    <div className="nf-ops">
      <ScenarioBar
        forecastMinutes={forecastMinutes}
        fleet={activeSnapshot.kpis.fleetAvailable}
        generatedAt={sourceAt}
        modelVersion={activeSnapshot.ai?.modelVersion}
        onForecastChange={changeHorizon}
        onRefresh={() => { setReplaySnapshot(undefined); void snapshot.refetch() }}
        regime={activeSnapshot.regime}
        zoneCount={zones.length}
      />
      <div className="nf-ops-workspace">
        <section className="nf-map-stage" aria-label="Bản đồ vận hành">
          <Suspense fallback={<Skeleton className="h-full" />}>
            <OperatorMap
              forecastMinutes={mapSource === "forecast" ? displayedHorizon : 0}
              flowState={
                activeStage === "executing"
                  ? "executing"
                  : ["executed", "campaign"].includes(activeStage)
                    ? "completed"
                    : "proposal"
              }
              layer={layer}
              moves={planReady && plan ? plan.moves : []}
              onZoneSelect={setSelectedZoneId}
              selectedZoneId={selectedZoneId}
              timeLabel={
                mapSource === "forecast"
                  ? `Dự báo ${forecastTime}`
                  : `Ghi nhận ${replayTime}`
              }
              view={mapView}
              zones={zones}
            />
          </Suspense>
          <MapControls
            forecastEnabled={forecastReady}
            forecastTime={forecastTime}
            layer={layer}
            mapSource={mapSource}
            onLayerChange={setLayer}
            onSourceChange={setMapSource}
            onViewChange={setMapView}
            view={mapView}
          />
          <ZoneFinder
            isOpen={finderOpen}
            onOpenChange={setFinderOpen}
            onSearch={setSearch}
            onSelect={setSelectedZoneId}
            search={search}
            selectedZoneId={selectedZoneId}
            zones={visibleZones}
          />
          {selectedZone && (
            <ZoneCard
              onClose={() => setSelectedZoneId(undefined)}
              zone={selectedZone}
            />
          )}
          <ReplayTimeline
            hasError={actions.runReplayStep.isError}
            isLoading={actions.runReplayStep.isPending}
            onSourceChange={changeReplaySource}
            selectedSourceAt={sourceAt}
            steps={replayWindow.data ?? []}
          />
          {actions.runReplayStep.isError && <div className="nf-replay-error" role="alert">{actions.runReplayStep.error.message}</div>}
          {drawerOpen && activeStage === "forecast" && <ForecastDrawer
            dataSource={activeSnapshot.ai?.dataSource}
            forecastMode={activeSnapshot.ai?.forecastMode}
            forecastTime={forecastTime}
            horizon={displayedHorizon}
            modelVersion={activeSnapshot.ai?.modelVersion}
            onClose={() => setDrawerOpen(false)}
            onZoneSelect={setSelectedZoneId}
            sourceTime={replayTime}
            zones={zones}
          />}
          {drawerOpen && planReady && plan && (["executing", "executed"].includes(activeStage)
            ? <ExecutionDrawer isComplete={activeStage === "executed"} onClose={() => setDrawerOpen(false)} plan={plan} />
            : activeStage === "activation_draft"
              ? <ActivationDraftDrawer onClose={() => setDrawerOpen(false)} plan={plan} />
              : <PlanDrawer
                  error={actions.revise.error}
                  isSaving={actions.revise.isPending}
                  onClose={() => setDrawerOpen(false)}
                  onRevise={(request) => actions.revise.mutate(
                    { planId: plan.id, request },
                    { onSuccess: () => setWorkflowStage("plan") },
                  )}
                  plan={plan}
                />)}
        </section>
        <button
          aria-expanded={railOpen}
          aria-label={railOpen ? "Thu gọn bảng chỉ huy" : "Mở bảng chỉ huy"}
          className="nf-rail-toggle"
          onClick={() => setRailOpen((value) => !value)}
          style={{ right: railOpen ? 404 : 0 }}
          type="button"
        >
          {railOpen ? "›" : "‹"}
        </button>
        <aside
          aria-label="Bảng chỉ huy vận hành"
          className={`nf-command-rail ${railOpen ? "is-open" : ""}`}
        >
          <KpiPanel
            available={available}
            campaign={campaign}
            deficit={deficit}
            hotspots={hotspots}
            plan={planReady ? plan : undefined}
            requests={activeSnapshot.kpis.requests}
            stage={activeStage}
          />
          <Pipeline
            campaign={campaign}
            forecastReady={forecastReady}
            forecastStale={forecastStale}
            isForecasting={actions.generateAiDecision.isPending}
            isOptimizing={actions.optimizeAiDecision.isPending}
            isScanning={actions.runReplayStep.isPending}
            plan={planReady ? plan : undefined}
            onOpenPlan={() => setDrawerOpen(true)}
            replayTargetAt={replayTargetAt}
            stage={activeStage}
          />
          <RailActions
            campaign={campaign}
            forecastReady={forecastReady}
            isGenerating={actions.generateAiDecision.isPending}
            isOptimizing={actions.optimizeAiDecision.isPending}
            isScanning={actions.runReplayStep.isPending}
            onActivate={() => setDialog("release")}
            onApprove={() => setDialog("approve")}
            onGenerate={runForecast}
            onOptimize={optimize}
            onPrepareActivation={() => { setWorkflowStage("activation_draft"); setDrawerOpen(true); }}
            onOpenCampaign={() => navigate(routes.operator.campaigns)}
            onOpenPlan={() => setDrawerOpen(true)}
            onReject={() => setDialog("reject")}
            plan={planReady ? plan : undefined}
            stage={activeStage}
          />
        </aside>
      </div>
      {dialog && plan && (
        <ActionDialog
          dialog={dialog}
          error={
            actions.approve.error?.message ??
            actions.reject.error?.message ??
            actions.activate.error?.message
          }
          onActivate={activate}
          onApprove={approve}
          onClose={closeDialog}
          onReject={reject}
          pending={pending}
          plan={plan}
          rejectNote={rejectNote}
          setRejectNote={setRejectNote}
        />
      )}
    </div>
  );
}

function ScenarioBar({
  fleet,
  forecastMinutes,
  generatedAt,
  modelVersion,
  onForecastChange,
  onRefresh,
  regime,
  zoneCount,
}: {
  fleet: number;
  forecastMinutes: 15 | 30;
  generatedAt: string;
  modelVersion: string | null | undefined;
  onForecastChange: (value: 15 | 30) => void;
  onRefresh: () => void;
  regime: string;
  zoneCount: number;
}) {
  const scenario = scenarioPresentation(regime, generatedAt);
  return (
    <div className="nf-scenario-bar">
      <strong>{scenario.heading}</strong>
      <i />
      <span>
        <CloudRain size={14} /> Thời tiết: {scenario.weather} · dữ liệu AI
      </span>
      <i />
      <span>
        Đội xe vận hành {fleet} xe · {zoneCount}/30 zone
      </span>
      <span className="nf-model">MODEL {modelVersion ?? "CHƯA XÁC ĐỊNH"}</span>
      <small>HORIZON DỰ BÁO</small>
      <div className="seg" role="group" aria-label="Horizon dự báo">
        <label className="seg-opt">
          <input
            checked={forecastMinutes === 15}
            name="hz"
            onChange={() => onForecastChange(15)}
            type="radio"
          />
          15 phút
        </label>
        <label className="seg-opt">
          <input
            checked={forecastMinutes === 30}
            name="hz"
            onChange={() => onForecastChange(30)}
            type="radio"
          />
          30 phút
        </label>
      </div>
      <button className="btn btn-secondary" onClick={onRefresh} type="button">
        Làm mới dữ liệu
      </button>
    </div>
  );
}

function MapControls({
  forecastEnabled,
  forecastTime,
  layer,
  mapSource,
  onLayerChange,
  onSourceChange,
  onViewChange,
  view,
}: {
  forecastEnabled: boolean;
  forecastTime: string;
  layer: MapLayer;
  mapSource: MapSource;
  onLayerChange: (value: MapLayer) => void;
  onSourceChange: (value: MapSource) => void;
  onViewChange: (value: MapView) => void;
  view: MapView;
}) {
  return (
    <div className="nf-map-controls">
      <div className="seg" role="group" aria-label="Lớp bản đồ">
        <label className="seg-opt">
          <input
            checked={layer === "gap"}
            name="layer"
            onChange={() => onLayerChange("gap")}
            type="radio"
          />
          Chênh lệch
        </label>
        <label className="seg-opt">
          <input
            checked={layer === "demand"}
            name="layer"
            onChange={() => onLayerChange("demand")}
            type="radio"
          />
          Nhu cầu
        </label>
        <label className="seg-opt">
          <input
            checked={layer === "supply"}
            name="layer"
            onChange={() => onLayerChange("supply")}
            type="radio"
          />
          Cung xe
        </label>
      </div>
      <div className="seg" role="group" aria-label="Khung nhìn">
        <label className="seg-opt">
          <input
            checked={view === "city"}
            name="view"
            onChange={() => onViewChange("city")}
            type="radio"
          />
          Toàn thành phố
        </label>
        <label className="seg-opt">
          <input
            checked={view === "core"}
            name="view"
            onChange={() => onViewChange("core")}
            type="radio"
          />
          Vùng lõi
        </label>
      </div>
      <div className="seg" role="group" aria-label="Nguồn số liệu">
        <label className="seg-opt">
          <input
            checked={mapSource === "observed"}
            name="source"
            onChange={() => onSourceChange("observed")}
            type="radio"
          />
          Ghi nhận
        </label>
        <label className="seg-opt">
          <input
            checked={mapSource === "forecast"}
            disabled={!forecastEnabled}
            name="source"
            onChange={() => onSourceChange("forecast")}
            type="radio"
          />
          Dự báo {forecastTime}
        </label>
      </div>
    </div>
  );
}

function ZoneFinder({
  isOpen,
  onOpenChange,
  onSearch,
  onSelect,
  search,
  selectedZoneId,
  zones,
}: {
  isOpen: boolean;
  onOpenChange: (value: boolean) => void;
  onSearch: (value: string) => void;
  onSelect: (id: string) => void;
  search: string;
  selectedZoneId: string | undefined;
  zones: readonly Zone[];
}) {
  return (
    <div className={`nf-zone-finder ${isOpen ? "is-open" : ""}`}>
      <header>
        <strong>TÌM KHU VỰC ({zones.length}/30)</strong>
        <button
          aria-expanded={isOpen}
          aria-label={
            isOpen ? "Thu gọn danh sách khu vực" : "Mở danh sách khu vực"
          }
          onClick={() => onOpenChange(!isOpen)}
          type="button"
        >
          {isOpen ? "▾" : "▸"}
        </button>
      </header>
      {isOpen && (
        <>
          <label>
            <Search size={14} />
            <input
              aria-label="Tìm khu vực"
              onChange={(event) => onSearch(event.target.value)}
              placeholder="Nhập tên zone..."
              value={search}
            />
          </label>
          <div className="nf-scroll">
            {zones.map((zone) => {
              const balance = -(zone.operationalGap ?? operationalGapFor(zone));
              const tier =
                zone.aiZoneId <= 7
                  ? "lõi"
                  : zone.aiZoneId <= 13
                    ? "vành"
                    : "ngoại";
              return (
                <button
                  className={selectedZoneId === zone.id ? "is-active" : ""}
                  key={zone.id}
                  onClick={() => onSelect(zone.id)}
                  type="button"
                >
                  <span>
                    <b>{zone.label}</b>
                  </span>
                  <small>{tier}</small>
                  <em className={balance < 0 ? "is-deficit" : "is-surplus"}>
                    {balance > 0 ? "+" : ""}
                    {balance} xe
                  </em>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function ZoneCard({ onClose, zone }: { onClose: () => void; zone: Zone }) {
  const balance = -(zone.operationalGap ?? operationalGapFor(zone));
  return (
    <div className="nf-zone-card">
      <button
        aria-label="Đóng chi tiết khu vực"
        onClick={onClose}
        type="button"
      >
        <X size={14} />
      </button>
      <small>CHI TIẾT KHU VỰC</small>
      <strong>{zone.label}</strong>
      <div>
        <span>
          Cung<b>{zone.supply}</b>
        </span>
        <span>
          Cầu<b>{zone.demand}</b>
        </span>
        <span>
          Chênh lệch
          <b className={balance < 0 ? "bad" : "good"}>
            {balance > 0 ? "+" : ""}
            {balance}
          </b>
        </span>
      </div>
      <p>
        Diện tích: {zone.areaKm2.toLocaleString("vi-VN")} km² · Mưa:{" "}
        {zone.rainMmH.toFixed(2)} mm/h
      </p>
      <p>
        Độ tin cậy AI:{" "}
        {zone.confidence === null ? "N/A" : `${Math.round(zone.confidence)}%`}
      </p>
    </div>
  );
}

function KpiPanel({
  available,
  campaign,
  deficit,
  hotspots,
  plan,
  requests,
  stage,
}: {
  available: number;
  campaign: Campaign | undefined;
  deficit: number;
  hotspots: number;
  plan: Proposal | undefined;
  requests: number;
  stage: OperatorWorkflowStage;
}) {
  const coverage = proposalCoverageForStage(plan, stage);
  return (
    <div className="nf-kpi-panel">
      <div className="nf-rail-title">
        <span>TÌNH HÌNH VẬN HÀNH</span>
        <small>GHI NHẬN MỚI NHẤT</small>
      </div>
      <div className="nf-phases">
        <b className={stage === "observe" ? "is-active" : ""}>Quan sát</b>
        <b className={stage === "forecast" ? "is-active" : ""}>Tính toán</b>
        <b className={["plan", "no_solution", "approved", "activation_draft"].includes(stage) ? "is-active" : ""}>Quyết định</b>
        <b className={["executing", "executed", "campaign"].includes(stage) ? "is-active" : ""}>Thực hiện</b>
      </div>
      <section className="nf-kpi-primary">
        <small>{stage === "observe" ? "THIẾU HỤT GHI NHẬN" : "THIẾU HỤT DỰ BÁO"}</small>
        <strong>
          {deficit}
          <em> xe</em>
        </strong>
        <span>
          {hotspots} khu vực cần chú ý · {requests} yêu cầu
        </span>
      </section>
      <div className="nf-kpi-grid">
        <span>
          <small>XE CÓ THỂ ĐIỀU PHỐI</small>
          <b>{available}</b>
        </span>
        <span>
          <small>{coverage.label}</small>
          <b>{coverage.percent}%</b>
        </span>
        <span>
          <small>CHI PHÍ TỐI ƯU</small>
          <b>
            {plan
              ? formatVnd(plan.estimatedRewardCost)
              : "—"}
          </b>
        </span>
        <span>
          <small>CAMPAIGN</small>
          <b>{campaign?.status ?? "Chưa chạy"}</b>
        </span>
      </div>
    </div>
  );
}

type PipelineState = "done" | "running" | "waiting" | "stale" | "skipped" | "idle";

function Pipeline({
  campaign,
  forecastReady,
  forecastStale,
  isForecasting,
  isOptimizing,
  isScanning,
  onOpenPlan,
  plan,
  replayTargetAt,
  stage,
}: {
  campaign: Campaign | undefined;
  forecastReady: boolean;
  forecastStale: boolean;
  isForecasting: boolean;
  isOptimizing: boolean;
  isScanning: boolean;
  onOpenPlan: () => void;
  plan: Proposal | undefined;
  replayTargetAt: string | undefined;
  stage: OperatorWorkflowStage;
}) {
  const hasPlan = Boolean(plan);
  const approved = stageAtLeast(stage, "approved");
  const active = Boolean(campaign);
  const activationReady = stageAtLeast(stage, "activation_draft");
  const relocationSkipped = Boolean(plan && plan.moves.length === 0 && activationReady);
  const relocationDone = Boolean(plan?.moves.length) && stageAtLeast(stage, "executed");
  const steps = [
    {
      label: "Nạp snapshot vận hành",
      state: (isScanning ? "running" : "done") as PipelineState,
      command: "snapshot.load(zone_registry)",
      result: isScanning
        ? "Đang nạp mốc replay từ bộ Parquet của dự án"
        : "30/30 zone hợp lệ từ nguồn dữ liệu dự án",
    },
    {
      label: "Dự báo cung–cầu",
      state: (isForecasting || isScanning
        ? "running"
        : forecastReady
          ? "done"
          : forecastStale
            ? "stale"
            : "waiting") as PipelineState,
      command: "forecast.run(model=trained_replay)",
      result: isScanning
        ? "Đang chạy LightGBM để dự báo cho 5 phút sau"
        : isForecasting
          ? "Đang chạy model và dải bất định"
        : forecastReady
          ? "Dự báo mới khớp mốc đang xem"
          : forecastStale
            ? "Kết quả thuộc mốc hoặc horizon trước"
            : "Chờ lệnh chạy dự báo",
    },
    {
      label: "Phát hiện hotspot & nguồn dư",
      state: (isOptimizing ? "running" : forecastReady ? "done" : "idle") as PipelineState,
      command: "imbalance.detect(±3/−4 xe)",
      result: forecastReady
        ? "Đã phân loại vùng thiếu, dư và cân bằng"
        : "Cần kết quả dự báo mới",
    },
    {
      label: "Kiểm tra ràng buộc điều phối",
      state: (forecastReady ? "done" : "idle") as PipelineState,
      command: "policy.check()",
      result: forecastReady
        ? "Đã kiểm tra ETA, SOC và đệm giữ lại"
        : "Chờ hotspot và nguồn dư",
    },
    {
      label: "Tạo phương án điều phối",
      state: (isOptimizing
        ? "running"
        : hasPlan
        ? "done"
        : forecastReady
          ? "waiting"
          : "idle") as PipelineState,
      command: "relocation.optimize()",
      result: isOptimizing ? "Model đang áp ràng buộc và ghép nguồn–đích" : hasPlan
        ? plan?.moves.length
          ? `${plan.moves.length} lượt điều chuyển trực tiếp từ kết quả model`
          : "Không có nguồn dư an toàn; cần chuyển sang activation"
        : forecastReady
          ? "Sẵn sàng ghép cặp nguồn–đích"
          : "Cần hotspot và nguồn dư",
    },
    {
      label: "Chờ phê duyệt của điều phối viên",
      state: (relocationSkipped
        ? "skipped"
        : hasPlan && !approved
        ? "waiting"
        : approved
          ? "done"
          : "idle") as PipelineState,
      command: "approval.gate(human_required=true)",
      result: hasPlan
        ? "Agent dừng để chờ quyết định của bạn"
        : "Chưa có phương án để duyệt",
    },
    {
      label: "Phát lệnh & theo dõi thực hiện",
      state: (relocationSkipped ? "skipped" : stage === "executing" ? "running" : relocationDone ? "done" : "idle") as PipelineState,
      command: "dispatch.execute()",
      result: relocationSkipped ? "Không có lệnh điều chuyển cần phát" : stage === "executing"
        ? "Đang phát và theo dõi lệnh điều chuyển"
        : relocationDone ? "Đã hoàn tất bước điều chuyển" : "Chờ phương án được duyệt",
    },
    {
      label: "Tính lại thiếu hụt tồn dư",
      state: (relocationSkipped ? "skipped" : relocationDone ? "done" : "idle") as PipelineState,
      command: "gap.recompute()",
      result: relocationSkipped ? "Giữ nguyên tồn dư từ model" : relocationDone ? "Đã tính lại thiếu hụt sau điều chuyển" : "Cần kết quả thực hiện",
    },
    {
      label: "Đánh giá nhu cầu activation",
      state: (activationReady ? "done" : relocationDone ? "waiting" : "idle") as PipelineState,
      command: "activation.evaluate()",
      result: activationReady ? "Đã tạo bản nháp activation từ tồn dư" : relocationDone ? "Sẵn sàng tính phương án activation" : "Chờ bước tính lại",
    },
    {
      label: "Theo dõi phản hồi tài xế",
      state: (active ? "running" : "idle") as PipelineState,
      command: "offer.track()",
      result: active
        ? "Đang đồng bộ phản hồi"
        : "Chỉ chạy khi campaign hoạt động",
    },
    {
      label: "So sánh kịch bản",
      state: (active ? "done" : "idle") as PipelineState,
      command: "scenario.compare()",
      result: hasPlan ? "Đã có dữ liệu đối chiếu" : "Cần phương án đã tính",
    },
    {
      label: "Ghi nhật ký kiểm toán",
      state: (hasPlan ? "done" : "idle") as PipelineState,
      command: "audit.append()",
      result: hasPlan ? "Đã ghi dấu vết quyết định" : "Chưa có mốc để ghi",
    },
  ] as const;
  const completed = isScanning
    ? 1
    : isForecasting
      ? 2
      : isOptimizing
        ? 5
        : ({ observe: 1, forecast: 4, plan: 6, no_solution: 6, approved: 7, executing: 7, executed: 9, activation_draft: 10, campaign: 12 } satisfies Record<OperatorWorkflowStage, number>)[stage];
  const busy = isScanning || isForecasting || isOptimizing || stage === "executing";
  const agentLabel = busy
    ? "ĐANG XỬ LÝ"
    : forecastStale
      ? "DỮ LIỆU CŨ"
      : active
        ? "THEO DÕI"
        : hasPlan
          ? "CHỜ BẠN"
          : forecastReady
            ? "THEO DÕI"
            : "SẴN SÀNG";
  return (
    <div className="nf-pipeline nf-scroll">
      <div className="nf-pipeline-heading">
        <i className={busy ? "is-live" : ""} />
        <span>AGENT ĐANG CHẠY</span>
        <b className={busy ? "is-processing" : forecastStale ? "is-stale" : ""}>
          {agentLabel}
        </b>
        <em>{completed}/12</em>
      </div>
      {busy && (
        <div className="nf-agent-processing" role="status" aria-live="polite">
          <LoaderCircle size={20} />
          <span>
            <b>{isScanning
              ? "Đang xử lý mốc replay"
              : isForecasting
                ? "Đang chạy dự báo"
                : isOptimizing
                  ? "Đang tối ưu phương án"
                  : "Đang phát và theo dõi lệnh"}</b>
            <small>
              {isScanning && replayTargetAt
                ? `${formatTimeLabel(replayTargetAt)} → dự báo +5 phút · dữ liệu 30 zone`
                : isOptimizing
                  ? "Model đang ghép nguồn–đích theo ràng buộc thật"
                  : stage === "executing"
                    ? "Đang chuyển trạng thái từng lệnh điều chuyển"
                    : "Model đang tính toán cung–cầu cho bản đồ"}
            </small>
          </span>
          <i />
        </div>
      )}
      {steps.map((step, index) => (
        <div className={`nf-pipeline-step is-${step.state}`} key={step.label}>
          <i>
            {step.state === "done" ? (
              <Check size={11} />
            ) : step.state === "waiting" ? (
              <Pause size={10} />
            ) : step.state === "stale" ? (
              "!"
            ) : step.state === "skipped" ? (
              "–"
            ) : step.state === "running" ? (
              "▶"
            ) : (
              <Circle size={8} />
            )}
          </i>
          <span>
            <b>{step.label}</b>
            <small>{pipelineStatusLabel(step.state)}</small>
            <code>{step.command}</code>
            <p>{step.result}</p>
            {step.state === "running" && (
              <span className="nf-pipeline-progress">
                <i />
              </span>
            )}
            {index === 4 && hasPlan && (
              <button onClick={onOpenPlan} type="button">
                Xem phương án →
              </button>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

function pipelineStatusLabel(state: PipelineState) {
  if (state === "done") return "XONG";
  if (state === "running") return "ĐANG CHẠY";
  if (state === "waiting") return "CHỜ BẠN";
  if (state === "stale") return "DỮ LIỆU CŨ";
  if (state === "skipped") return "BỎ QUA";
  return "CHỜ ĐIỀU KIỆN";
}

export function RailActions({
  campaign,
  forecastReady,
  isGenerating,
  isOptimizing,
  isScanning,
  onActivate,
  onApprove,
  onGenerate,
  onOpenCampaign,
  onOpenPlan,
  onOptimize,
  onPrepareActivation,
  onReject,
  plan,
  stage,
}: {
  campaign: Campaign | undefined;
  forecastReady: boolean;
  isGenerating: boolean;
  isOptimizing: boolean;
  isScanning: boolean;
  onActivate: () => void;
  onApprove: () => void;
  onGenerate: () => void;
  onOpenCampaign: () => void;
  onOpenPlan: () => void;
  onOptimize: () => void;
  onPrepareActivation: () => void;
  onReject: () => void;
  plan: Proposal | undefined;
  stage: OperatorWorkflowStage;
}) {
  if (!forecastReady)
    return (
      <div className="nf-rail-actions">
        <button
          className="btn btn-primary btn-block"
          disabled={isGenerating || isScanning}
          onClick={onGenerate}
          type="button"
        >
          {isScanning
            ? "Đang nạp snapshot…"
            : isGenerating
              ? "Đang chạy model…"
              : "Chạy dự báo cung–cầu"}
        </button>
        <small>
          Chạy model cho mốc đang chọn; kết quả dự báo sẽ tự mở trên bản đồ.
        </small>
      </div>
    );
  if (!plan)
    return (
      <div className="nf-rail-actions">
        <button
          className="btn btn-primary btn-block"
          disabled={isOptimizing}
          onClick={onOptimize}
          type="button"
        >
          {isOptimizing ? "Model đang tính phương án…" : "Tính phương án điều chuyển"}
        </button>
        <small>Model ghép nguồn dư với vùng thiếu theo ETA và các ràng buộc vận hành.</small>
      </div>
    );
  if (stage === "no_solution")
    return (
      <div className="nf-rail-actions">
        <button className="btn btn-primary btn-block" onClick={onPrepareActivation} type="button">
          Bỏ điều chuyển, chuyển sang activation
        </button>
        <button className="btn btn-secondary" onClick={onOpenPlan} type="button">Xem nguyên nhân</button>
        <small>Không có nguồn dư thỏa ràng buộc; chưa có offer nào được gửi.</small>
      </div>
    );
  if (stage === "approved")
    if (plan.moves.length === 0)
      return (
        <div className="nf-rail-actions">
          <button className="btn btn-primary btn-block" onClick={onActivate} type="button">Phát hành offer activation</button>
          <button className="btn btn-secondary" onClick={onOpenPlan} type="button">Xem phương án đã duyệt</button>
          <small>Proposal đã được duyệt riêng; bước này mới tạo campaign và gửi offer tới tài xế thật.</small>
        </div>
      );
    else
    return (
      <div className="nf-rail-actions">
        <button className="btn btn-primary btn-block" disabled type="button">Chưa kết nối phát lệnh điều chuyển</button>
        <button className="btn btn-secondary" onClick={onOpenPlan} type="button">Xem phương án đã duyệt</button>
        <small>Không có endpoint dispatch relocation nên hệ thống chưa phát lệnh và không tự đánh dấu hoàn tất.</small>
      </div>
    );
  if (stage === "executing")
    return <div className="nf-rail-actions"><button className="btn btn-primary btn-block" disabled type="button"><LoaderCircle size={15} /> Đang thực hiện điều chuyển…</button></div>;
  if (stage === "executed")
    return (
      <div className="nf-rail-actions">
        <button className="btn btn-primary btn-block" onClick={onPrepareActivation} type="button">Tính phương án activation</button>
        <small>Model dùng thiếu hụt còn lại sau điều chuyển để tính số offer cần thiết.</small>
      </div>
    );
  if (stage === "activation_draft")
    return (
      <div className="nf-rail-actions">
        <button className="btn btn-primary btn-block" onClick={onApprove} type="button">Phê duyệt bản nháp activation</button>
        <button className="btn btn-secondary" onClick={onOpenPlan} type="button">Xem bản nháp activation</button>
        <small>Phê duyệt chưa gửi offer. Sau khi duyệt, bạn phải xác nhận phát hành campaign riêng.</small>
      </div>
    );
  if (plan.policyChecks.some((check) => check.blocking && !check.passed))
    return (
      <div className="nf-rail-actions">
        <button
          className="btn btn-primary btn-block"
          disabled={isGenerating}
          onClick={onGenerate}
          type="button"
        >
          {isGenerating ? "Đang tính lại…" : "Tính lại phương án"}
        </button>
        <button
          className="btn btn-secondary"
          onClick={onOpenPlan}
          type="button"
        >
          Xem nguyên nhân không có lời giải
        </button>
        <small>Không thể phê duyệt khi ràng buộc bắt buộc chưa đạt.</small>
      </div>
    );
  if (campaign)
    return (
      <div className="nf-rail-actions">
        <button
          className="btn btn-primary btn-block"
          onClick={onOpenCampaign}
          type="button"
        >
          Theo dõi thực hiện <ChevronRight size={14} />
        </button>
        <button
          className="btn btn-secondary"
          onClick={onOpenPlan}
          type="button"
        >
          Xem phương án đã duyệt
        </button>
        <small>Phản hồi tài xế được đồng bộ theo thời gian thực.</small>
      </div>
    );
  if (plan.status === "Approved")
    return (
      <div className="nf-rail-actions">
        <button
          className="btn btn-primary btn-block"
          onClick={onActivate}
          type="button"
        >
          Đưa vào thực hiện
        </button>
        <button
          className="btn btn-secondary"
          onClick={onOpenPlan}
          type="button"
        >
          Xem phương án đã duyệt
        </button>
        <small>Phát lệnh là thao tác riêng sau phê duyệt.</small>
      </div>
    );
  return (
    <div className="nf-rail-actions">
      <button
        className="btn btn-primary btn-block"
        onClick={onApprove}
        type="button"
      >
        Phê duyệt phương án
      </button>
      <div>
        <button className="btn btn-secondary" onClick={onReject} type="button">
          Từ chối
        </button>
        <button
          className="btn btn-secondary"
          onClick={onOpenPlan}
          type="button"
        >
          Xem phương án
        </button>
      </div>
      <small>Phê duyệt không phát lệnh và không kích hoạt campaign.</small>
    </div>
  );
}

function ActivationDraftDrawer({ onClose, plan }: { onClose: () => void; plan: Proposal }) {
  const residual = plan.metricsAfterRelocation ?? plan.metrics;
  const expectedAccepted = plan.metricsAfterActivation
    ? Math.max(0, Math.round(residual.residualGap - plan.metricsAfterActivation.residualGap))
    : Math.min(Math.round(residual.residualGap), plan.targetDriverCount);
  const expected = plan.metricsAfterActivation ?? {
    ...residual,
    residualGap: Math.max(0, residual.residualGap - expectedAccepted),
  };
  return (
    <section aria-label="Bản nháp activation" className="nf-plan-drawer">
      <header>
        <div>
          <small>ACTIVATION · BẢN NHÁP</small>
          <strong>Xem lại trước khi phát hành offer</strong>
          <p>Phương án này được tính từ thiếu hụt còn lại sau điều chuyển. Chưa có offer nào được gửi.</p>
        </div>
        <button aria-label="Đóng bản nháp activation" onClick={onClose} type="button"><X size={17} /></button>
      </header>
      <div className="nf-plan-summary">
        <strong>{plan.expectedOfferCount}</strong>
        <span>offer trong pool overbooking<br />mục tiêu {plan.targetDriverCount} tài xế · kỳ vọng bổ sung {expectedAccepted} xe</span>
      </div>
      <div className="nf-plan-metrics">
        <span><small>TỒN DƯ</small><b>{formatNumber(residual.residualGap)} xe</b></span>
        <span><small>CAM KẾT TỐI ĐA</small><b>{formatVnd(plan.expectedOfferCount * plan.relocationBonus)}</b></span>
        <span><small>THỜI HẠN OFFER</small><b>{plan.activationTtlMinutes || 10}′</b></span>
      </div>
      <div className="nf-plan-scroll nf-scroll">
        <h3>TÁC ĐỘNG KỲ VỌNG CỦA MODEL</h3>
        <table className="table"><thead><tr><th>Chỉ số</th><th>Sau điều chuyển</th><th>Sau offer</th></tr></thead>
          <tbody>
            <tr><td>Thiếu hụt</td><td>{formatNumber(residual.residualGap)}</td><td>{formatNumber(expected.residualGap)}</td></tr>
            <tr><td>Tỷ lệ đáp ứng</td><td>{formatNumber(residual.fulfillmentRate)}%</td><td>{formatNumber(expected.fulfillmentRate)}%</td></tr>
          </tbody>
        </table>
        <h3>NGUYÊN TẮC PHÁT HÀNH</h3>
        <p className="nf-activation-plan">Số offer được suy ra từ tồn dư và hệ số overbooking của model; ngân sách là ràng buộc kiểm tra, không phải mục tiêu để dùng hết.</p>
        <h3>VÙNG ƯU TIÊN NHẬN OFFER</h3>
        <p className="nf-activation-plan">{plan.targetZoneLabel || "Các zone còn thiếu hụt theo thứ tự nghiêm trọng của model"}</p>
        <h3>ĐIỀU KIỆN</h3>
        <div className="nf-policy-tags">
          <span className="pass">✓ TTL {plan.activationTtlMinutes || 10} phút</span>
          <span className="pass">✓ Không vượt {formatVnd(plan.activationBudgetLimit ?? plan.expectedOfferCount * plan.relocationBonus)}</span>
          <span className="pass">✓ Chỉ tài xế đủ điều kiện</span>
        </div>
      </div>
    </section>
  );
}

function ActionDialog({
  dialog,
  error,
  onActivate,
  onApprove,
  onClose,
  onReject,
  pending,
  plan,
  rejectNote,
  setRejectNote,
}: {
  dialog: Exclude<DialogKind, null>;
  error: string | undefined;
  onActivate: () => void;
  onApprove: () => void;
  onClose: () => void;
  onReject: () => void;
  pending: boolean;
  plan: Proposal;
  rejectNote: string;
  setRejectNote: (value: string) => void;
}) {
  const isApprove = dialog === "approve";
  const isActivate = dialog === "release";
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div aria-modal="true" className="dialog" role="dialog">
        <div className="dialog-title">
          {isApprove
            ? "Phê duyệt phương án điều phối"
            : isActivate
              ? "Phát hành offer activation"
              : "Từ chối phương án"}
        </div>
        <div className="dialog-body">
          {isApprove
            ? "Phê duyệt xác nhận phương án là hợp lệ. Chưa có lệnh nào được gửi tới tài xế ở bước này."
            : isActivate
              ? `Hệ thống sẽ tạo campaign, gửi tối đa ${plan.expectedOfferCount} offer và dừng khi đạt mục tiêu ${plan.targetDriverCount} tài xế. Đây là bước phát hành riêng sau khi đã xem bản nháp.`
              : "Ghi rõ lý do để lưu vào nhật ký kiểm toán và làm đầu vào cho lần tính tiếp theo."}
        </div>
        {dialog === "reject" ? (
          <label className="field">
            <span>Lý do từ chối</span>
            <textarea
              className="input"
              onChange={(event) => setRejectNote(event.target.value)}
              rows={3}
              value={rejectNote}
            />
          </label>
        ) : (
          <div className="nf-dialog-summary">
            <span><small>{isActivate ? "Tập offer" : "Số lượt"}</small><b>{isActivate ? `${plan.expectedOfferCount} offer` : `${plan.moves.length} lượt`}</b></span>
            <span>
              {isActivate ? "Mục tiêu nhận" : "Xe điều chuyển"}<b>{isActivate ? `${plan.targetDriverCount} tài xế` : `${plan.moves.reduce((sum, move) => sum + move.quantity, 0)} xe`}</b>
            </span>
            <span>
              Chi phí ước tính
              <b>
                {formatVnd(plan.estimatedNetCost || plan.estimatedRewardCost)}
              </b>
            </span>
            <span>
              Thiếu hụt còn lại
              <b>{formatNumber(plan.metrics.residualGap)} xe</b>
            </span>
          </div>
        )}
        {error && <p className="nf-dialog-error">{error}</p>}
        <div className="dialog-actions">
          <button
            className="btn btn-secondary"
            disabled={pending}
            onClick={onClose}
            type="button"
          >
            Huỷ bỏ
          </button>
          <button
            className="btn btn-primary"
            disabled={
              pending || (dialog === "reject" && rejectNote.trim().length < 3)
            }
            onClick={isApprove ? onApprove : isActivate ? onActivate : onReject}
            type="button"
          >
            {pending
              ? "Đang xử lý…"
              : isApprove
                ? "Phê duyệt"
                : isActivate
                  ? "Phát hành offer"
                  : "Từ chối"}
          </button>
        </div>
      </div>
    </div>
  );
}

function addMinutesLabel(generatedAt: string, minutes: number) {
  const time = new Date(generatedAt);
  time.setMinutes(time.getMinutes() + minutes);
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(time);
}

function formatTimeLabel(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

const formatVnd = (value: number) =>
  `${new Intl.NumberFormat("vi-VN").format(Math.max(0, Math.round(value)))}₫`;
