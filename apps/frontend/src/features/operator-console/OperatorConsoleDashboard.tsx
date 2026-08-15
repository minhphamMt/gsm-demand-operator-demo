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
  capabilitiesQuery,
  activeExecutionPlan,
  dispatchStatusPresentation,
  dispatchQuery,
  forecastRunForHorizon,
  hasExactForecastRun,
  hasOperationalObservation,
  getSnapshotFreshness,
  isCampaignOperational,
  latestAgentProposalForSnapshot,
  operationalGapFor,
  plansQuery,
  replayWindowQuery,
  snapshotQuery,
  supportedForecastHorizons,
  useOperatorActions,
  isDispatchExecutionActive,
} from "@/features/operator-data";
import type { Campaign, DispatchBatch, ForecastHorizon, Proposal, Snapshot, Zone } from "@/features/operator-data";
import { projectZonesAtMinute } from "@/features/operator-dashboard/model/forecastProjection";
import { Skeleton } from "@/shared/components/ui/FeedbackStates";
import { routes } from "@/shared/config/routes";
import { formatNumber } from "@/shared/lib/format";
import { ReplayTimeline } from "./ReplayTimeline";
import { ExecutionDrawer } from "./components/ExecutionDrawer";
import { ForecastDrawer } from "./components/ForecastDrawer";
import { ForecastRunStatus } from "./components/ForecastRunStatus";
import { PlanDrawer } from "./components/PlanDrawer";
import { useCurrentReplayAnchor } from "./hooks/useCurrentReplayAnchor";
import { SnapshotStaleAlert } from "@/features/operator-dashboard/components/SnapshotStaleAlert";
import {
  planningHorizonFor,
  stageAtLeast,
  stageHasPlan,
  resolveWorkflowStage,
  type OperatorWorkflowStage,
} from "./model/operatorWorkflow";
import { proposalCoverageForStage } from "./model/proposalCoverage";
import { scenarioPresentation } from "./model/scenarioPresentation";
import "./operator-dashboard.css";

const OperatorMap = lazy(() =>
  import("@/features/operator-map/components/OperatorMap").then(
    ({ OperatorMap: MapComponent }) => ({ default: MapComponent }),
  ),
);
type MapLayer = "gap" | "demand" | "supply";
type MapView = "city" | "core";
type MapSource = "observed" | "forecast";
type DialogKind = "approve" | "release" | "dispatch" | "reject" | null;

export function OperatorConsoleDashboard() {
  const navigate = useNavigate();
  const [forecastMinutes, setForecastMinutes] = useState<ForecastHorizon>(30);
  const [replaySnapshot, setReplaySnapshot] = useState<Snapshot>();
  const [selectedZoneId, setSelectedZoneId] = useState<string>();
  const [search, setSearch] = useState("");
  const [finderOpen, setFinderOpen] = useState(true);
  const [layer, setLayer] = useState<MapLayer>("gap");
  const [mapView, setMapView] = useState<MapView>("city");
  const [mapSource, setMapSource] = useState<MapSource>("observed");
  const [replayTargetAt, setReplayTargetAt] = useState<string>();
  const [forecastRun, setForecastRun] = useState<{
    horizon: ForecastHorizon;
    sourceAt: string;
  } | null>(null);
  const [workflowStage, setWorkflowStage] = useState<OperatorWorkflowStage>("observe");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(true);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [rejectNote, setRejectNote] = useState("");
  const snapshot = useQuery(snapshotQuery("baseline"));
  const capabilities = useQuery(capabilitiesQuery());
  const replayAnchorAt = useCurrentReplayAnchor(
    capabilities.data?.serverTime,
    capabilities.isError,
  );
  const replayWindow = useQuery(replayWindowQuery(replayAnchorAt ?? ""));
  const plans = useQuery(plansQuery());
  const campaigns = useQuery(campaignsQuery());
  const dispatches = useQuery(dispatchQuery());
  const actions = useOperatorActions();
  const lastAutoReplayAtRef = useRef<string | undefined>(undefined);
  const requestedForecastRef = useRef<ForecastHorizon | undefined>(undefined);

  useEffect(() => {
    if (!snapshot.data || !replayAnchorAt || lastAutoReplayAtRef.current === replayAnchorAt) return;
    lastAutoReplayAtRef.current = replayAnchorAt;
    setReplayTargetAt(replayAnchorAt);
    setDrawerOpen(false);
    actions.runReplayStep.mutate(replayAnchorAt, {
      onSuccess: (nextSnapshot) => {
        const nextAt = nextSnapshot.sourceAt ?? nextSnapshot.generatedAt;
        setReplaySnapshot(nextSnapshot);
        setForecastMinutes(5);
        setForecastRun({ horizon: 5, sourceAt: nextAt });
        setWorkflowStage("forecast");
        setMapSource("forecast");
      },
      onSettled: () => setReplayTargetAt(undefined),
    });
  }, [actions.runReplayStep, replayAnchorAt, snapshot.data]);

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
  const execution = activeExecutionPlan(plans.data, campaigns.data, dispatches.data);
  const snapshotPlan = latestAgentProposalForSnapshot(plans.data, activeSnapshot.replayStep);
  const latestPlan = execution?.plan ?? snapshotPlan;
  const linkedCampaign = campaigns.data?.find((item) => item.planId === latestPlan?.id);
  const campaign = execution?.campaign ?? campaigns.data?.find(
    (item) => item.planId === latestPlan?.id && isCampaignOperational(item),
  );
  const linkedDispatch = dispatches.data?.find((item) => item.proposalId === latestPlan?.id);
  const dispatch = execution?.dispatch ?? linkedDispatch;
  // A terminal campaign belongs on the history page only. Its approved proposal
  // must not reappear as an actionable move or be released for a second time.
  const hasTerminalExecution = !execution && (
    (linkedCampaign !== undefined && campaign === undefined)
    || (linkedDispatch !== undefined && !isDispatchExecutionActive(linkedDispatch))
  );
  const plan = hasTerminalExecution ? undefined : latestPlan;
  const dispatchStage = dispatch && isDispatchExecutionActive(dispatch)
    ? 'executing'
    : dispatch?.status === 'EXECUTED' || dispatch?.status === 'PARTIALLY_EXECUTED'
      ? 'executed'
      : workflowStage;
  const activeStage = resolveWorkflowStage(dispatchStage, Boolean(campaign), plan?.status);
  const planReady = stageHasPlan(activeStage);
  const sourceAt = activeSnapshot.sourceAt ?? activeSnapshot.generatedAt;
  const observedZones = activeSnapshot.zones;
  const missingZoneCount = observedZones.filter((zone) => !hasOperationalObservation(zone)).length;
  const dataComplete = missingZoneCount === 0
    && (activeSnapshot.ai === undefined || activeSnapshot.ai.liveZones >= activeSnapshot.ai.registeredZones);
  const snapshotStale = getSnapshotFreshness(activeSnapshot.generatedAt).isStale;
  const horizonCapability = capabilities.data?.capabilities.forecastHorizons;
  const forecastHorizons = supportedForecastHorizons(
    horizonCapability?.available && horizonCapability.enabled
      ? horizonCapability.values
      : undefined,
    activeSnapshot.ai,
  );
  const displayedHorizon = forecastHorizons.includes(forecastMinutes)
    ? forecastMinutes
    : (forecastHorizons[0] ?? forecastMinutes);
  const forecastReady = hasExactForecastRun(activeSnapshot.ai, displayedHorizon);
  const forecastStale = Boolean(forecastRun || activeSnapshot.ai?.forecastRunId) && !forecastReady;
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
  const deficit = zones.filter(hasOperationalObservation).reduce(
    (sum, zone) =>
      sum + Math.max(0, zone.operationalGap ?? operationalGapFor(zone) ?? 0),
    0,
  );
  const available = zones.filter(hasOperationalObservation).reduce(
    (sum, zone) =>
      sum + Math.max(0, -(zone.operationalGap ?? operationalGapFor(zone) ?? 0)),
    0,
  );
  const hotspots = zones.filter(hasOperationalObservation).filter((zone) => {
    const gap = zone.operationalGap ?? operationalGapFor(zone) ?? 0;
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
  const actionPending = pending || actions.releaseDispatch.isPending;

  const changeReplaySource = (nextSourceAt: string) => {
    setReplayTargetAt(nextSourceAt);
    setDrawerOpen(false);
    actions.runReplayStep.mutate(nextSourceAt, {
      onSuccess: (nextSnapshot) => {
        const nextAt = nextSnapshot.sourceAt ?? nextSnapshot.generatedAt;
        setReplaySnapshot(nextSnapshot);
        setForecastMinutes(5);
        setForecastRun({ horizon: 5, sourceAt: nextAt });
        setWorkflowStage("forecast");
        setMapSource("forecast");
      },
      onSettled: () => setReplayTargetAt(undefined),
    });
  };
  const runForecastFor = (horizon: ForecastHorizon) => {
    if (!dataComplete || snapshotStale || actions.generateAiDecision.isPending) return;
    requestedForecastRef.current = horizon;
    actions.generateAiDecision.mutate({ snapshotId: Number(activeSnapshot.replayStep), horizonMinutes: horizon }, {
      onSuccess: (forecastSnapshot) => {
        if (requestedForecastRef.current !== horizon) return;
        const forecastSourceAt = forecastSnapshot.sourceAt ?? forecastSnapshot.generatedAt;
        setReplaySnapshot(forecastSnapshot);
        setForecastMinutes(horizon);
        setForecastRun({ horizon, sourceAt: forecastSourceAt });
        setWorkflowStage("forecast");
        setMapSource("forecast");
        setDrawerOpen(true);
      },
    });
  };
  const changeHorizon = (value: ForecastHorizon) => {
    setForecastMinutes(value);
    if (hasExactForecastRun(activeSnapshot.ai, value)) {
      setMapSource("forecast");
      setWorkflowStage("forecast");
      return;
    }
    setMapSource("observed");
    setWorkflowStage("observe");
    runForecastFor(value);
  };
  const runForecast = () => runForecastFor(forecastMinutes);

  const optimize = () => {
    if (!dataComplete || snapshotStale || execution) return;
    const parsedSnapshotId = Number(activeSnapshot.replayStep);
    const snapshotId = Number.isInteger(parsedSnapshotId) ? parsedSnapshotId : 0;
    actions.optimizeAiDecision.mutate(
      { snapshotId, horizonMinutes: planningHorizonFor(displayedHorizon) },
      { onSuccess: (proposal) => {
        setWorkflowStage(proposal.moves.length ? "plan" : "no_solution");
        setDrawerOpen(true);
      } },
    );
  };

  const closeDialog = () => {
    if (!actionPending) setDialog(null);
  };
  const approve = () => {
    if (!plan) return;
    actions.approve.mutate(
      { planId: plan.id, expectedVersion: plan.version, note: "Phê duyệt từ bảng chỉ huy vận hành" },
      { onSuccess: () => { setDialog(null); setWorkflowStage("approved"); } },
    );
  };
  const reject = () => {
    if (!plan || rejectNote.trim().length < 3) return;
    actions.reject.mutate(
      {
        planId: plan.id,
        request: { expectedVersion: plan.version, reasonCode: "other", note: rejectNote.trim() },
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
  const releaseDispatch = () => {
    if (!plan || plan.status !== "Approved") return;
    actions.releaseDispatch.mutate(plan.id, {
      onSuccess: () => { setDialog(null); setWorkflowStage("executing"); setDrawerOpen(true); },
    });
  };

  return (
    <div className="nf-ops">
      <SnapshotStaleAlert
        generatedAt={activeSnapshot.generatedAt}
        isRefreshing={snapshot.isFetching || actions.runReplayStep.isPending}
        onRefresh={() => {
          void snapshot.refetch();
          if (replayAnchorAt) changeReplaySource(replayAnchorAt);
          else setReplaySnapshot(undefined);
        }}
      />
      <ScenarioBar
        forecastMinutes={displayedHorizon}
        fleet={activeSnapshot.kpis.fleetAvailable}
        generatedAt={sourceAt}
        modelVersion={forecastRunForHorizon(activeSnapshot.ai, displayedHorizon)?.modelVersion ?? activeSnapshot.ai?.modelVersion}
        horizons={forecastHorizons}
        isForecasting={actions.generateAiDecision.isPending}
        onForecastChange={changeHorizon}
        onRefresh={() => {
          void snapshot.refetch();
          if (replayAnchorAt) changeReplaySource(replayAnchorAt);
          else setReplaySnapshot(undefined);
        }}
        regime={activeSnapshot.regime}
        zoneCount={zones.length}
      />
      <div className="nf-ops-workspace">
        <section className="nf-map-stage" aria-label="Bản đồ vận hành">
          <ForecastRunStatus forecast={activeSnapshot.ai} horizon={forecastMinutes} isExact={forecastReady} />
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
            onViewChange={(nextView) => {
              setSelectedZoneId(undefined);
              setMapView(nextView);
            }}
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
          {!dataComplete && <div className="nf-replay-error" role="alert">Snapshot thiếu dữ liệu ở {missingZoneCount} zone. Không thể chạy dự báo hoặc tạo phương án cho đến khi nguồn dữ liệu đầy đủ.</div>}
          {drawerOpen && activeStage === "forecast" && <ForecastDrawer
            dataSource={forecastRunForHorizon(activeSnapshot.ai, displayedHorizon)?.dataSource ?? activeSnapshot.ai?.dataSource}
            forecastMode={forecastRunForHorizon(activeSnapshot.ai, displayedHorizon)?.forecastMode ?? activeSnapshot.ai?.forecastMode}
            forecastTime={forecastTime}
            forecastRun={forecastRunForHorizon(activeSnapshot.ai, displayedHorizon)}
            horizon={displayedHorizon}
            hotspots={activeSnapshot.hotspots}
            modelVersion={forecastRunForHorizon(activeSnapshot.ai, displayedHorizon)?.modelVersion ?? activeSnapshot.ai?.modelVersion}
            onClose={() => setDrawerOpen(false)}
            onZoneSelect={setSelectedZoneId}
            sourceTime={replayTime}
            zones={zones}
          />}
          {drawerOpen && planReady && plan && (["executing", "executed"].includes(activeStage)
            ? <ExecutionDrawer batch={dispatch} isComplete={activeStage === "executed"} onClose={() => setDrawerOpen(false)} onRetryMove={(batchId, moveId) => actions.retryDispatch.mutate({ batchId, moveId, reason: "Operator requested retry after reviewing the failed move." })} plan={plan} />
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
            dispatch={dispatch}
            forecastReady={forecastReady}
            forecastStale={forecastStale}
            isForecasting={actions.generateAiDecision.isPending}
            isOptimizing={actions.optimizeAiDecision.isPending}
            isScanning={actions.runReplayStep.isPending}
            plan={planReady ? plan : undefined}
            onOpenPlan={() => setDrawerOpen(true)}
            onOpenExecution={() => navigate(routes.operator.execution)}
            replayTargetAt={replayTargetAt}
            stage={activeStage}
          />
          <RailActions
            activeDispatch={dispatch}
            campaign={campaign}
            dataComplete={dataComplete}
            forecastReady={forecastReady}
            isGenerating={actions.generateAiDecision.isPending}
            isOptimizing={actions.optimizeAiDecision.isPending}
            isScanning={actions.runReplayStep.isPending}
            dispatchEnabled={capabilities.data?.capabilities.dispatchRelease.enabled ?? false}
            isDispatching={actions.releaseDispatch.isPending}
            hasActiveExecution={execution !== undefined}
            missingZoneCount={missingZoneCount}
            snapshotStale={snapshotStale}
            onActivate={() => setDialog("release")}
            onDispatch={() => setDialog("dispatch")}
            onApprove={() => setDialog("approve")}
            onGenerate={runForecast}
            onOptimize={optimize}
            onPrepareActivation={() => { setWorkflowStage("activation_draft"); setDrawerOpen(true); }}
            onOpenCampaign={() => navigate(routes.operator.campaigns)}
            onOpenExecution={() => navigate(routes.operator.execution)}
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
            ?? actions.releaseDispatch.error?.message
          }
          onActivate={activate}
          onApprove={approve}
          onClose={closeDialog}
          onDispatch={releaseDispatch}
          onReject={reject}
          pending={actionPending}
          plan={plan}
          rejectNote={rejectNote}
          setRejectNote={setRejectNote}
        />
      )}
    </div>
  );
}

export function ScenarioBar({
  fleet,
  forecastMinutes,
  generatedAt,
  horizons,
  isForecasting = false,
  modelVersion,
  onForecastChange,
  onRefresh,
  regime,
  zoneCount,
}: {
  fleet: number;
  forecastMinutes: ForecastHorizon;
  generatedAt: string;
  horizons: readonly ForecastHorizon[];
  isForecasting?: boolean;
  modelVersion: string | null | undefined;
  onForecastChange: (value: ForecastHorizon) => void;
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
        {horizons.map((minute) => (
          <label className="seg-opt" key={minute}>
            <input
              checked={forecastMinutes === minute}
              disabled={isForecasting}
              name="hz"
              onChange={() => onForecastChange(minute)}
              type="radio"
            />
            {minute} phút
          </label>
        ))}
        {horizons.length === 0 && <span role="status">Chưa có mốc dự báo khả dụng</span>}
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
              const balance = hasOperationalObservation(zone)
                ? -(zone.operationalGap ?? operationalGapFor(zone) ?? 0)
                : null;
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
                  <em className={balance === null ? "" : balance < 0 ? "is-deficit" : "is-surplus"}>
                    {balance === null ? "Chưa có dữ liệu" : <>{balance > 0 ? "+" : ""}{balance} xe</>}
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
  const hasObservation = hasOperationalObservation(zone);
  const balance = hasObservation ? -(zone.operationalGap ?? operationalGapFor(zone) ?? 0) : null;
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
          Cung<b>{zone.supply ?? "—"}</b>
        </span>
        <span>
          Cầu<b>{zone.demand ?? "—"}</b>
        </span>
        <span>
          Chênh lệch
          <b className={balance === null ? "" : balance < 0 ? "bad" : "good"}>
            {balance === null ? "—" : <>{balance > 0 ? "+" : ""}{balance}</>}
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
      {!hasObservation && <p>Chưa có quan sát cung–cầu thực tế; zone này không được dùng để tính phương án điều phối.</p>}
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

type PipelineState = "done" | "running" | "waiting" | "queued" | "attention" | "stale" | "skipped" | "idle";

function Pipeline({
  campaign,
  dispatch,
  forecastReady,
  forecastStale,
  isForecasting,
  isOptimizing,
  isScanning,
  onOpenExecution,
  onOpenPlan,
  plan,
  replayTargetAt,
  stage,
}: {
  campaign: Campaign | undefined;
  dispatch: DispatchBatch | undefined;
  forecastReady: boolean;
  forecastStale: boolean;
  isForecasting: boolean;
  isOptimizing: boolean;
  isScanning: boolean;
  onOpenExecution: () => void;
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
  const dispatchState = dispatch ? dispatchStatusPresentation(dispatch) : undefined;
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
      state: (relocationSkipped
        ? "skipped"
        : dispatchState?.isQueued
          ? "queued"
          : dispatchState?.isOverdue
            ? "attention"
          : stage === "executing" && (dispatchState?.isAnimating ?? true)
            ? "running"
            : relocationDone
              ? "done"
              : "idle") as PipelineState,
      command: "dispatch.execute()",
      result: relocationSkipped ? "Không có lệnh điều chuyển cần phát" : dispatchState?.isOverdue
        ? "Đã quá ETA; kiểm tra telemetry hoặc dừng phương án"
        : dispatchState?.isQueued
          ? "Đã lưu lệnh; chờ hệ thống thực thi tiếp nhận"
          : stage === "executing"
        ? "Đang nhận telemetry thực thi"
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
  const completed = steps.filter((step) => step.state === "done" || step.state === "skipped").length;
  const busy = isScanning || isForecasting || isOptimizing || (stage === "executing" && (dispatchState?.isAnimating ?? true));
  const agentLabel = busy
    ? "ĐANG XỬ LÝ"
    : dispatchState?.isOverdue
      ? "CẦN KIỂM TRA"
      : dispatchState?.isQueued
        ? "ĐANG CHỜ"
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
        <span>TIẾN TRÌNH HỆ THỐNG</span>
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
            ) : step.state === "waiting" || step.state === "queued" ? (
              <Pause size={10} />
            ) : step.state === "attention" || step.state === "stale" ? (
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
            {index === 6 && (dispatch || campaign) && (
              <button onClick={onOpenExecution} type="button">
                Mở trang vận hành →
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
  if (state === "queued") return "CHỜ HỆ THỐNG";
  if (state === "attention") return "CẦN KIỂM TRA";
  if (state === "stale") return "DỮ LIỆU CŨ";
  if (state === "skipped") return "BỎ QUA";
  return "CHỜ ĐIỀU KIỆN";
}

export function RailActions({
  activeDispatch = undefined,
  campaign,
  dataComplete = true,
  dispatchEnabled = false,
  forecastReady,
  hasActiveExecution = false,
  isDispatching = false,
  isGenerating,
  isOptimizing,
  isScanning,
  missingZoneCount = 0,
  onActivate,
  onApprove,
  onDispatch,
  onGenerate,
  onOpenCampaign,
  onOpenExecution = () => undefined,
  onOpenPlan,
  onOptimize,
  onPrepareActivation,
  onReject,
  plan,
  snapshotStale = false,
  stage,
}: {
  activeDispatch?: DispatchBatch | undefined;
  campaign: Campaign | undefined;
  dataComplete?: boolean;
  dispatchEnabled?: boolean;
  forecastReady: boolean;
  hasActiveExecution?: boolean;
  isDispatching?: boolean;
  isGenerating: boolean;
  isOptimizing: boolean;
  isScanning: boolean;
  missingZoneCount?: number;
  onActivate: () => void;
  onApprove: () => void;
  onDispatch?: () => void;
  onGenerate: () => void;
  onOpenCampaign: () => void;
  onOpenExecution?: (() => void) | undefined;
  onOpenPlan: () => void;
  onOptimize: () => void;
  onPrepareActivation: () => void;
  onReject: () => void;
  plan: Proposal | undefined;
  snapshotStale?: boolean;
  stage: OperatorWorkflowStage;
}) {
  const dispatchCommand = onDispatch ?? (() => undefined);
  const currentDispatch = activeDispatch ? dispatchStatusPresentation(activeDispatch) : undefined;
  if (snapshotStale)
    return (
      <div className="nf-rail-actions">
        <button className="btn btn-primary btn-block" disabled type="button">Snapshot đã cũ — cần làm mới</button>
        <small>Vẫn có thể xem bản đồ và dữ liệu đã tải, nhưng không thể chạy dự báo hoặc tạo phương án từ snapshot quá hạn.</small>
      </div>
    );
  if (!dataComplete)
    return (
      <div className="nf-rail-actions">
        <button className="btn btn-primary btn-block" disabled type="button">Chờ dữ liệu zone đầy đủ</button>
        <small>Thiếu dữ liệu nguồn ở {missingZoneCount} zone. Hãy làm mới snapshot trước khi chạy dự báo hoặc tạo phương án.</small>
      </div>
    );
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
  if (hasActiveExecution && !plan)
    return (
      <div className="nf-rail-actions">
        <button className="btn btn-primary btn-block" onClick={onOpenExecution} type="button">Mở phương án đang vận hành</button>
        <small>Chỉ được tính và áp dụng phương án tiếp theo sau khi dispatch hoặc campaign hiện tại hoàn thành, thất bại hoặc được hủy.</small>
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
        <button className="btn btn-primary btn-block" disabled={!dispatchEnabled || isDispatching} onClick={dispatchCommand} type="button">{isDispatching ? "Đang phát lệnh…" : dispatchEnabled ? "Đưa vào thực hiện" : "Chưa kết nối phát lệnh điều chuyển"}</button>
        <button className="btn btn-secondary" onClick={onOpenPlan} type="button">Xem phương án đã duyệt</button>
        <small>{dispatchEnabled ? "Bước phát lệnh tách riêng khỏi phê duyệt và dùng đúng revision/hash đã duyệt." : "Capability dispatchRelease đang tắt; hệ thống không tự đánh dấu hoàn tất và phương án đã duyệt vẫn an toàn ở chế độ chỉ đọc."}</small>
      </div>
    );
  if (stage === "executing")
    return <div className="nf-rail-actions"><button className="btn btn-primary btn-block" onClick={onOpenExecution} type="button">{currentDispatch?.isAnimating && <LoaderCircle className="animate-spin" size={15} />}{currentDispatch?.label ?? 'Mở theo dõi thực hiện'}</button><small>Mở trang vận hành để xem từng lệnh, tải lại, thử lại hoặc dừng.</small></div>;
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
  onDispatch,
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
  onDispatch: () => void;
  onReject: () => void;
  pending: boolean;
  plan: Proposal;
  rejectNote: string;
  setRejectNote: (value: string) => void;
}) {
  const isApprove = dialog === "approve";
  const isActivate = dialog === "release";
  const isDispatch = dialog === "dispatch";
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialogElement = dialogRef.current;
    const focusable = () => [...(dialogElement?.querySelectorAll<HTMLElement>('button, textarea, [href], input, select, [tabindex]:not([tabindex="-1"])') ?? [])]
      .filter((element) => !element.hasAttribute('disabled'));
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key !== 'Tab') return;
      const elements = focusable();
      if (!elements.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); previous?.focus(); };
  }, [onClose]);
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div aria-modal="true" className="dialog" ref={dialogRef} role="dialog">
        <div className="dialog-title">
          {isApprove
            ? "Phê duyệt phương án điều phối"
            : isActivate
              ? "Phát hành offer activation"
              : isDispatch
                ? "Đưa phương án vào thực hiện"
              : "Từ chối phương án"}
        </div>
        <div className="dialog-body">
          {isApprove
            ? "Phê duyệt xác nhận phương án là hợp lệ. Chưa có lệnh nào được gửi tới tài xế ở bước này."
            : isActivate
              ? `Hệ thống sẽ tạo campaign, gửi tối đa ${plan.expectedOfferCount} offer và dừng khi đạt mục tiêu ${plan.targetDriverCount} tài xế. Đây là bước phát hành riêng sau khi đã xem bản nháp.`
              : isDispatch
                ? `Hệ thống sẽ phát ${plan.moves.length} lượt điều chuyển theo đúng revision ${plan.version} và hash đã duyệt. Trạng thái supply chỉ thay đổi sau telemetry hợp lệ.`
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
            <span><small>Revision / hash</small><b>v{plan.version} · {(plan.contentHash ?? 'đang xác minh').slice(0, 10)}</b></span>
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
            onClick={isApprove ? onApprove : isActivate ? onActivate : isDispatch ? onDispatch : onReject}
            type="button"
          >
            {pending
              ? "Đang xử lý…"
              : isApprove
                ? "Phê duyệt"
                : isActivate
                  ? "Phát hành offer"
                  : isDispatch
                    ? "Xác nhận thực hiện"
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
