import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  auditActionLabels,
  auditQuery,
  capabilitiesQuery,
  activeExecutionPlan,
  dispatchProgress,
  dispatchMoveLabel,
  dispatchStatusPresentation,
  dispatchQuery,
  driversQuery,
  forecastRunForHorizon,
  hasExactForecastRun,
  hasOperationalObservation,
  getSnapshotFreshness,
  isCampaignOverdue,
  isCampaignOperational,
  latestAgentProposalForSnapshot,
  latestApprovedProposalAwaitingExecution,
  operationalGapFor,
  plansQuery,
  offersQuery,
  replaySnapshotQuery,
  replayWindowQuery,
  snapshotQuery,
  supportedForecastHorizons,
  useOperatorActions,
  isDispatchExecutionActive,
  isProposalReviewable,
} from "@/features/operator-data";
import { operatorQueryKeys } from "@/features/operator-data/api/operatorQueries";
import type { AuditEntry, Campaign, DemoDriver, DispatchBatch, ForecastHorizon, Offer, Proposal, Snapshot, Zone } from "@/features/operator-data";
import { projectZonesAtMinute } from "@/features/operator-dashboard/model/forecastProjection";
import { PipelineModal, type PipelineTabId } from "@/features/operator-pipeline";
import { usePipelineRun } from "@/features/operator-pipeline/hooks/usePipelineRun";
import { useObserverSession } from "@/features/operator-pipeline/hooks/useObserverSession";
import { AgentInteractionLog } from "@/features/operator-console/components/AgentInteractionLog";
import { mergeLogRows } from "@/features/operator-console/model/logRows";
import { auditLogRows } from "@/features/operator-console/model/auditLogRows";
import { useOperatorActionLog } from "@/features/operator-console/hooks/useOperatorActionLog";
import { AiImpactChart } from "./components/AiImpactChart";
import { DemandTrendChart } from "./components/DemandTrendChart";
import { NetworkHealthPanel } from "./components/NetworkHealthPanel";
import { OpsHeader } from "./components/OpsHeader";
import { ZoneBalanceChart } from "./components/ZoneBalanceChart";
import { Skeleton } from "@/shared/components/ui/FeedbackStates";
import { AppError } from "@/shared/api/client";
import { routes } from "@/shared/config/routes";
import { formatNumber } from "@/shared/lib/format";
import { ReplayTimeline } from "./ReplayTimeline";
import { ExecutionDrawer } from "./components/ExecutionDrawer";
import { ForecastDrawer } from "./components/ForecastDrawer";
import { ForecastRunStatus } from "./components/ForecastRunStatus";
import { PlanDrawer } from "./components/PlanDrawer";
import { StopOperationDialog } from "@/features/operator-execution/components/StopOperationDialog";
import { simulatedDispatchDrivers, simulatedDriverMovementLabel, simulatedDriverStateLabels } from "@/features/operator-execution";
import { useCurrentReplayAnchor } from "./hooks/useCurrentReplayAnchor";
import { useServerClock } from "./hooks/useServerClock";
import { SnapshotStaleAlert } from "@/features/operator-dashboard/components/SnapshotStaleAlert";
import {
  planningHorizonFor,
  stageAtLeast,
  stageHasPlan,
  resolveWorkflowStage,
  type OperatorWorkflowStage,
} from "./model/operatorWorkflow";
import { operatorMapFlowState } from "./operatorMapFlowState";
import { proposalCoverageForStage } from "./model/proposalCoverage";
import { scenarioPresentation } from "./model/scenarioPresentation";
import { fleetBalanceSummary } from "./model/fleetBalanceSummary";
import { isSameReplayInstant, observedAtForReplaySource } from "./model/replayClock";
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
type ActiveStopTarget = { id: string; kind: "campaign" | "dispatch" };
type ActiveExecution = NonNullable<ReturnType<typeof activeExecutionPlan>>;

export function OperatorConsoleDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [forecastMinutes, setForecastMinutes] = useState<ForecastHorizon>(5);
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
  const [planningSourceAt, setPlanningSourceAt] = useState<string>();
  const [workflowStage, setWorkflowStage] = useState<OperatorWorkflowStage>("observe");
  const [optimizationStopReason, setOptimizationStopReason] = useState<string>();
  const [autoReplayRetry, setAutoReplayRetry] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(true);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [cancelApprovedOpen, setCancelApprovedOpen] = useState(false);
  const [stopTarget, setStopTarget] = useState<ActiveStopTarget | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const [pipelineTab, setPipelineTab] = useState<PipelineTabId>("agents");
  const snapshot = useQuery(snapshotQuery("baseline", "rain-peak", 0, planningSourceAt === undefined));
  const capabilities = useQuery(capabilitiesQuery());
  const replayAnchorAt = useCurrentReplayAnchor(
    capabilities.data?.serverTime,
    capabilities.isError,
  );
  const serverNow = useServerClock(capabilities.data?.serverTime, capabilities.isError);
  const replayWindow = useQuery(replayWindowQuery(replayAnchorAt ?? ""));
  // Cửa sổ 24 giờ cho biểu đồ xu hướng — tách khỏi cửa sổ 60 phút của thanh thời gian.
  const dayWindow = useQuery(replayWindowQuery(replayAnchorAt ?? "", 1440));
  const plans = useQuery(plansQuery());
  const campaigns = useQuery(campaignsQuery());
  const dispatches = useQuery(dispatchQuery());
  const offers = useQuery(offersQuery());
  const drivers = useQuery(driversQuery());
  const audit = useQuery(auditQuery());
  const actions = useOperatorActions();
  const lastAutoReplayAtRef = useRef<string | undefined>(undefined);
  const autoReplayRetryTimerRef = useRef<number | undefined>(undefined);
  const requestedForecastRef = useRef<ForecastHorizon | undefined>(undefined);

  useEffect(() => {
    if (
      planningSourceAt !== undefined
      || workflowStage !== "observe"
      || !snapshot.data
      || !replayAnchorAt
      || lastAutoReplayAtRef.current === replayAnchorAt
    ) return;
    lastAutoReplayAtRef.current = replayAnchorAt;
    setReplayTargetAt(replayAnchorAt);
    setDrawerOpen(false);
    actions.runReplayStep.mutate(replayAnchorAt, {
      onSuccess: (nextSnapshot) => {
        if (autoReplayRetryTimerRef.current !== undefined) {
          window.clearTimeout(autoReplayRetryTimerRef.current);
          autoReplayRetryTimerRef.current = undefined;
        }
        const normalizedSnapshot = nextSnapshot.sourceAt === replayAnchorAt
          ? nextSnapshot
          : { ...nextSnapshot, sourceAt: replayAnchorAt };
        queryClient.setQueryData(operatorQueryKeys.replaySnapshot(replayAnchorAt), normalizedSnapshot);
        setReplaySnapshot(normalizedSnapshot);
        setForecastRun(null);
        setOptimizationStopReason(undefined);
        setWorkflowStage("observe");
        setMapSource("observed");
      },
      onError: () => {
        lastAutoReplayAtRef.current = undefined;
        if (autoReplayRetryTimerRef.current !== undefined) {
          window.clearTimeout(autoReplayRetryTimerRef.current);
        }
        autoReplayRetryTimerRef.current = window.setTimeout(
          () => setAutoReplayRetry((attempt) => attempt + 1),
          15_000,
        );
      },
      onSettled: () => setReplayTargetAt(undefined),
    });
  }, [actions.runReplayStep, autoReplayRetry, planningSourceAt, queryClient, replayAnchorAt, snapshot.data, workflowStage]);

  useEffect(() => {
    const steps = replayWindow.data ?? [];
    if (!steps.length) return undefined;

    let cancelled = false;
    let cursor = 0;
    const missing = steps.filter((step) =>
      !isSameReplayInstant(step.sourceAt, replayAnchorAt)
      && !queryClient.getQueryData(operatorQueryKeys.replaySnapshot(step.sourceAt)),
    );
    const worker = async () => {
      while (!cancelled) {
        const step = missing[cursor++];
        if (!step) return;
        try {
          await queryClient.fetchQuery(replaySnapshotQuery(step.sourceAt));
        } catch {
          // Preloading is best effort. Selecting the bucket later retries
          // through the visible replay action and reports the real error.
        }
      }
    };
    void Promise.all(Array.from({ length: Math.min(3, missing.length) }, () => worker()));
    return () => { cancelled = true };
  }, [queryClient, replayAnchorAt, replayWindow.data]);

  useEffect(() => () => {
    if (autoReplayRetryTimerRef.current !== undefined) {
      window.clearTimeout(autoReplayRetryTimerRef.current);
    }
  }, []);

  // Vòng đời lượt phân tích nằm ở đây chứ không ở trong `PipelineModal` (MA-Q8): panel được
  // render có điều kiện, nên hook ở trong đó sẽ bị tháo cùng panel và giết lượt chạy.
  //
  // Gọi TRƯỚC ba guard clause bên dưới: hook phải chạy ở mọi lần render, kể cả lần màn hình
  // còn đang tải. Đó cũng là lý do horizon và snapshot đi vào ở `start()` chứ không ở đây —
  // lúc này chúng chưa được tính.
  const pipeline = usePipelineRun();
  // Phiên hỏi–đáp cũng phải nằm trên ba guard clause vì nó là hook. Tham số của từng câu hỏi
  // đi vào ở `ask()`, nên hook không cần biết gì tại thời điểm này.
  const observer = useObserverSession();
  // Thao tác đã bấm cũng vào cùng dòng chảy, nếu không thì log im bặt đúng lúc con người ra
  // quyết định — mắt xích "người duyệt" của mạch ở §1.
  const operatorLog = useOperatorActionLog();

  if (plans.isPending || campaigns.isPending || dispatches.isPending)
    return (
      <div className="nf-console-loading">
        <Skeleton />
      </div>
    );

  const execution = activeExecutionPlan(plans.data, campaigns.data, dispatches.data);
  const hasExecution = Boolean(execution);

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
  const proposalNow = serverNow ? new Date(serverNow) : new Date();
  const approvedPlan = latestApprovedProposalAwaitingExecution(
    plans.data,
    campaigns.data,
    dispatches.data,
    proposalNow,
  );
  const snapshotPlan = latestAgentProposalForSnapshot(plans.data, activeSnapshot.replayStep, proposalNow);
  const latestPlan = execution?.plan ?? approvedPlan ?? snapshotPlan;
  const linkedCampaign = campaigns.data?.find((item) => item.planId === latestPlan?.id);
  const campaign = execution?.campaign ?? campaigns.data?.find(
    (item) => item.planId === latestPlan?.id && isCampaignOperational(item),
  );
  const linkedDispatch = dispatches.data?.find((item) => item.proposalId === latestPlan?.id);
  const dispatch = execution?.dispatch ?? linkedDispatch;
  const keepJustCompletedDispatch = Boolean(
    linkedDispatch
    && !isDispatchExecutionActive(linkedDispatch)
    && ["executing", "executed"].includes(workflowStage),
  );
  // A terminal campaign belongs on the history page only. Its approved proposal
  // must not reappear as an actionable move or be released for a second time.
  const hasTerminalExecution = !execution && (
    (linkedCampaign !== undefined && campaign === undefined)
    || (linkedDispatch !== undefined && !isDispatchExecutionActive(linkedDispatch) && !keepJustCompletedDispatch)
  );
  const plan = hasTerminalExecution ? undefined : latestPlan;
  const canReviewPlan = isProposalReviewable(plan, proposalNow);
  const dispatchStage = dispatch && isDispatchExecutionActive(dispatch)
    ? 'executing'
    : dispatch?.status === 'EXECUTED' || dispatch?.status === 'PARTIALLY_EXECUTED'
      ? 'executed'
      : workflowStage;
  const activeStage = resolveWorkflowStage(dispatchStage, Boolean(campaign), plan?.status);
  const planReady = stageHasPlan(activeStage);
  const sourceAt = activeSnapshot.sourceAt ?? activeSnapshot.generatedAt;
  const isLiveEdge = isSameReplayInstant(sourceAt, planningSourceAt ?? replayAnchorAt);
  // Replay snapshots are immutable source buckets. `generatedAt` is the time
  // the bucket was first stored in our database, not the operating time shown
  // to the operator. Map the selected bucket onto the current replay clock so
  // a successfully refreshed replay is not falsely marked stale forever.
  const displaySourceAt = replayAnchorAt && serverNow
    ? observedAtForReplaySource(sourceAt, replayAnchorAt, serverNow)
    : sourceAt;
  const displayTimeForSource = (replaySourceAt: string) => replayAnchorAt && serverNow
    ? observedAtForReplaySource(replaySourceAt, replayAnchorAt, serverNow)
    : replaySourceAt;
  const observedZones = activeSnapshot.zones;
  const recordedZones = observedZones.map((zone) => {
    const { operationalGap: _forecastRisk, ...recordedZone } = zone;
    return recordedZone;
  });
  const missingZoneCount = observedZones.filter((zone) => !hasOperationalObservation(zone)).length;
  const dataComplete = missingZoneCount === 0
    && (activeSnapshot.ai === undefined || activeSnapshot.ai.liveZones >= activeSnapshot.ai.registeredZones);
  const snapshotStale = getSnapshotFreshness(displaySourceAt).isStale;
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
  const hasRequestedForecast = forecastRun?.horizon === displayedHorizon && forecastRun.sourceAt === sourceAt;
  const forecastReady = Boolean(hasRequestedForecast && hasExactForecastRun(activeSnapshot.ai, displayedHorizon));
  const forecastStale = Boolean(forecastRun) && !forecastReady;
  const displayedMapSource: MapSource = hasExecution ? "observed" : mapSource;
  const zones =
    displayedMapSource === "forecast" && forecastReady
      ? projectZonesAtMinute(
          observedZones,
          displayedHorizon,
          activeSnapshot.regime === "rain_peak",
        )
      : recordedZones;
  const replayTime = formatTimeLabel(displaySourceAt);
  const forecastTime = addMinutesLabel(displaySourceAt, displayedHorizon);
  const selectedZone = recordedZones.find((zone) => zone.id === selectedZoneId);
  const selectedForecastZone = displayedMapSource === "forecast"
    ? zones.find((zone) => zone.id === selectedZoneId)
    : undefined;
  const balance = fleetBalanceSummary(zones);
  const hotspots = zones.filter(hasOperationalObservation).filter((zone) => {
    const gap = zone.operationalGap ?? operationalGapFor(zone) ?? 0;
    return zone.supply < 3 || (zone.demand > 0 && gap / zone.demand >= 0.3);
  }).length;
  const visibleZones = [...recordedZones]
    .filter((zone) =>
      zone.label
        .toLocaleLowerCase("vi")
        .includes(search.toLocaleLowerCase("vi")),
    )
    .sort((a, b) => a.aiZoneId - b.aiZoneId);
  const pending =
    actions.approve.isPending ||
    actions.reject.isPending ||
    actions.activate.isPending ||
    actions.cancelApprovedPlan.isPending;
  const actionPending = pending || actions.releaseDispatch.isPending;

  const refreshAuthoritativePlanState = () => {
    void Promise.all([
      plans.refetch(),
      campaigns.refetch(),
      dispatches.refetch(),
    ]);
  };
  const closeStaleAction = () => {
    setDialog(null);
    setDrawerOpen(false);
    setRejectNote("");
    setPlanningSourceAt(undefined);
    setWorkflowStage("observe");
    refreshAuthoritativePlanState();
  };
  const recoverFromActionConflict = (error: unknown) => {
    if (!(error instanceof AppError) || ![404, 409, 422].includes(error.status ?? 0)) return;
    closeStaleAction();
  };
  const resetActionErrors = () => {
    actions.approve.reset();
    actions.reject.reset();
    actions.activate.reset();
    actions.releaseDispatch.reset();
  };
  const openDialog = (nextDialog: Exclude<DialogKind, null>) => {
    const reviewDialog = nextDialog === "approve" || nextDialog === "reject";
    const executionDialog = nextDialog === "release" || nextDialog === "dispatch";
    if (!plan || (reviewDialog && !canReviewPlan) || (executionDialog && plan.status !== "Approved")) {
      closeStaleAction();
      return;
    }
    resetActionErrors();
    setDialog(nextDialog);
    // Lifecycle jobs and another operator can change a proposal between the
    // list poll and opening this dialog. Refresh without blocking the UI; the
    // dialog guard closes it if the authoritative row changed.
    void plans.refetch();
  };

  const changeReplaySource = (nextSourceAt: string, forceRefresh = false) => {
    setPlanningSourceAt(undefined);
    const cachedSnapshot = queryClient.getQueryData<Snapshot>(operatorQueryKeys.replaySnapshot(nextSourceAt));
    if (cachedSnapshot && !forceRefresh) {
      actions.runReplayStep.reset();
      setReplaySnapshot(cachedSnapshot);
      setForecastRun(null);
      setOptimizationStopReason(undefined);
      setWorkflowStage("observe");
      setMapSource("observed");
      setReplayTargetAt(undefined);
      setDrawerOpen(false);
      return;
    }
    setReplayTargetAt(nextSourceAt);
    setDrawerOpen(false);
    actions.runReplayStep.mutate(nextSourceAt, {
      onSuccess: (nextSnapshot) => {
        const normalizedSnapshot = nextSnapshot.sourceAt === nextSourceAt
          ? nextSnapshot
          : { ...nextSnapshot, sourceAt: nextSourceAt };
        queryClient.setQueryData(operatorQueryKeys.replaySnapshot(nextSourceAt), normalizedSnapshot);
        setReplaySnapshot(normalizedSnapshot);
        setForecastRun(null);
        setOptimizationStopReason(undefined);
        setWorkflowStage("observe");
        setMapSource("observed");
      },
      onSettled: () => setReplayTargetAt(undefined),
    });
  };
  const runForecastFor = (horizon: ForecastHorizon) => {
    if (hasExecution || !isLiveEdge || !dataComplete || snapshotStale || actions.generateAiDecision.isPending) return;
    requestedForecastRef.current = horizon;
    setPlanningSourceAt(sourceAt);
    actions.generateAiDecision.mutate({ snapshotId: Number(activeSnapshot.replayStep), horizonMinutes: horizon }, {
      onError: (cause) => operatorLog.noteFailed("forecast", cause),
      onSuccess: (forecastSnapshot) => {
        operatorLog.noteDone("forecast", `horizon ${horizon} phút`);
        if (requestedForecastRef.current !== horizon) return;
        const forecastSourceAt = forecastSnapshot.sourceAt ?? forecastSnapshot.generatedAt;
        setReplaySnapshot(forecastSnapshot);
        setForecastMinutes(horizon);
        setPlanningSourceAt(forecastSourceAt);
        setForecastRun({ horizon, sourceAt: forecastSourceAt });
        setOptimizationStopReason(undefined);
        setWorkflowStage("forecast");
        setMapSource("forecast");
        setDrawerOpen(true);
      },
    });
  };
  const changeHorizon = (value: ForecastHorizon) => {
    setForecastMinutes(value);
    setMapSource("observed");
    setOptimizationStopReason(undefined);
    setWorkflowStage("observe");
    setDrawerOpen(false);
  };
  const runForecast = () => runForecastFor(forecastMinutes);

  const optimize = () => {
    if (!isLiveEdge || !forecastReady || !dataComplete || snapshotStale || hasExecution) return;
    const parsedSnapshotId = Number(activeSnapshot.replayStep);
    const snapshotId = Number.isInteger(parsedSnapshotId) ? parsedSnapshotId : 0;
    actions.optimizeAiDecision.mutate(
      { snapshotId, horizonMinutes: planningHorizonFor(displayedHorizon) },
      {
        onError: (cause) => operatorLog.noteFailed("optimize", cause),
        onSuccess: (result) => {
        operatorLog.noteDone("optimize");
        if (result.planningStatus === "not_required") {
          setOptimizationStopReason(result.reasonCode);
          setWorkflowStage("not_required");
          setDrawerOpen(true);
          return;
        }
        setOptimizationStopReason(undefined);
        setWorkflowStage(result.proposal.moves.length ? "plan" : "no_solution");
        setDrawerOpen(true);
      } },
    );
  };

  const closeDialog = () => {
    if (!actionPending) {
      resetActionErrors();
      setDialog(null);
    }
  };
  const approve = () => {
    if (!plan || !canReviewPlan) {
      closeStaleAction();
      return;
    }
    actions.approve.mutate(
      { planId: plan.id, expectedVersion: plan.version, note: "Phê duyệt từ bảng chỉ huy vận hành" },
      {
        onError: (cause) => { operatorLog.noteFailed("approve", cause); recoverFromActionConflict(cause); },
        onSuccess: () => {
          operatorLog.noteDone("approve", `${plan.id} (v${plan.version})`);
          setDialog(null);
          setWorkflowStage("approved");
        },
      },
    );
  };
  const reject = () => {
    if (!plan || !canReviewPlan || rejectNote.trim().length < 3) {
      if (plan && !canReviewPlan) closeStaleAction();
      return;
    }
    actions.reject.mutate(
      {
        planId: plan.id,
        request: { expectedVersion: plan.version, reasonCode: "other", note: rejectNote.trim() },
      },
      {
        onError: (cause) => { operatorLog.noteFailed("reject", cause); recoverFromActionConflict(cause); },
        onSuccess: () => {
          operatorLog.noteDone("reject", plan.id);
          setDialog(null);
          setRejectNote("");
          setDrawerOpen(false);
          setPlanningSourceAt(undefined);
          setWorkflowStage("observe");
        },
      },
    );
  };
  const activate = () => {
    if (!plan || plan.status !== "Approved") {
      closeStaleAction();
      return;
    }
    actions.activate.mutate(
      { planId: plan.id, mode: "human" },
      {
        onError: (cause) => { operatorLog.noteFailed("activate", cause); recoverFromActionConflict(cause); },
        onSuccess: () => {
          operatorLog.noteDone("activate", plan.id);
          setDialog(null);
          setPlanningSourceAt(undefined);
          setWorkflowStage("campaign");
        },
      },
    );
  };
  const releaseDispatch = () => {
    if (!plan || plan.status !== "Approved") {
      closeStaleAction();
      return;
    }
    actions.releaseDispatch.mutate(plan.id, {
      onError: (cause) => { operatorLog.noteFailed("release_dispatch", cause); recoverFromActionConflict(cause); },
      onSuccess: () => {
        operatorLog.noteDone("release_dispatch", plan.id);
        setDialog(null);
        setPlanningSourceAt(undefined);
        setWorkflowStage("executing");
        setDrawerOpen(true);
      },
    });
  };
  const cancelApproved = (reason: string) => {
    if (!plan || plan.status !== "Approved") return;
    actions.cancelApprovedPlan.mutate(
      { planId: plan.id, reason },
      {
        onError: (cause) => operatorLog.noteFailed("cancel_plan", cause),
        onSuccess: () => {
          operatorLog.noteDone("cancel_plan", plan.id);
          setCancelApprovedOpen(false);
          setDrawerOpen(false);
          setPlanningSourceAt(undefined);
          setWorkflowStage("observe");
        },
      },
    );
  };
  const stopError = actions.cancelDispatch.error?.message ?? actions.cancelCampaign.error?.message;
  const stopPending = actions.cancelDispatch.isPending || actions.cancelCampaign.isPending;
  const stopActiveExecution = (reason: string) => {
    if (!stopTarget) return;
    const onSuccess = () => {
      operatorLog.noteDone("stop_execution", stopTarget.kind === "dispatch" ? "lệnh điều xe" : "campaign");
      setStopTarget(null);
      setDialog(null);
      setDrawerOpen(false);
      setPlanningSourceAt(undefined);
      setReplaySnapshot(undefined);
      setForecastRun(null);
      setOptimizationStopReason(undefined);
      setMapSource("observed");
      setWorkflowStage("observe");
      lastAutoReplayAtRef.current = undefined;

      // A running operation pins its input snapshot. Once it is stopped, load
      // the live replay bucket again so the map and planning workflow cannot
      // keep showing the cancelled operation's stale input.
      if (replayAnchorAt) {
        changeReplaySource(replayAnchorAt, true);
      } else {
        void snapshot.refetch();
      }
    };
    const onError = (cause: unknown) => operatorLog.noteFailed("stop_execution", cause);
    if (stopTarget.kind === "dispatch") {
      const stopDispatch = () => actions.cancelDispatch.mutate({ batchId: stopTarget.id, reason }, { onError, onSuccess });
      if (execution?.campaign) {
        actions.cancelCampaign.mutate(execution.campaign.id, { onError, onSuccess: stopDispatch });
      } else {
        stopDispatch();
      }
    } else {
      actions.cancelCampaign.mutate(stopTarget.id, { onError, onSuccess });
    }
  };

  // Đầu vào của một lượt chạy, dựng sau ba guard clause nên `activeSnapshot` chắc chắn có.
  // Cả nút "Chạy phân tích" lẫn câu "chạy phân tích" gõ vào nhật ký đều đi qua đúng chỗ này —
  // một đường tạo run, không phải hai.
  const pipelineInput = { horizonMinutes: displayedHorizon, snapshotId: Number(activeSnapshot.replayStep) };
  const startPipelineRun = () => pipeline.start(pipelineInput);

  return (
    // `data-stage` nói cho CSS biết panel `connect` đang mở. Dùng thuộc tính thay vì `:has()`
    // để không phụ thuộc mức hỗ trợ selector của trình duyệt cho một thứ ảnh hưởng cả layout.
    <div className="nf-ops" data-stage={pipelineOpen && pipelineTab === "connect" ? "on" : undefined}>
      <SnapshotStaleAlert
        autoRefresh
        generatedAt={displaySourceAt}
        isRefreshing={snapshot.isFetching || actions.runReplayStep.isPending}
        onRefresh={() => {
          void snapshot.refetch();
          if (replayAnchorAt) changeReplaySource(replayAnchorAt, true);
          else setReplaySnapshot(undefined);
        }}
      />
      <OpsHeader
        isRefreshing={snapshot.isFetching || actions.runReplayStep.isPending}
        onOpenAgentFlow={() => { setPipelineTab("agents"); setPipelineOpen(true); }}
        regimeLabel={scenarioPresentation(activeSnapshot.regime, displaySourceAt).weather}
        serverTimeLabel={serverNow ? formatTimeLabel(serverNow) : undefined}
        stage={activeStage}
        zoneCount={zones.length}
      />
      <ScenarioBar
        forecastMinutes={displayedHorizon}
        fleet={activeSnapshot.kpis.fleetAvailable}
        generatedAt={displaySourceAt}
        modelVersion={forecastRunForHorizon(activeSnapshot.ai, displayedHorizon)?.modelVersion ?? activeSnapshot.ai?.modelVersion}
        horizons={forecastHorizons}
        executionActive={hasExecution}
        isForecasting={actions.generateAiDecision.isPending}
        onForecastChange={changeHorizon}
        onRefresh={() => {
          void snapshot.refetch();
          if (replayAnchorAt) changeReplaySource(replayAnchorAt, true);
          else setReplaySnapshot(undefined);
        }}
        regime={activeSnapshot.regime}
        zoneCount={zones.length}
      />
      <div className="nf-ops-workspace">
        <aside aria-label="Biểu đồ vận hành" className="nf-insight-column">
          <DemandTrendChart steps={dayWindow.data ?? []} />
          <AiImpactChart plan={planReady ? plan : undefined} />
          <section className="nf-insight-chart">
            <div className="nf-rail-title">
              <span>CÂN BẰNG THEO ZONE</span>
              <small>{displayedMapSource === "forecast" ? `DỰ BÁO ${forecastTime}` : `GHI NHẬN ${replayTime}`}</small>
            </div>
            <ZoneBalanceChart onSelect={setSelectedZoneId} zones={zones} />
          </section>
        </aside>
        <section className="nf-map-stage" aria-label="Bản đồ vận hành">
          {!hasExecution && forecastRun
            ? <ForecastRunStatus forecast={activeSnapshot.ai} horizon={forecastMinutes} isExact={forecastReady} />
            : <p className="nf-forecast-run is-ready" role="status">{hasExecution ? "Đang theo dõi phương án đang thực hiện · dự báo đã khóa" : "Dữ liệu ghi nhận · chưa chạy model cho mốc này"}</p>}
          <Suspense fallback={<Skeleton className="h-full" />}>
            <OperatorMap
              forecastMinutes={displayedMapSource === "forecast" ? displayedHorizon : 0}
              flowState={operatorMapFlowState(dispatchStage, activeStage)}
              layer={layer}
              mapStyle="mapbox://styles/mapbox/dark-v11"
              moves={planReady && plan ? plan.moves : []}
              onZoneSelect={setSelectedZoneId}
              selectedZoneId={selectedZoneId}
              timeLabel={
                displayedMapSource === "forecast"
                  ? `Dự báo ${forecastTime}`
                  : `Ghi nhận ${replayTime}`
              }
              vehicleStartedAt={dispatchStage === "executing" ? dispatch?.releasedAt : undefined}
              view={mapView}
              zones={zones}
            />
          </Suspense>
          <MapControls
            forecastEnabled={forecastReady && !hasExecution}
            forecastTime={forecastTime}
            layer={layer}
            mapSource={displayedMapSource}
            onLayerChange={setLayer}
            onSourceChange={setMapSource}
            onViewChange={(nextView) => {
              setSelectedZoneId(undefined);
              setMapView(nextView);
            }}
            view={mapView}
          />
          {execution ? (
            <ExecutionLogPanel
              audit={audit.data}
              drivers={drivers.data}
              execution={execution}
              now={serverNow ? Date.parse(serverNow) : undefined}
              offers={offers.data}
              onRetryMove={(batchId, moveId) => actions.retryDispatch.mutate(
                { batchId, moveId, reason: "Operator requested retry from the operation log." },
                {
                  onError: (cause) => operatorLog.noteFailed("retry_move", cause),
                  onSuccess: () => operatorLog.noteDone("retry_move", moveId),
                },
              )}
            />
          ) : (
            <ZoneFinder
              isOpen={finderOpen}
              observationTime={replayTime}
              onOpenChange={setFinderOpen}
              onSearch={setSearch}
              onSelect={setSelectedZoneId}
              search={search}
              selectedZoneId={selectedZoneId}
              zones={visibleZones}
            />
          )}
          {selectedZone && (
            <ZoneCard
              forecastTime={displayedMapSource === "forecast" ? forecastTime : undefined}
              forecastZone={selectedForecastZone}
              observationTime={replayTime}
              onClose={() => setSelectedZoneId(undefined)}
              zone={selectedZone}
            />
          )}
          <ReplayTimeline
            displayTimeForSource={displayTimeForSource}
            hasError={actions.runReplayStep.isError}
            isLoading={actions.runReplayStep.isPending}
            onSourceChange={changeReplaySource}
            selectedSourceAt={sourceAt}
            steps={replayWindow.data ?? []}
          />
          {actions.runReplayStep.isError && <div className="nf-replay-error" role="alert">{actions.runReplayStep.error.message}</div>}
          {!dataComplete && <div className="nf-replay-error" role="alert">Snapshot thiếu dữ liệu ở {missingZoneCount} zone. Không thể chạy dự báo hoặc tạo phương án cho đến khi nguồn dữ liệu đầy đủ.</div>}
          {drawerOpen && !hasExecution && ["forecast", "not_required"].includes(activeStage) && <ForecastDrawer
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
          {drawerOpen && !hasExecution && planReady && plan && (["executing", "executed"].includes(activeStage)
            ? <ExecutionDrawer batch={dispatch} isComplete={activeStage === "executed"} onClose={() => setDrawerOpen(false)} onRetryMove={(batchId, moveId) => actions.retryDispatch.mutate(
                { batchId, moveId, reason: "Operator requested retry after reviewing the failed move." },
                {
                  onError: (cause) => operatorLog.noteFailed("retry_move", cause),
                  onSuccess: () => operatorLog.noteDone("retry_move", moveId),
                },
              )} plan={plan} />
            : activeStage === "activation_draft"
              ? <ActivationDraftDrawer onClose={() => setDrawerOpen(false)} plan={plan} />
              : <PlanDrawer
                  error={actions.revise.error}
                  isSaving={actions.revise.isPending}
                  onClose={() => setDrawerOpen(false)}
                  onRevise={(request) => actions.revise.mutate(
                    { planId: plan.id, request },
                    {
                      onError: (cause) => operatorLog.noteFailed("revise", cause),
                      onSuccess: () => { operatorLog.noteDone("revise", plan.id); setWorkflowStage("plan"); },
                    },
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
          {/* Sức khỏe mạng lưới nằm ngoài nhánh điều hành: đang chạy phương án là lúc cần
              theo dõi mạng lưới nhất, không phải lúc để nó biến mất khỏi màn hình. */}
          <NetworkHealthPanel snapshot={activeSnapshot} />
          {execution ? (
            <ActiveExecutionRail
              audit={audit.data}
              drivers={drivers.data}
              execution={execution}
              now={serverNow ? Date.parse(serverNow) : undefined}
              offers={offers.data}
              onOpenExecution={() => navigate(routes.operator.execution)}
              onStop={(target) => setStopTarget(target)}
            />
          ) : (
            <>
              <KpiPanel
                balance={balance}
                campaign={campaign}
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
                optimizationStopReason={optimizationStopReason}
                plan={planReady ? plan : undefined}
                onOpenPlan={() => setDrawerOpen(true)}
                onOpenExecution={() => navigate(routes.operator.execution)}
                replayTargetAt={replayTargetAt ? displayTimeForSource(replayTargetAt) : undefined}
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
                optimizationError={actions.optimizeAiDecision.error?.message}
                optimizationStopReason={optimizationStopReason}
                isLiveEdge={isLiveEdge}
                dispatchEnabled={capabilities.data?.capabilities.dispatchRelease.enabled ?? false}
                isDispatching={actions.releaseDispatch.isPending}
                missingZoneCount={missingZoneCount}
                snapshotStale={snapshotStale}
                onActivate={() => openDialog("release")}
                onDispatch={() => openDialog("dispatch")}
                onApprove={() => openDialog("approve")}
                onCancelApproved={() => setCancelApprovedOpen(true)}
                onGenerate={runForecast}
                onOptimize={optimize}
                onPrepareActivation={() => { setWorkflowStage("activation_draft"); setDrawerOpen(true); }}
                onOpenCampaign={() => navigate(routes.operator.campaigns)}
                onOpenExecution={() => navigate(routes.operator.execution)}
                onOpenPlan={() => setDrawerOpen(true)}
                onReject={() => openDialog("reject")}
                plan={planReady ? plan : undefined}
                reviewNow={proposalNow}
                stage={activeStage}
              />
            </>
          )}
        </aside>
      </div>
      {/* NGOÀI cả `nf-ops-workspace` lẫn nhánh `pipelineOpen`. Ngoài nhánh vì đóng panel
          không được giết lượt chạy (MA-Q8); ngoài workspace vì panel `connect` ẩn workspace
          đi, và `display:none` ở tổ tiên xoá luôn con dù con là `position: fixed`. */}
      <AgentInteractionLog
          isBusy={observer.isBusy}
          isRunning={pipeline.run?.status === "RUNNING"}
          onAsk={(text) => observer.ask(text, { ...pipelineInput, onStartRun: startPipelineRun })}
          rows={mergeLogRows(pipeline.events, [
            ...observer.rows,
            ...operatorLog.rows,
            // Bước sau duyệt và phản hồi tài xế, đọc từ audit đã bền hoá ở DB (MA-6.9).
            ...auditLogRows(audit.data ?? [], plan?.id),
          ])}
      />
      {pipelineOpen && (
        <PipelineModal
          horizonMinutes={displayedHorizon}
          isLive={isLiveEdge}
          isStarting={pipeline.isStarting}
          onClose={() => setPipelineOpen(false)}
          onOpenPlan={() => { setPipelineOpen(false); setDrawerOpen(true); }}
          onStart={startPipelineRun}
          onTabChange={setPipelineTab}
          run={pipeline.run}
          runError={pipeline.error}
          snapshot={activeSnapshot}
          snapshotId={Number(activeSnapshot.replayStep)}
          tab={pipelineTab}
        />
      )}
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
      {plan && (
        <StopOperationDialog
          error={actions.cancelApprovedPlan.error?.message}
          isOpen={cancelApprovedOpen}
          isSaving={actions.cancelApprovedPlan.isPending}
          onClose={() => setCancelApprovedOpen(false)}
          onConfirm={cancelApproved}
          title="Hủy phương án đã duyệt?"
        />
      )}
      {execution && (
        <StopOperationDialog
          error={stopError}
          isOpen={stopTarget !== null}
          isSaving={stopPending}
          onClose={() => setStopTarget(null)}
          onConfirm={stopActiveExecution}
          title={stopTarget?.kind === "campaign"
            ? "Hủy offer đang phát hành?"
            : execution?.campaign
              ? "Dừng phương án và hủy offer?"
              : "Dừng phương án đang vận hành?"}
        />
      )}
    </div>
  );
}

export function ScenarioBar({
  executionActive = false,
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
  executionActive?: boolean;
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
        <CloudRain size={14} /> {scenario.weather}
      </span>
      <i />
      <span>
        Đội xe {fleet} · {zoneCount}/30 zone
      </span>
      <span className="nf-model">MODEL {modelVersion ?? "CHƯA XÁC ĐỊNH"}</span>
      {executionActive ? (
        <span className="nf-execution-lock" role="status">ĐANG ĐIỀU HÀNH · DỰ BÁO ĐÃ KHÓA</span>
      ) : (
        <>
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
        </>
      )}
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
          {mapSource === "forecast" ? "Rủi ro p90" : "Chênh lệch ghi nhận"}
        </label>
        <label className="seg-opt">
          <input
            checked={layer === "demand"}
            name="layer"
            onChange={() => onLayerChange("demand")}
            type="radio"
          />
          {mapSource === "forecast" ? "Nhu cầu p50" : "Nhu cầu ghi nhận"}
        </label>
        <label className="seg-opt">
          <input
            checked={layer === "supply"}
            name="layer"
            onChange={() => onLayerChange("supply")}
            type="radio"
          />
          {mapSource === "forecast" ? "Cung p50" : "Cung ghi nhận"}
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

function ExecutionLogPanel({
  audit,
  drivers,
  execution,
  now,
  offers,
  onRetryMove,
}: {
  audit: readonly AuditEntry[] | undefined;
  drivers: readonly DemoDriver[] | undefined;
  execution: ActiveExecution;
  now: number | undefined;
  offers: readonly Offer[] | undefined;
  onRetryMove: (batchId: string, moveId: string) => void;
}) {
  const dispatch = execution.dispatch;
  const progress = dispatch ? dispatchProgress(dispatch) : undefined;
  const dispatchState = dispatch ? dispatchStatusPresentation(dispatch, now) : undefined;
  const campaignOffers = execution.campaign
    ? (offers ?? []).filter((offer) => offer.campaignId === execution.campaign?.id)
    : [];
  const recentEvents = (audit ?? []).filter((entry) => entry.planId === execution.planId).slice(0, 5);
  const driverName = (driverId: string) => drivers?.find((driver) => driver.id === driverId)?.name ?? driverId;
  const sourceMoveFor = (move: NonNullable<typeof dispatch>['moves'][number]) => execution.plan?.moves.find((candidate) => candidate.id === move.sourceMoveKey)
    ?? execution.plan?.moves.find((candidate) => Number(candidate.sourceZoneId.replace(/^AI-Z/i, "")) === move.sourceZoneId && Number(candidate.targetZoneId.replace(/^AI-Z/i, "")) === move.targetZoneId);

  return (
    <section aria-label="Nhật ký phương án đang chạy" className="nf-execution-log-panel">
      <header className="nf-execution-log-header">
        <div>
          <small>BẢNG CHI TIẾT · {dispatch ? `${progress?.totalMoves ?? 0} LƯỢT` : "OFFER"}</small>
          <strong>{dispatchState?.label ?? (execution.campaign ? "Offer đang phát hành" : "Phương án đang chạy")}</strong>
          <p>Cập nhật theo dữ liệu vận hành thực tế.</p>
        </div>
      </header>
      <div className="nf-execution-log-summary">
        {dispatch && progress ? <>
          <span><small>XE ĐÃ TỚI</small><b>{progress.availableUnits}</b></span>
          <span><small>LỆCH KẾ HOẠCH</small><b className="is-risk">{Math.max(0, progress.plannedUnits - progress.availableUnits)}</b></span>
          <span><small>CÒN THEO DÕI</small><b>{progress.activeMoves + progress.waitingMoves}</b></span>
        </> : execution.campaign ? <>
          <span><small>ĐÃ GỬI</small><b>{execution.campaign.offersSent}</b></span>
          <span><small>ĐÃ NHẬN</small><b>{execution.campaign.accepted}</b></span>
          <span><small>ĐÃ ĐẾN</small><b>{execution.campaign.arrivedVerified}</b></span>
        </> : null}
      </div>
      <div className="nf-execution-log-scroll nf-scroll">
        {dispatch && <>
          <h3>VÒNG ĐỜI LỆNH ĐIỀU CHUYỂN</h3>
          {dispatch.moves.map((move) => {
            const sourceMove = sourceMoveFor(move);
            const sourceLabel = sourceMove?.sourceZoneLabel ?? `Vùng ${move.sourceZoneId}`;
            const targetLabel = sourceMove?.targetZoneLabel ?? `Vùng ${move.targetZoneId}`;
            const moveDrivers = simulatedDispatchDrivers(dispatch.id, move);
            const isComplete = move.state === "AVAILABLE";
            const isFailed = move.state === "FAILED";
            return (
              <article className="nf-execution-log-item" key={move.id}>
                <i className={isComplete ? "is-complete" : isFailed ? "is-failed" : "is-active"}>{isComplete ? "✓" : isFailed ? "!" : "·"}</i>
                <div>
                  <b>{sourceLabel} → {targetLabel}</b>
                  <small>{move.plannedUnits} xe · ETA {formatNumber(move.etaMinutes)} phút · {move.distanceKm.toFixed(1)} km</small>
                  {isFailed && <em>{move.failedUnits || move.plannedUnits} xe chưa thể thực hiện</em>}
                </div>
                <strong className={isComplete ? "is-complete" : isFailed ? "is-failed" : "is-active"}>{dispatchMoveLabel(move.state)}</strong>
                <div aria-label={`Tài xế của tuyến ${sourceLabel} đến ${targetLabel}`} className="nf-execution-driver-details">
                  {moveDrivers.map((driver) => (
                    <div className={`is-${driver.state.toLowerCase()}`} key={driver.id}>
                      <span>
                        <b>{driver.name}</b>
                        <small>{driver.vehiclePlate} · {driver.profile}</small>
                      </span>
                      <strong>{simulatedDriverStateLabels[driver.state]}</strong>
                      <p>{simulatedDriverMovementLabel(driver, move, sourceLabel, targetLabel)}</p>
                    </div>
                  ))}
                </div>
                {isFailed && <button className="btn btn-secondary" onClick={() => onRetryMove(dispatch.id, move.id)} type="button">Thử lại</button>}
              </article>
            );
          })}
        </>}
        {execution.campaign && <>
          <h3>HOẠT ĐỘNG OFFER</h3>
          {campaignOffers.length === 0 && <p className="nf-execution-log-empty">Đang tải danh sách offer...</p>}
          {campaignOffers.slice(0, 8).map((offer) => (
            <article className="nf-execution-log-item" key={offer.id}>
              <i className={offer.status === "Accepted" ? "is-complete" : offer.status === "Open" ? "is-active" : "is-failed"}>{offer.status === "Accepted" ? "✓" : offer.status === "Open" ? "·" : "!"}</i>
              <div><b>{driverName(offer.driverId)}</b><small>{offer.targetZoneId} · ETA {offer.etaMinutes} phút · {formatTimeLabel(offer.respondedAt ?? offer.expiresAt)}</small></div>
              <strong className={offer.status === "Accepted" ? "is-complete" : offer.status === "Open" ? "is-active" : "is-failed"}>{offer.status === "Open" ? "Đang chờ" : offer.status === "Accepted" ? "Đã nhận" : offer.status === "Cancelled" ? "Đã hủy" : offer.status === "Expired" ? "Hết hạn" : "Từ chối"}</strong>
            </article>
          ))}
        </>}
        {recentEvents.length > 0 && <>
          <h3>NHẬT KÝ HỆ THỐNG</h3>
          {recentEvents.map((entry) => <div className="nf-execution-log-event" key={entry.id}><i /> <span><b>{auditActionLabels[entry.action]}</b><small>{entry.detail}</small></span><time>{formatTimeLabel(entry.occurredAt)}</time></div>)}
        </>}
      </div>
    </section>
  );
}

function ZoneFinder({
  isOpen,
  observationTime,
  onOpenChange,
  onSearch,
  onSelect,
  search,
  selectedZoneId,
  zones,
}: {
  isOpen: boolean;
  observationTime: string;
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
          <small className="nf-zone-finder-basis">Cung, cầu và chênh lệch ghi nhận lúc {observationTime}</small>
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
              const balance = hasOperationalObservation(zone) ? zone.supply - zone.demand : null;
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

export function ZoneCard({
  forecastTime,
  forecastZone,
  observationTime,
  onClose,
  zone,
}: {
  forecastTime?: string | undefined;
  forecastZone?: Zone | undefined;
  observationTime?: string | undefined;
  onClose: () => void;
  zone: Zone;
}) {
  const hasObservation = hasOperationalObservation(zone);
  const balance = hasObservation ? zone.supply - zone.demand : null;
  const forecastObservation = forecastZone && hasOperationalObservation(forecastZone)
    ? forecastZone
    : null;
  const forecastBalance = forecastObservation
    ? forecastObservation.supply - forecastObservation.demand
    : null;
  const conservativeDeficit = forecastObservation
    ? Math.max(0, forecastObservation.operationalGap ?? operationalGapFor(forecastObservation) ?? 0)
    : null;
  const confidence = forecastObservation?.confidence ?? zone.confidence;
  return (
    <div className="nf-zone-card">
      <button
        aria-label="Đóng chi tiết khu vực"
        onClick={onClose}
        type="button"
      >
        <X size={14} />
      </button>
      <small>DỮ LIỆU GHI NHẬN{observationTime ? ` · ${observationTime}` : ""}</small>
      <strong>{zone.label}</strong>
      <div>
        <span>
          Cung ghi nhận<b>{zone.supply ?? "—"}</b>
        </span>
        <span>
          Cầu ghi nhận<b>{zone.demand ?? "—"}</b>
        </span>
        <span>
          Chênh lệch ghi nhận
          <b className={balance === null ? "" : balance < 0 ? "bad" : "good"}>
            {balance === null ? "—" : <>{balance > 0 ? "+" : ""}{balance}</>}
          </b>
        </span>
      </div>
      <p>
        Diện tích: {zone.areaKm2.toLocaleString("vi-VN")} km² · Mưa:{" "}
        {zone.rainMmH.toFixed(2)} mm/h
      </p>
      {forecastObservation && <div className="nf-zone-forecast">
        <small>DỰ BÁO{forecastTime ? ` · ${forecastTime}` : ""}</small>
        <span>p50: cung {forecastObservation.supply} · cầu {forecastObservation.demand} · chênh lệch {forecastBalance !== null && forecastBalance > 0 ? "+" : ""}{forecastBalance}</span>
        <b className={conservativeDeficit !== null && conservativeDeficit >= 3 ? "is-risk" : ""}>Rủi ro p90: {conservativeDeficit !== null && conservativeDeficit > 0 ? `thiếu ${conservativeDeficit} xe` : "không thiếu"}</b>
        <em>Màu bản đồ ở chế độ dự báo lấy theo rủi ro p90.</em>
      </div>}
      <p>
        Độ tin cậy AI:{" "}
        {confidence === null ? "N/A" : `${Math.round(confidence)}%`}
      </p>
      {!hasObservation && <p>Chưa có quan sát cung–cầu thực tế; zone này không được dùng để tính phương án điều phối.</p>}
    </div>
  );
}

function KpiPanel({
  balance,
  campaign,
  hotspots,
  plan,
  requests,
  stage,
}: {
  balance: ReturnType<typeof fleetBalanceSummary>;
  campaign: Campaign | undefined;
  hotspots: number;
  plan: Proposal | undefined;
  requests: number;
  stage: OperatorWorkflowStage;
}) {
  const coverage = proposalCoverageForStage(plan, stage);
  const modelSelectedSupply = plan?.moves.reduce((sum, move) => sum + move.quantity, 0) ?? 0;
  const modelAvailableSupply = plan?.candidateSourceZones.reduce((sum, source) => sum + source.availableSupply, 0) ?? 0;
  const safeDispatchable = modelSelectedSupply > 0 ? modelSelectedSupply : balance.safeDispatchable;
  const safeCapacity = modelAvailableSupply > 0 ? modelAvailableSupply : balance.safeDispatchable;
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
        <small>{stage === "observe" ? "THIẾU HỤT GHI NHẬN" : "MẤT CÂN BẰNG DỰ BÁO P50"}</small>
        <strong>
          {balance.medianDeficit}
          <em> xe</em>
        </strong>
        <span>
          {balance.riskBuffer > 0 ? `+${balance.riskBuffer} xe đệm rủi ro · ` : ''}{hotspots} hotspot chính sách · {requests} yêu cầu
        </span>
      </section>
      <div className="nf-kpi-grid">
        <span title={`${safeDispatchable} xe đã phân bổ trên ${safeCapacity} xe nguyên chiếc vượt toàn bộ ràng buộc nguồn`}>
          <small>NGUỒN RÚT AN TOÀN</small>
          <b>{safeDispatchable}<em> / {safeCapacity} xe khả dụng</em></b>
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
  optimizationStopReason,
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
  optimizationStopReason?: string | undefined;
  onOpenExecution: () => void;
  onOpenPlan: () => void;
  plan: Proposal | undefined;
  replayTargetAt: string | undefined;
  stage: OperatorWorkflowStage;
}) {
  const hasPlan = Boolean(plan);
  const planningNotRequired = stage === "not_required";
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
        ? "Đang đọc mốc dữ liệu ghi nhận"
        : "30/30 zone hợp lệ từ nguồn dữ liệu dự án",
    },
    {
      label: "Dự báo cung–cầu",
      state: (isForecasting
        ? "running"
        : forecastReady
          ? "done"
          : forecastStale
            ? "stale"
            : "waiting") as PipelineState,
      command: "forecast.run(model=trained_replay)",
      result: isForecasting
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
        ? planningNotRequired
          ? "0 hotspot chính sách; vùng thiếu p90 chỉ được giữ ở mức cảnh báo"
          : "Đã phân loại vùng thiếu, dư và cân bằng"
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
        : planningNotRequired
          ? "skipped"
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
        : planningNotRequired
          ? `Dừng đúng chính sách: không tạo proposal (${optimizationStopReason ?? "NO_ACTION_REQUIRED"})`
        : forecastReady
          ? "Sẵn sàng ghép cặp nguồn–đích"
          : "Cần hotspot và nguồn dư",
    },
    {
      label: "Chờ phê duyệt của điều phối viên",
      state: (relocationSkipped
        ? "skipped"
        : planningNotRequired
          ? "skipped"
        : hasPlan && !approved
        ? "waiting"
        : approved
          ? "done"
          : "idle") as PipelineState,
      command: "approval.gate(human_required=true)",
      result: hasPlan
        ? "Agent dừng để chờ quyết định của bạn"
        : planningNotRequired
          ? "Không có phương án nên không cần phê duyệt"
        : "Chưa có phương án để duyệt",
    },
    {
      label: "Phát lệnh & theo dõi thực hiện",
      state: (planningNotRequired
        ? "skipped"
        : relocationSkipped
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
      result: planningNotRequired ? "Không phát lệnh vì không có hotspot chính sách" : relocationSkipped ? "Không có lệnh điều chuyển cần phát" : dispatchState?.isOverdue
        ? "Đã quá ETA; kiểm tra telemetry hoặc dừng phương án"
        : dispatchState?.isQueued
          ? "Đã lưu lệnh; chờ hệ thống thực thi tiếp nhận"
          : stage === "executing"
        ? "Đang nhận telemetry thực thi"
        : relocationDone ? "Đã hoàn tất bước điều chuyển" : "Chờ phương án được duyệt",
    },
    {
      label: "Tính lại thiếu hụt tồn dư",
      state: (planningNotRequired || relocationSkipped ? "skipped" : relocationDone ? "done" : "idle") as PipelineState,
      command: "gap.recompute()",
      result: planningNotRequired ? "Không có điều chuyển để tính lại" : relocationSkipped ? "Giữ nguyên tồn dư từ model" : relocationDone ? "Đã tính lại thiếu hụt sau điều chuyển" : "Cần kết quả thực hiện",
    },
    {
      label: "Đánh giá nhu cầu activation",
      state: (planningNotRequired ? "skipped" : activationReady ? "done" : relocationDone ? "waiting" : "idle") as PipelineState,
      command: "activation.evaluate()",
      result: planningNotRequired ? "Không mở activation khi chưa có hotspot chính sách" : activationReady ? "Đã tạo bản nháp activation từ tồn dư" : relocationDone ? "Sẵn sàng tính phương án activation" : "Chờ bước tính lại",
    },
    {
      label: "Theo dõi phản hồi tài xế",
      state: (planningNotRequired ? "skipped" : active ? "running" : "idle") as PipelineState,
      command: "offer.track()",
      result: planningNotRequired
        ? "Không có campaign cần theo dõi"
        : active
        ? "Đang đồng bộ phản hồi"
        : "Chỉ chạy khi campaign hoạt động",
    },
    {
      label: "So sánh kịch bản",
      state: (planningNotRequired ? "skipped" : active ? "done" : "idle") as PipelineState,
      command: "scenario.compare()",
      result: planningNotRequired ? "Không có phương án hành động để đối chiếu" : hasPlan ? "Đã có dữ liệu đối chiếu" : "Cần phương án đã tính",
    },
    {
      label: "Ghi nhật ký kiểm toán",
      state: (planningNotRequired ? "done" : hasPlan ? "done" : "idle") as PipelineState,
      command: "audit.append()",
      result: planningNotRequired ? "Đã lưu kết quả không cần hành động" : hasPlan ? "Đã ghi dấu vết quyết định" : "Chưa có mốc để ghi",
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
        : planningNotRequired
          ? "HOÀN TẤT"
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
                ? `${formatTimeLabel(replayTargetAt)} · đang đọc dữ liệu 30 zone, không chạy model`
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

function ActiveExecutionRail({
  audit,
  drivers,
  execution,
  now,
  offers,
  onOpenExecution,
  onStop,
}: {
  audit: readonly AuditEntry[] | undefined;
  drivers: readonly DemoDriver[] | undefined;
  execution: ActiveExecution;
  now: number | undefined;
  offers: readonly Offer[] | undefined;
  onOpenExecution: () => void;
  onStop: (target: ActiveStopTarget) => void;
}) {
  const dispatchState = execution.dispatch
    ? dispatchStatusPresentation(execution.dispatch, now)
    : undefined;
  const progress = execution.dispatch ? dispatchProgress(execution.dispatch) : undefined;
  const campaignOverdue = execution.campaign ? isCampaignOverdue(execution.campaign, now) : false;
  const isOverdue = Boolean(dispatchState?.isOverdue || campaignOverdue);
  const stopTarget = execution.dispatch && dispatchState?.canCancel
    ? { id: execution.dispatch.id, kind: "dispatch" as const }
    : execution.campaign
      ? { id: execution.campaign.id, kind: "campaign" as const }
      : undefined;
  const title = execution.plan?.title ?? "Phương án đang vận hành";
  const statusLabel = dispatchState?.label ?? (execution.campaign ? "Đang kích hoạt" : "Đang thực hiện");
  const campaignOffers = execution.campaign
    ? (offers ?? []).filter((offer) => offer.campaignId === execution.campaign?.id)
    : [];
  const recentEvents = (audit ?? [])
    .filter((entry) => entry.planId === execution.planId)
    .slice(0, 5);
  const driverName = (driverId: string) => drivers?.find((driver) => driver.id === driverId)?.name ?? driverId;
  const openOffers = campaignOffers.filter((offer) => offer.status === "Open").length;
  const cancelledOffers = campaignOffers.filter((offer) => offer.status === "Cancelled").length;
  const expiredOffers = campaignOffers.filter((offer) => offer.status === "Expired").length;
  const overdueTitle = dispatchState?.isOverdue
    ? "Phương án đã quá ETA"
    : "Offer đã quá thời hạn";
  const overdueDetail = dispatchState?.isOverdue
    ? `${(progress?.activeMoves ?? 0) + (progress?.waitingMoves ?? 0)} lệnh chưa hoàn tất. Cần kiểm tra hoặc hủy ngay.`
    : `Campaign chưa hoàn tất nhưng đã quá hạn ${execution.campaign ? formatTimeLabel(execution.campaign.expiresAt) : "thời gian quy định"}.`;

  return (
    <section aria-label="Phương án đang chạy" className="nf-active-rail">
      <header className="nf-active-rail-header">
        <div>
          <small>PHƯƠNG ÁN ĐANG CHẠY</small>
          <strong>{title}</strong>
        </div>
        <span className="nf-active-rail-badge">KHÓA DỰ BÁO</span>
      </header>
      <div className={`nf-active-rail-status${isOverdue ? " is-overdue" : ""}`}>
        <i />
        <strong>{statusLabel}</strong>
        <small>{execution.plan ? `Revision v${execution.plan.version}` : execution.planId.slice(0, 12)}</small>
      </div>
      {isOverdue && (
        <div aria-live="assertive" className="nf-active-rail-overdue" role="alert">
          <b>{overdueTitle}</b>
          <span>{overdueDetail}</span>
          {stopTarget && <button className="btn btn-danger btn-block" onClick={() => onStop(stopTarget)} type="button">Hủy ngay</button>}
        </div>
      )}
      <div className="nf-active-rail-summary">
        {progress ? (
          <span>
            <small>TIẾN ĐỘ LỆNH</small>
            <b>{progress.finishedMoves}/{progress.totalMoves}</b>
            <em>{progress.activeMoves} đang đi · {progress.waitingMoves} chờ</em>
          </span>
        ) : execution.campaign ? (
          <span>
            <small>PHẢN HỒI OFFER</small>
            <b>{execution.campaign.accepted}/{execution.campaign.offersSent}</b>
            <em>{execution.campaign.viewed} đã xem</em>
          </span>
        ) : null}
        <span>
          <small>PHƯƠNG ÁN</small>
          <b>{execution.plan?.moves.length ?? "—"}</b>
          <em>{execution.plan?.moves.length === 1 ? "lệnh điều phối" : "lệnh điều phối"}</em>
        </span>
      </div>
      {execution.dispatch && (
        <div className="nf-active-rail-moves">
          <small>LỆNH ĐANG THEO DÕI</small>
          {execution.dispatch.moves.slice(0, 4).map((move) => (
            <div key={move.id}>
              <span>{move.sourceZoneId} → {move.targetZoneId}</span>
              <b>{move.plannedUnits} xe</b>
            </div>
          ))}
          {execution.dispatch.moves.length > 4 && <em>+{execution.dispatch.moves.length - 4} lệnh khác</em>}
        </div>
      )}
      {execution.campaign && (
        <div className="nf-active-rail-campaign">
          <small>CHIẾN DỊCH ĐANG PHẢN HỒI</small>
          <div className="nf-active-rail-offer-grid">
            <span><b>{openOffers}</b><small>đang chờ</small></span>
            <span><b>{execution.campaign.accepted}</b><small>đã nhận</small></span>
            <span><b>{execution.campaign.arrivedVerified}</b><small>xe đã đến</small></span>
            <span><b>{cancelledOffers + expiredOffers}</b><small>đã hủy / hết hạn</small></span>
          </div>
          <p>{execution.campaign.offersSent} offer đã gửi · hạn {formatTimeLabel(execution.campaign.expiresAt)}</p>
        </div>
      )}
      {execution.campaign && campaignOffers.length > 0 && (
        <div className="nf-active-rail-offers">
          <div className="nf-active-rail-section-heading"><small>OFFER MỚI NHẤT</small><b>{campaignOffers.length}</b></div>
          {campaignOffers.slice(0, 4).map((offer) => (
            <div className="nf-active-rail-offer" key={offer.id}>
              <span>{driverName(offer.driverId)}</span>
              <b className={`is-${offer.status.toLowerCase()}`}>{offer.status === "Open" ? "Đang chờ" : offer.status === "Accepted" ? "Đã nhận" : offer.status === "Cancelled" ? "Đã hủy" : offer.status === "Expired" ? "Hết hạn" : "Từ chối"}</b>
            </div>
          ))}
        </div>
      )}
      {recentEvents.length > 0 && (
        <div className="nf-active-rail-events">
          <div className="nf-active-rail-section-heading"><small>NHẬT KÝ MỚI NHẤT</small><b>{recentEvents.length}</b></div>
          {recentEvents.map((entry) => (
            <div className="nf-active-rail-event" key={entry.id}>
              <i />
              <span><b>{auditActionLabels[entry.action]}</b><small>{entry.detail}</small></span>
              <time>{formatTimeLabel(entry.occurredAt)}</time>
            </div>
          ))}
        </div>
      )}
      <div className="nf-active-rail-actions">
        <button className="btn btn-primary btn-block" onClick={onOpenExecution} type="button">
          Mở chi tiết phương án
        </button>
        {execution.campaign && (
          <button className="btn btn-danger btn-block" onClick={() => onStop({ id: execution.campaign!.id, kind: "campaign" })} type="button">
            {execution.dispatch ? "Hủy offer (giữ điều chuyển)" : "Hủy offer đang phát hành"}
          </button>
        )}
        {stopTarget && (!execution.campaign || stopTarget.kind !== "campaign") && (
          <button className="btn btn-secondary btn-block" onClick={() => onStop(stopTarget)} type="button">
            {execution.campaign ? "Dừng phương án & hủy offer" : "Dừng phương án đang chạy"}
          </button>
        )}
        <p>Dự báo và tính phương án mới sẽ mở lại sau khi phương án này hoàn tất hoặc được dừng.</p>
      </div>
    </section>
  );
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
  isLiveEdge = true,
  missingZoneCount = 0,
  optimizationError,
  optimizationStopReason,
  onActivate,
  onApprove,
  onCancelApproved,
  onDispatch,
  onGenerate,
  onOpenCampaign,
  onOpenExecution = () => undefined,
  onOpenPlan,
  onOptimize,
  onPrepareActivation,
  onReject,
  plan,
  reviewNow = new Date(),
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
  isLiveEdge?: boolean;
  missingZoneCount?: number;
  optimizationError?: string | undefined;
  optimizationStopReason?: string | undefined;
  onActivate: () => void;
  onApprove: () => void;
  onCancelApproved?: () => void;
  onDispatch?: () => void;
  onGenerate: () => void;
  onOpenCampaign: () => void;
  onOpenExecution?: (() => void) | undefined;
  onOpenPlan: () => void;
  onOptimize: () => void;
  onPrepareActivation: () => void;
  onReject: () => void;
  plan: Proposal | undefined;
  reviewNow?: Date;
  snapshotStale?: boolean;
  stage: OperatorWorkflowStage;
}) {
  const dispatchCommand = onDispatch ?? (() => undefined);
  const cancelApproved = onCancelApproved ?? (() => undefined);
  const currentDispatch = activeDispatch ? dispatchStatusPresentation(activeDispatch) : undefined;
  const reviewable = plan ? isProposalReviewable(plan, reviewNow) : false;
  const noOperationalPlan = optimizationStopReason === "NO_SOLUTION"
    || optimizationStopReason === "NO_VALID_OPERATIONAL_PLAN";
  if (hasActiveExecution)
    return (
      <div className="nf-rail-actions">
        <button className="btn btn-primary btn-block" onClick={onOpenExecution} type="button">
          Mở phương án đang vận hành
        </button>
        <small>Đang có phương án thực hiện. Hãy theo dõi hoặc hủy tại trang điều hành trước khi chạy dự báo mới.</small>
      </div>
    );
  if (!isLiveEdge)
    return (
      <div className="nf-rail-actions">
        <button className="btn btn-primary btn-block" disabled type="button">Đang xem dữ liệu quá khứ</button>
        <small>Replay chỉ đọc dữ liệu đã ghi nhận. Quay về mốc “Hiện tại” để chạy model dự báo và lập phương án.</small>
      </div>
    );
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
  if (stage === "not_required")
    return (
      <div className="nf-rail-actions">
        <div className="nf-no-action-result" role="status" aria-live="polite">
          <Check size={18} />
          <span>
            <b>{noOperationalPlan ? "Chưa có phương án khả thi" : "Không cần điều chuyển"}</b>
            <small>{noOperationalPlan
              ? "Model đã đánh giá nhưng chưa tìm thấy nguồn xe hoặc hành động an toàn để điều phối ở snapshot này."
              : "Không có hotspot nào đạt điều kiện chính sách. Các vùng thiếu ở p90 vẫn là cảnh báo rủi ro, nhưng chưa được dùng để tự tạo phương án."}</small>
            <code>{optimizationStopReason ?? "NO_ACTION_REQUIRED"}</code>
          </span>
        </div>
        <button className="btn btn-secondary" onClick={onOpenPlan} type="button">Xem lại kết quả dự báo</button>
        <small>{noOperationalPlan
          ? "Chưa có proposal hợp lệ; bạn có thể làm mới snapshot rồi tính lại."
          : "Không có proposal, lệnh điều chuyển hoặc campaign nào được tạo."}</small>
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
        {optimizationError && <p className="nf-optimization-error" role="alert">Không thể tính phương án: {optimizationError}</p>}
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
          <button className="btn btn-secondary" onClick={cancelApproved} type="button">Hủy phương án đã duyệt</button>
          <button className="btn btn-secondary" onClick={onOpenPlan} type="button">Xem phương án đã duyệt</button>
          <small>Proposal đã được duyệt riêng; bước này mới tạo campaign và gửi offer tới tài xế thật.</small>
        </div>
      );
    else
    return (
      <div className="nf-rail-actions">
        <button className="btn btn-primary btn-block" disabled={!dispatchEnabled || isDispatching} onClick={dispatchCommand} type="button">{isDispatching ? "Đang phát lệnh…" : dispatchEnabled ? "Đưa vào thực hiện" : "Chưa kết nối phát lệnh điều chuyển"}</button>
        <button className="btn btn-secondary" onClick={cancelApproved} type="button">Hủy phương án đã duyệt</button>
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
  if (!reviewable && plan.status !== "Approved")
    return (
      <div className="nf-rail-actions">
        <button className="btn btn-primary btn-block" disabled={isOptimizing} onClick={onOptimize} type="button">
          {isOptimizing ? "Đang tính lại phương án…" : "Tính lại phương án"}
        </button>
        <button className="btn btn-secondary" onClick={onOpenPlan} type="button">Xem phương án cũ</button>
        <small>Phương án đã hết hạn hoặc không còn là phiên bản hiện hành nên không thể phê duyệt.</small>
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
        <button className="btn btn-secondary" onClick={cancelApproved} type="button">Hủy phương án đã duyệt</button>
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
  const actionStillValid = (isApprove || dialog === "reject")
    ? isProposalReviewable(plan)
    : plan.status === "Approved";
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pending && !actionStillValid) onClose();
  }, [actionStillValid, onClose, pending]);
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
