import { useEffect, useState } from "react";

import AdminWorkspace from "../components/shell/AdminWorkspace";
import {
  useCreateCourseMutation,
  useCreatePricingMatrixMutation,
  useCreateRuleSetMutation,
  useCreateTeeMutation,
  useCoursesQuery,
  useGolfSettingsReadinessQuery,
  usePublishGolfPricingMatrixMutation,
  usePublishGolfRuleSetMutation,
  usePricingMatricesQuery,
  useRollbackGolfPricingMatrixMutation,
  useRollbackGolfRuleSetMutation,
  useRuleSetsQuery,
  useTeesQuery,
  useUpdatePricingMatrixMutation,
} from "../features/golf-settings/hooks";
import { useSession } from "../session/session-context";
import type {
  BookingRule,
  BookingRuleAppliesTo,
  BookingRuleInput,
  BookingRuleSet,
  BookingRuleType,
  Course,
  GolfSettingsReadiness,
  PricingMatrix,
  PricingDayType,
  PricingPlayerType,
  PricingRuleInput,
  PricingRuleAppliesTo,
  PricingSeason,
  PricingTimeBand,
} from "../types/operations";

type SetupStage = "courses" | "tees" | "rules" | "pricing";
type SectionState = "not_started" | "in_progress" | "complete";

type RuleDraftForm = {
  name: string;
  appliesTo: BookingRuleAppliesTo;
  priority: string;
  ruleType: BookingRuleType;
  quantity: string;
  startTime: string;
  endTime: string;
};

type PricingRuleDraftForm = {
  key: string;
  appliesTo: PricingRuleAppliesTo;
  playerType: PricingPlayerType;
  holes: string;
  dayType: PricingDayType;
  season: PricingSeason;
  timeBand: PricingTimeBand;
  timeBandRef: string;
  price: string;
  currency: string;
};

type PricingDraftForm = {
  name: string;
  rules: PricingRuleDraftForm[];
};

type GuidedFieldKey = "courseName" | "teeName" | "ruleName" | "pricingName";
type GuidedFieldErrors = Partial<Record<GuidedFieldKey, string>>;

const SECTION_ORDER: SetupStage[] = ["courses", "tees", "rules", "pricing"];
const GUIDED_FIELD_BANNER = "Please correct the highlighted fields.";

function blankRuleDraft(): RuleDraftForm {
  return {
    name: "",
    appliesTo: "member",
    priority: "10",
    ruleType: "advance_window",
    quantity: "14",
    startTime: "06:00",
    endTime: "18:00",
  };
}

function blankPricingDraft(): PricingDraftForm {
  return {
    name: "",
    rules: [blankPricingRuleDraft()],
  };
}

function nextPricingRuleKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function blankPricingRuleDraft(): PricingRuleDraftForm {
  return {
    key: nextPricingRuleKey(),
    appliesTo: "guest",
    playerType: "visitor_affiliated",
    holes: "18",
    dayType: "weekday",
    season: "off_peak",
    timeBand: "any",
    timeBandRef: "",
    price: "575.00",
    currency: "ZAR",
  };
}

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed";
}

function guidedFieldClassName(hasError: boolean): string {
  return `mt-2 w-full rounded-2xl border bg-white px-4 py-3 text-sm text-on-surface focus:outline-none ${
    hasError ? "border-rose-400 focus:border-rose-500" : "border-slate-200 focus:border-emerald-500"
  }`;
}

function guidedRequiredMessage(field: GuidedFieldKey): string {
  switch (field) {
    case "courseName":
      return "Enter a course name.";
    case "teeName":
      return "Enter a tee name.";
    case "ruleName":
      return "Enter a rule set name.";
    case "pricingName":
      return "Enter a matrix name.";
  }
}

function simplifyGuidedFieldError(field: GuidedFieldKey, detail: string): string {
  const normalized = detail.trim();

  if (/field required|missing|should not be empty/i.test(normalized)) {
    return guidedRequiredMessage(field);
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function parseGuidedMutationError(
  error: unknown,
  fieldMap: Partial<Record<string, GuidedFieldKey>>,
): { bannerMessage: string; fieldErrors: GuidedFieldErrors } {
  const message = asMessage(error);
  const [fieldSegment, ...detailParts] = message.split(":");
  if (detailParts.length === 0) {
    return { bannerMessage: message, fieldErrors: {} };
  }

  const mappedField = fieldMap[fieldSegment.trim().toLowerCase()];
  if (!mappedField) {
    return { bannerMessage: message, fieldErrors: {} };
  }

  const detail = detailParts.join(":").trim() || "Invalid value.";
  return {
    bannerMessage: GUIDED_FIELD_BANNER,
    fieldErrors: {
      [mappedField]: simplifyGuidedFieldError(mappedField, detail),
    },
  };
}

function readinessCount(readiness: GolfSettingsReadiness | undefined): number {
  if (!readiness) {
    return 0;
  }
  return [
    readiness.courses_configured,
    readiness.tees_configured,
    readiness.rules_configured,
    readiness.pricing_configured,
  ].filter(Boolean).length;
}

function sectionState(
  stage: SetupStage,
  readiness: GolfSettingsReadiness | undefined,
  courses: Course[],
  teesCount: number,
  draftsCount: number,
  activeExists: boolean,
): SectionState {
  switch (stage) {
    case "courses":
      return readiness?.courses_configured ? "complete" : courses.length > 0 ? "in_progress" : "not_started";
    case "tees":
      return readiness?.tees_configured ? "complete" : teesCount > 0 ? "in_progress" : "not_started";
    case "rules":
    case "pricing":
      if (activeExists) {
        return "complete";
      }
      return draftsCount > 0 ? "in_progress" : "not_started";
  }
}

function statusLabel(state: SectionState): string {
  switch (state) {
    case "complete":
      return "Complete";
    case "in_progress":
      return "In progress";
    default:
      return "Not started";
  }
}

function statusClassName(state: SectionState): string {
  switch (state) {
    case "complete":
      return "bg-emerald-100 text-emerald-700";
    case "in_progress":
      return "bg-amber-100 text-amber-700";
    default:
      return "bg-slate-100 text-slate-500";
  }
}

function describeLock(stage: SetupStage): string {
  switch (stage) {
    case "tees":
      return "Complete Courses before Tees unlock.";
    case "rules":
      return "Complete Tees before Booking Rules unlock.";
    case "pricing":
      return "Activate Booking Rules before Pricing unlocks.";
    default:
      return "";
  }
}

function describeRule(rule: BookingRule | undefined): string {
  if (!rule) {
    return "No booking rules configured yet.";
  }
  switch (rule.type) {
    case "advance_window":
      return `${rule.config.days ?? 0} day advance window`;
    case "max_bookings_per_day":
      return `${rule.config.count ?? 0} bookings per day`;
    case "max_future_bookings":
      return `${rule.config.count ?? 0} future bookings allowed`;
    case "guest_limit":
      return `${rule.config.count ?? 0} guests allowed`;
    case "time_restriction":
      return `${rule.config.start_time ?? "--"} to ${rule.config.end_time ?? "--"} operating window`;
    default:
      return "Rule configured";
  }
}

function buildRulePayload(form: RuleDraftForm): BookingRuleInput {
  let config: Record<string, unknown>;
  switch (form.ruleType) {
    case "advance_window":
      config = { days: Number(form.quantity) };
      break;
    case "max_bookings_per_day":
    case "max_future_bookings":
    case "guest_limit":
      config = { count: Number(form.quantity) };
      break;
    case "time_restriction":
      config = { start_time: form.startTime, end_time: form.endTime };
      break;
  }
  return { type: form.ruleType, config, active: true };
}

function buildPricingPayload(form: PricingDraftForm): PricingRuleInput[] {
  return form.rules.map((rule) => ({
    applies_to: rule.appliesTo,
    player_type: rule.playerType,
    holes: Number(rule.holes),
    day_type: rule.dayType,
    season: rule.season,
    time_band: rule.timeBand,
    time_band_ref: rule.timeBand === "custom" ? rule.timeBandRef.trim() || "custom-window" : null,
    price: rule.price,
    currency: rule.currency.toUpperCase(),
    active: true,
  }));
}

function surfaceRuleSetLabel(ruleSet: BookingRuleSet): string {
  return `${ruleSet.name} / ${ruleSet.applies_to}`;
}

function surfacePricingLabel(matrix: PricingMatrix): string {
  return `${matrix.name} / ${matrix.rules.length} rules`;
}

function pricingRuleSummary(rule: PricingMatrix["rules"][number] | PricingRuleDraftForm | undefined): string {
  if (!rule) {
    return "No pricing rules configured yet.";
  }
  const seasonValue = "player_type" in rule ? rule.season : rule.season;
  const season = seasonValue === "any" ? "all seasons" : seasonValue;
  const dayTypeValue = "player_type" in rule ? rule.day_type : rule.dayType;
  const dayType = dayTypeValue === "any" ? "all days" : dayTypeValue;
  const timeBand = "player_type" in rule ? rule.time_band : rule.timeBand;
  const playerType = "player_type" in rule ? rule.player_type : rule.playerType;
  const holes = "player_type" in rule ? rule.holes : Number(rule.holes);
  const price = rule.price;
  const currency = rule.currency;
  return `${playerType} / ${holes} holes / ${dayType} / ${season} / ${timeBand} / ${price} ${currency}`;
}

function pricingPlayerTypeOptions(appliesTo: PricingRuleAppliesTo): PricingPlayerType[] {
  switch (appliesTo) {
    case "guest":
      return ["visitor_affiliated", "visitor_non_affiliated"];
    case "staff":
      return ["staff_courtesy"];
    default:
      return ["member_standard", "scholar", "student", "pensioner"];
  }
}

function FieldLabel({ label, note }: { label: string; note?: string }): JSX.Element {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</span>
        {note ? <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{note}</span> : null}
      </div>
    </div>
  );
}

function MetricTile({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" | "muted" }): JSX.Element {
  const toneClass =
    tone === "good"
      ? "border-emerald-100 bg-emerald-50"
      : tone === "warn"
        ? "border-amber-100 bg-amber-50"
        : "border-slate-200 bg-white";
  return (
    <div className={`rounded-[24px] border p-5 shadow-sm ${toneClass}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <p className="mt-2 font-headline text-3xl font-extrabold text-slate-900">{value}</p>
    </div>
  );
}

function SetupSection({
  title,
  description,
  state,
  locked,
  lockReason,
  children,
}: {
  title: string;
  description: string;
  state: SectionState;
  locked: boolean;
  lockReason?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section className={`rounded-[30px] border p-6 shadow-sm ${locked ? "border-slate-200 bg-slate-50/80" : "border-slate-200 bg-white"}`}>
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Guided setup</p>
          <h2 className="mt-1 font-headline text-2xl font-extrabold text-on-surface">{title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">{description}</p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${statusClassName(state)}`}>
            {statusLabel(state)}
          </span>
          {locked && lockReason ? (
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Locked
            </span>
          ) : null}
        </div>
      </div>
      {locked && lockReason ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
          {lockReason}
        </div>
      ) : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function AdminGolfSettingsPage(): JSX.Element {
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;
  const selectedClub = bootstrap?.selected_club;

  const coursesQuery = useCoursesQuery({ accessToken, selectedClubId });
  const teesQuery = useTeesQuery({ accessToken, selectedClubId });
  const ruleSetsQuery = useRuleSetsQuery({ accessToken, selectedClubId });
  const pricingQuery = usePricingMatricesQuery({ accessToken, selectedClubId });
  const readinessQuery = useGolfSettingsReadinessQuery({ accessToken, selectedClubId });

  const [courseName, setCourseName] = useState("");
  const [courseHoles, setCourseHoles] = useState("18");
  const [teeCourseId, setTeeCourseId] = useState("");
  const [teeName, setTeeName] = useState("");
  const [teeGender, setTeeGender] = useState("mixed");
  const [teeSlope, setTeeSlope] = useState("113");
  const [teeRating, setTeeRating] = useState("72.0");
  const [teeColor, setTeeColor] = useState("#1b4d8f");
  const [ruleDraft, setRuleDraft] = useState<RuleDraftForm>(blankRuleDraft());
  const [pricingDraft, setPricingDraft] = useState<PricingDraftForm>(blankPricingDraft());
  const [editingPricingMatrixId, setEditingPricingMatrixId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<GuidedFieldErrors>({});

  const selectedRole =
    bootstrap?.available_clubs.find((club) => club.club_id === selectedClubId)?.membership_role ?? null;

  const courses = coursesQuery.data ?? [];
  const tees = teesQuery.data ?? [];
  const ruleSets = ruleSetsQuery.data ?? [];
  const pricingMatrices = pricingQuery.data ?? [];
  const readiness = readinessQuery.data;

  const activeRuleSet = ruleSets.find((item) => item.status === "active") ?? null;
  const ruleDrafts = ruleSets.filter((item) => item.status === "draft");
  const activePricing = pricingMatrices.find((item) => item.status === "active") ?? null;
  const pricingDrafts = pricingMatrices.filter((item) => item.status === "draft");

  const teesLocked = !readiness?.courses_configured;
  const rulesLocked = !readiness?.tees_configured;
  const pricingLocked = !readiness?.rules_configured;
  const completedCount = readinessCount(readiness);

  const courseMutation = useCreateCourseMutation();
  const teeMutation = useCreateTeeMutation();
  const ruleCreateMutation = useCreateRuleSetMutation();
  const pricingCreateMutation = useCreatePricingMatrixMutation();
  const pricingUpdateMutation = useUpdatePricingMatrixMutation();
  const publishRulesMutation = usePublishGolfRuleSetMutation();
  const rollbackRulesMutation = useRollbackGolfRuleSetMutation();
  const publishPricingMutation = usePublishGolfPricingMatrixMutation();
  const rollbackPricingMutation = useRollbackGolfPricingMatrixMutation();

  useEffect(() => {
    if (!teeCourseId && courses[0]?.id) {
      setTeeCourseId(courses[0].id);
    }
  }, [courses, teeCourseId]);

  function clearFieldError(field: GuidedFieldKey): void {
    if (!fieldErrors[field]) {
      return;
    }

    const nextErrors = { ...fieldErrors };
    delete nextErrors[field];
    setFieldErrors(nextErrors);

    if (error === GUIDED_FIELD_BANNER && Object.keys(nextErrors).length === 0) {
      setError(null);
    }
  }

  function validateRequiredField(field: GuidedFieldKey, value: string): boolean {
    if (value.trim()) {
      return true;
    }

    setFieldErrors((current) => ({
      ...current,
      [field]: guidedRequiredMessage(field),
    }));
    return false;
  }

  function applyMutationError(
    mutationError: unknown,
    fieldMap: Partial<Record<string, GuidedFieldKey>>,
  ): void {
    const parsedError = parseGuidedMutationError(mutationError, fieldMap);
    setError(parsedError.bannerMessage);
    if (Object.keys(parsedError.fieldErrors).length > 0) {
      setFieldErrors((current) => ({ ...current, ...parsedError.fieldErrors }));
    }
  }

  async function handleCreateCourse(): Promise<void> {
    if (!validateRequiredField("courseName", courseName)) {
      setError(GUIDED_FIELD_BANNER);
      return;
    }

    try {
      await courseMutation.mutateAsync({
        name: courseName.trim(),
        holes: Number(courseHoles),
        active: true,
      });
      clearFieldError("courseName");
      setCourseName("");
      setCourseHoles("18");
      setError(null);
    } catch (mutationError) {
      applyMutationError(mutationError, { name: "courseName" });
    }
  }

  async function handleCreateTee(): Promise<void> {
    if (!validateRequiredField("teeName", teeName)) {
      setError(GUIDED_FIELD_BANNER);
      return;
    }

    try {
      await teeMutation.mutateAsync({
        course_id: teeCourseId,
        name: teeName.trim(),
        gender: teeGender,
        slope_rating: Number(teeSlope),
        course_rating: teeRating,
        color_code: teeColor,
        active: true,
      });
      clearFieldError("teeName");
      setTeeName("");
      setTeeGender("mixed");
      setTeeSlope("113");
      setTeeRating("72.0");
      setTeeColor("#1b4d8f");
      setError(null);
    } catch (mutationError) {
      applyMutationError(mutationError, { name: "teeName" });
    }
  }

  async function handleCreateRuleSet(): Promise<void> {
    if (!validateRequiredField("ruleName", ruleDraft.name)) {
      setError(GUIDED_FIELD_BANNER);
      return;
    }

    try {
      await ruleCreateMutation.mutateAsync({
        name: ruleDraft.name.trim(),
        applies_to: ruleDraft.appliesTo,
        priority: Number(ruleDraft.priority),
        active: false,
        rules: [buildRulePayload(ruleDraft)],
      });
      clearFieldError("ruleName");
      setRuleDraft(blankRuleDraft());
      setError(null);
    } catch (mutationError) {
      applyMutationError(mutationError, { name: "ruleName" });
    }
  }

  function updatePricingRuleDraft(
    key: string,
    patch: Partial<PricingRuleDraftForm>,
  ): void {
    setPricingDraft((current) => ({
      ...current,
      rules: current.rules.map((rule) => {
        if (rule.key !== key) {
          return rule;
        }
        const next = { ...rule, ...patch };
        if (patch.appliesTo) {
          const supported = pricingPlayerTypeOptions(patch.appliesTo);
          if (!supported.includes(next.playerType)) {
            next.playerType = supported[0];
          }
        }
        if (patch.timeBand && patch.timeBand !== "custom") {
          next.timeBandRef = "";
        }
        return next;
      }),
    }));
  }

  function addPricingRuleDraft(): void {
    setPricingDraft((current) => ({
      ...current,
      rules: [...current.rules, blankPricingRuleDraft()],
    }));
  }

  function removePricingRuleDraft(key: string): void {
    setPricingDraft((current) => ({
      ...current,
      rules: current.rules.length === 1 ? current.rules : current.rules.filter((rule) => rule.key !== key),
    }));
  }

  function startEditingPricingMatrix(matrix: PricingMatrix): void {
    setEditingPricingMatrixId(matrix.id);
    setPricingDraft({
      name: matrix.name,
      rules: matrix.rules.map((rule) => ({
        key: nextPricingRuleKey(),
        appliesTo: rule.applies_to,
        playerType: rule.player_type,
        holes: String(rule.holes),
        dayType: rule.day_type,
        season: rule.season,
        timeBand: rule.time_band,
        timeBandRef: rule.time_band_ref ?? "",
        price: rule.price,
        currency: rule.currency,
      })),
    });
    setError(null);
    clearFieldError("pricingName");
  }

  function resetPricingDraft(): void {
    setEditingPricingMatrixId(null);
    setPricingDraft(blankPricingDraft());
  }

  async function handleCreatePricingMatrix(): Promise<void> {
    if (!validateRequiredField("pricingName", pricingDraft.name)) {
      setError(GUIDED_FIELD_BANNER);
      return;
    }

    try {
      const payload = {
        name: pricingDraft.name.trim(),
        active: false,
        rules: buildPricingPayload(pricingDraft),
      };
      if (editingPricingMatrixId) {
        await pricingUpdateMutation.mutateAsync({ matrixId: editingPricingMatrixId, payload });
      } else {
        await pricingCreateMutation.mutateAsync(payload);
      }
      clearFieldError("pricingName");
      resetPricingDraft();
      setError(null);
    } catch (mutationError) {
      applyMutationError(mutationError, { name: "pricingName" });
    }
  }

  async function handlePublishRules(ruleSetId: string): Promise<void> {
    try {
      await publishRulesMutation.mutateAsync(ruleSetId);
      setError(null);
    } catch (mutationError) {
      applyMutationError(mutationError, {});
    }
  }

  async function handleRollbackRules(): Promise<void> {
    try {
      await rollbackRulesMutation.mutateAsync();
      setError(null);
    } catch (mutationError) {
      applyMutationError(mutationError, {});
    }
  }

  async function handlePublishPricing(matrixId: string): Promise<void> {
    try {
      await publishPricingMutation.mutateAsync(matrixId);
      setError(null);
    } catch (mutationError) {
      applyMutationError(mutationError, {});
    }
  }

  async function handleRollbackPricing(): Promise<void> {
    try {
      await rollbackPricingMutation.mutateAsync();
      setError(null);
    } catch (mutationError) {
      applyMutationError(mutationError, {});
    }
  }

  return (
    <AdminWorkspace
      title="Golf Settings"
      description={
        selectedClub?.name
          ? `Guided setup for ${selectedClub.name}. Complete each stage in order, publish only when the system is ready, and keep live configuration separate from drafts.`
          : "Guided setup for live golf operations."
      }
      kpis={
        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[2fr_1fr_1fr]">
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Readiness</p>
                  <h2 className="mt-1 font-headline text-2xl font-extrabold text-on-surface">{completedCount} / 4 complete</h2>
                  <p className="mt-2 text-sm text-slate-600">
                    {readiness?.overall_ready ? "Ready for live operation" : "Not ready for live operation"}
                  </p>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {SECTION_ORDER.map((stage, index) => {
                    const active =
                      (stage === "courses" && readiness?.courses_configured) ||
                      (stage === "tees" && readiness?.tees_configured) ||
                      (stage === "rules" && readiness?.rules_configured) ||
                      (stage === "pricing" && readiness?.pricing_configured);
                    return (
                      <div
                        className={`h-3 w-14 rounded-full ${active ? "bg-emerald-500" : "bg-slate-200"}`}
                        key={stage}
                        title={`Stage ${index + 1}: ${stage}`}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
            <MetricTile label="Draft Rules" tone={ruleDrafts.length > 0 ? "warn" : "muted"} value={String(ruleDrafts.length)} />
            <MetricTile label="Draft Pricing" tone={pricingDrafts.length > 0 ? "warn" : "muted"} value={String(pricingDrafts.length)} />
          </div>
          <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600">
            <span className="font-semibold text-slate-900">Managed by Superadmin:</span> module rollout and platform onboarding remain outside this workspace. Club admins can complete operational golf setup here, but ownership boundaries are still enforced.
          </div>
          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
          ) : null}
        </div>
      }
    >
      <SetupSection
        description="Define the playable course inventory first. Tees, booking rules, and pricing all depend on this inventory."
        locked={false}
        state={sectionState("courses", readiness, courses, tees.length, ruleDrafts.length, Boolean(activeRuleSet))}
        title="1. Courses"
      >
        <div className="grid gap-5 xl:grid-cols-[1.1fr_1.4fr]">
          <div className="rounded-[24px] border border-slate-100 bg-slate-50 p-5">
            <FieldLabel label="Course name" />
            <input
              aria-invalid={fieldErrors.courseName ? "true" : "false"}
              className={guidedFieldClassName(Boolean(fieldErrors.courseName))}
              onBlur={() => {
                validateRequiredField("courseName", courseName);
              }}
              onChange={(event) => {
                clearFieldError("courseName");
                setCourseName(event.target.value);
              }}
              placeholder="Championship"
              value={courseName}
            />
            {fieldErrors.courseName ? <p className="mt-2 text-xs font-medium text-rose-700">{fieldErrors.courseName}</p> : null}
            <div className="mt-4">
              <FieldLabel label="Holes" />
              <select
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-on-surface focus:border-emerald-500 focus:outline-none"
                onChange={(event) => setCourseHoles(event.target.value)}
                value={courseHoles}
              >
                <option value="18">18 holes</option>
                <option value="9">9 holes</option>
              </select>
            </div>
            <button
              className="mt-5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={!courseName.trim() || courseMutation.isPending}
              onClick={() => void handleCreateCourse()}
              type="button"
            >
              {courseMutation.isPending ? "Saving..." : "Add course"}
            </button>
          </div>
          <div className="space-y-3">
            {courses.length > 0 ? (
              courses.map((course) => (
                <div className="rounded-[24px] border border-slate-200 bg-white px-5 py-4" key={course.id}>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-headline text-xl font-extrabold text-on-surface">{course.name}</p>
                      <p className="mt-1 text-sm text-slate-500">{course.holes} holes configured for scheduling and tee definition.</p>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">
                      Ready
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-white px-5 py-6 text-sm text-slate-500">
                No courses yet. Add the first course to unlock the rest of the setup flow.
              </div>
            )}
          </div>
        </div>
      </SetupSection>

      <SetupSection
        description="Configure the playable tee options once a course exists. Booking rules stay locked until at least one tee is configured."
        lockReason={describeLock("tees")}
        locked={teesLocked}
        state={sectionState("tees", readiness, courses, tees.length, ruleDrafts.length, Boolean(activeRuleSet))}
        title="2. Tees"
      >
        <fieldset className="space-y-5" disabled={teesLocked}>
          <div className="grid gap-5 xl:grid-cols-[1.1fr_1.4fr]">
            <div className="rounded-[24px] border border-slate-100 bg-slate-50 p-5">
              <FieldLabel label="Course" />
              <select
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-on-surface focus:border-emerald-500 focus:outline-none"
                onChange={(event) => setTeeCourseId(event.target.value)}
                value={teeCourseId}
              >
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <FieldLabel label="Tee name" />
                  <input
                    aria-invalid={fieldErrors.teeName ? "true" : "false"}
                    className={guidedFieldClassName(Boolean(fieldErrors.teeName))}
                    onBlur={() => {
                      validateRequiredField("teeName", teeName);
                    }}
                    onChange={(event) => {
                      clearFieldError("teeName");
                      setTeeName(event.target.value);
                    }}
                    placeholder="Blue"
                    value={teeName}
                  />
                  {fieldErrors.teeName ? <p className="mt-2 text-xs font-medium text-rose-700">{fieldErrors.teeName}</p> : null}
                </div>
                <div>
                  <FieldLabel label="Gender" />
                  <select
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-on-surface focus:border-emerald-500 focus:outline-none"
                    onChange={(event) => setTeeGender(event.target.value)}
                    value={teeGender}
                  >
                    <option value="mixed">Mixed</option>
                    <option value="men">Men</option>
                    <option value="women">Women</option>
                  </select>
                </div>
                <div>
                  <FieldLabel label="Slope rating" />
                  <input
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-on-surface focus:border-emerald-500 focus:outline-none"
                    onChange={(event) => setTeeSlope(event.target.value)}
                    type="number"
                    value={teeSlope}
                  />
                </div>
                <div>
                  <FieldLabel label="Course rating" />
                  <input
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-on-surface focus:border-emerald-500 focus:outline-none"
                    onChange={(event) => setTeeRating(event.target.value)}
                    value={teeRating}
                  />
                </div>
              </div>
              <div className="mt-4">
                <FieldLabel label="Color code" />
                <input
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-on-surface focus:border-emerald-500 focus:outline-none"
                  onChange={(event) => setTeeColor(event.target.value)}
                  value={teeColor}
                />
              </div>
              <button
                className="mt-5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={!teeCourseId || !teeName.trim() || teeMutation.isPending}
                onClick={() => void handleCreateTee()}
                type="button"
              >
                {teeMutation.isPending ? "Saving..." : "Add tee"}
              </button>
            </div>
            <div className="space-y-3">
              {tees.length > 0 ? (
                tees.map((tee) => (
                  <div className="rounded-[24px] border border-slate-200 bg-white px-5 py-4" key={tee.id}>
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-headline text-xl font-extrabold text-on-surface">{tee.course_name} / {tee.name}</p>
                        <p className="mt-1 text-sm text-slate-500">Slope {tee.slope_rating} / Rating {tee.course_rating} / {tee.color_code}</p>
                      </div>
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">
                        Ready
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[24px] border border-dashed border-slate-200 bg-white px-5 py-6 text-sm text-slate-500">
                  No tees configured yet.
                </div>
              )}
            </div>
          </div>
        </fieldset>
      </SetupSection>

      <SetupSection
        description="Keep rule drafts separate from the live rule set. Publish only when the active tee inventory is ready, and use rollback to restore the last active set safely."
        lockReason={describeLock("rules")}
        locked={rulesLocked}
        state={sectionState("rules", readiness, courses, tees.length, ruleDrafts.length, Boolean(activeRuleSet))}
        title="3. Booking Rules"
      >
        <fieldset className="space-y-5" disabled={rulesLocked}>
          <div className="grid gap-5 xl:grid-cols-[1.15fr_1fr]">
            <div className="rounded-[24px] border border-slate-100 bg-slate-50 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">New draft</p>
                  <h3 className="mt-1 font-headline text-xl font-extrabold text-on-surface">Create booking rules draft</h3>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Draft only</span>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <FieldLabel label="Rule set name" />
                  <input
                    aria-invalid={fieldErrors.ruleName ? "true" : "false"}
                    className={guidedFieldClassName(Boolean(fieldErrors.ruleName))}
                    onBlur={() => {
                      validateRequiredField("ruleName", ruleDraft.name);
                    }}
                    onChange={(event) => {
                      clearFieldError("ruleName");
                      setRuleDraft((current) => ({ ...current, name: event.target.value }));
                    }}
                    placeholder="Member standard"
                    value={ruleDraft.name}
                  />
                  {fieldErrors.ruleName ? <p className="mt-2 text-xs font-medium text-rose-700">{fieldErrors.ruleName}</p> : null}
                </div>
                <div>
                  <FieldLabel label="Audience" />
                  <select
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-on-surface focus:border-emerald-500 focus:outline-none"
                    onChange={(event) =>
                      setRuleDraft((current) => ({ ...current, appliesTo: event.target.value as BookingRuleAppliesTo }))
                    }
                    value={ruleDraft.appliesTo}
                  >
                    <option value="member">Member</option>
                    <option value="guest">Guest</option>
                    <option value="staff">Staff</option>
                  </select>
                </div>
                <div>
                  <FieldLabel label="Primary rule" />
                  <select
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-on-surface focus:border-emerald-500 focus:outline-none"
                    onChange={(event) =>
                      setRuleDraft((current) => ({ ...current, ruleType: event.target.value as BookingRuleType }))
                    }
                    value={ruleDraft.ruleType}
                  >
                    <option value="advance_window">Advance window</option>
                    <option value="max_bookings_per_day">Bookings per day</option>
                    <option value="max_future_bookings">Future bookings</option>
                    <option value="guest_limit">Guest limit</option>
                    <option value="time_restriction">Time restriction</option>
                  </select>
                </div>
                <div>
                  <FieldLabel label="Priority" />
                  <input
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-on-surface focus:border-emerald-500 focus:outline-none"
                    onChange={(event) => setRuleDraft((current) => ({ ...current, priority: event.target.value }))}
                    type="number"
                    value={ruleDraft.priority}
                  />
                </div>
                {ruleDraft.ruleType === "time_restriction" ? (
                  <>
                    <div>
                      <FieldLabel label="Start time" />
                      <input
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-on-surface focus:border-emerald-500 focus:outline-none"
                        onChange={(event) => setRuleDraft((current) => ({ ...current, startTime: event.target.value }))}
                        value={ruleDraft.startTime}
                      />
                    </div>
                    <div>
                      <FieldLabel label="End time" />
                      <input
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-on-surface focus:border-emerald-500 focus:outline-none"
                        onChange={(event) => setRuleDraft((current) => ({ ...current, endTime: event.target.value }))}
                        value={ruleDraft.endTime}
                      />
                    </div>
                  </>
                ) : (
                  <div>
                    <FieldLabel label={ruleDraft.ruleType === "advance_window" ? "Days" : "Count"} />
                    <input
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-on-surface focus:border-emerald-500 focus:outline-none"
                      onChange={(event) => setRuleDraft((current) => ({ ...current, quantity: event.target.value }))}
                      type="number"
                      value={ruleDraft.quantity}
                    />
                  </div>
                )}
              </div>
              <button
                className="mt-5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={!ruleDraft.name.trim() || ruleCreateMutation.isPending}
                onClick={() => void handleCreateRuleSet()}
                type="button"
              >
                {ruleCreateMutation.isPending ? "Saving..." : "Save draft"}
              </button>
            </div>
            <div className="space-y-4">
              <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Active version</p>
                    <h3 className="mt-1 font-headline text-xl font-extrabold text-on-surface">
                      {activeRuleSet ? surfaceRuleSetLabel(activeRuleSet) : "Nothing live yet"}
                    </h3>
                    <p className="mt-2 text-sm text-slate-500">{describeRule(activeRuleSet?.rules[0])}</p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">
                    {activeRuleSet ? "Active" : "Offline"}
                  </span>
                </div>
                <button
                  className="mt-4 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!activeRuleSet || rollbackRulesMutation.isPending}
                  onClick={() => void handleRollbackRules()}
                  type="button"
                >
                  {rollbackRulesMutation.isPending ? "Rolling back..." : "Rollback"}
                </button>
              </div>
              <div className="space-y-3">
                {ruleDrafts.length > 0 ? (
                  ruleDrafts.map((draft) => (
                    <div className="rounded-[24px] border border-amber-100 bg-amber-50 p-5" key={draft.id}>
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-amber-700">Draft version</p>
                          <h4 className="mt-1 font-headline text-lg font-extrabold text-on-surface">{surfaceRuleSetLabel(draft)}</h4>
                          <p className="mt-2 text-sm text-slate-600">{describeRule(draft.rules[0])}</p>
                        </div>
                        <button
                          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                          disabled={publishRulesMutation.isPending}
                          onClick={() => void handlePublishRules(draft.id)}
                          type="button"
                        >
                          {publishRulesMutation.isPending ? "Publishing..." : "Publish"}
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[24px] border border-dashed border-slate-200 bg-white px-5 py-6 text-sm text-slate-500">
                    No draft rule sets waiting for publish.
                  </div>
                )}
              </div>
            </div>
          </div>
        </fieldset>
      </SetupSection>

      <SetupSection
        description="Keep pricing in draft until rules are live. Publish only one matrix at a time, and use rollback to restore the last active live matrix."
        lockReason={describeLock("pricing")}
        locked={pricingLocked}
        state={sectionState("pricing", readiness, courses, tees.length, pricingDrafts.length, Boolean(activePricing))}
        title="4. Pricing"
      >
        <fieldset className="space-y-5" disabled={pricingLocked}>
          <div className="grid gap-5 xl:grid-cols-[1.15fr_1fr]">
            <div className="rounded-[24px] border border-slate-100 bg-slate-50 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">New draft</p>
                  <h3 className="mt-1 font-headline text-xl font-extrabold text-on-surface">
                    {editingPricingMatrixId ? "Edit pricing draft" : "Create pricing draft"}
                  </h3>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Draft only</span>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <FieldLabel label="Matrix name" />
                  <input
                    aria-invalid={fieldErrors.pricingName ? "true" : "false"}
                    className={guidedFieldClassName(Boolean(fieldErrors.pricingName))}
                    onBlur={() => {
                      validateRequiredField("pricingName", pricingDraft.name);
                    }}
                    onChange={(event) => {
                      clearFieldError("pricingName");
                      setPricingDraft((current) => ({ ...current, name: event.target.value }));
                    }}
                    placeholder="Visitor benchmark pricing"
                    value={pricingDraft.name}
                  />
                  {fieldErrors.pricingName ? <p className="mt-2 text-xs font-medium text-rose-700">{fieldErrors.pricingName}</p> : null}
                </div>
                <div>
                  <FieldLabel label="Rule rows" note={`${pricingDraft.rules.length} configured`} />
                  <div className="mt-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                    Dimensions stay backend-owned: player type, holes, day type, season, and time band.
                  </div>
                </div>
              </div>
              <div className="mt-5 space-y-4">
                {pricingDraft.rules.map((rule, index) => (
                  <div className="rounded-[24px] border border-slate-200 bg-white p-4" key={rule.key}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Rule row {index + 1}</p>
                        <p className="mt-1 text-sm text-slate-500">{pricingRuleSummary(rule)}</p>
                      </div>
                      <button
                        className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 disabled:opacity-50"
                        disabled={pricingDraft.rules.length === 1}
                        onClick={() => removePricingRuleDraft(rule.key)}
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <div>
                        <FieldLabel label="Audience" />
                        <select
                          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-on-surface focus:border-emerald-500 focus:outline-none"
                          onChange={(event) => updatePricingRuleDraft(rule.key, { appliesTo: event.target.value as PricingRuleAppliesTo })}
                          value={rule.appliesTo}
                        >
                          <option value="member">Member</option>
                          <option value="guest">Guest</option>
                          <option value="staff">Staff</option>
                        </select>
                      </div>
                      <div>
                        <FieldLabel label="Player type" />
                        <select
                          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-on-surface focus:border-emerald-500 focus:outline-none"
                          onChange={(event) => updatePricingRuleDraft(rule.key, { playerType: event.target.value as PricingPlayerType })}
                          value={rule.playerType}
                        >
                          {pricingPlayerTypeOptions(rule.appliesTo).map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <FieldLabel label="Holes" />
                        <select
                          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-on-surface focus:border-emerald-500 focus:outline-none"
                          onChange={(event) => updatePricingRuleDraft(rule.key, { holes: event.target.value })}
                          value={rule.holes}
                        >
                          <option value="9">9 holes</option>
                          <option value="18">18 holes</option>
                        </select>
                      </div>
                      <div>
                        <FieldLabel label="Day type" />
                        <select
                          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-on-surface focus:border-emerald-500 focus:outline-none"
                          onChange={(event) => updatePricingRuleDraft(rule.key, { dayType: event.target.value as PricingDayType })}
                          value={rule.dayType}
                        >
                          <option value="any">All days</option>
                          <option value="weekday">Weekday</option>
                          <option value="weekend">Weekend</option>
                          <option value="public_holiday">Public holiday</option>
                        </select>
                      </div>
                      <div>
                        <FieldLabel label="Season" />
                        <select
                          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-on-surface focus:border-emerald-500 focus:outline-none"
                          onChange={(event) => updatePricingRuleDraft(rule.key, { season: event.target.value as PricingSeason })}
                          value={rule.season}
                        >
                          <option value="any">All seasons</option>
                          <option value="peak">Peak</option>
                          <option value="off_peak">Off peak</option>
                        </select>
                      </div>
                      <div>
                        <FieldLabel label="Time band" />
                        <select
                          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-on-surface focus:border-emerald-500 focus:outline-none"
                          onChange={(event) => updatePricingRuleDraft(rule.key, { timeBand: event.target.value as PricingTimeBand })}
                          value={rule.timeBand}
                        >
                          <option value="any">Any time</option>
                          <option value="morning">Morning</option>
                          <option value="afternoon">Afternoon</option>
                          <option value="custom">Custom</option>
                        </select>
                      </div>
                      {rule.timeBand === "custom" ? (
                        <div>
                          <FieldLabel label="Custom ref" />
                          <input
                            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-on-surface focus:border-emerald-500 focus:outline-none"
                            onChange={(event) => updatePricingRuleDraft(rule.key, { timeBandRef: event.target.value })}
                            placeholder="prime"
                            value={rule.timeBandRef}
                          />
                        </div>
                      ) : null}
                      <div>
                        <FieldLabel label="Price" />
                        <input
                          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-on-surface focus:border-emerald-500 focus:outline-none"
                          onChange={(event) => updatePricingRuleDraft(rule.key, { price: event.target.value })}
                          value={rule.price}
                        />
                      </div>
                      <div>
                        <FieldLabel label="Currency" note={selectedRole === "club_admin" ? "Managed locally" : undefined} />
                        <input
                          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm uppercase text-on-surface focus:border-emerald-500 focus:outline-none"
                          onChange={(event) => updatePricingRuleDraft(rule.key, { currency: event.target.value.toUpperCase() })}
                          value={rule.currency}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                  onClick={() => addPricingRuleDraft()}
                  type="button"
                >
                  Add rule row
                </button>
                {editingPricingMatrixId ? (
                  <button
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                    onClick={() => resetPricingDraft()}
                    type="button"
                  >
                    Cancel edit
                  </button>
                ) : null}
                <button
                  className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                  disabled={!pricingDraft.name.trim() || pricingCreateMutation.isPending || pricingUpdateMutation.isPending}
                  onClick={() => void handleCreatePricingMatrix()}
                  type="button"
                >
                  {pricingCreateMutation.isPending || pricingUpdateMutation.isPending
                    ? "Saving..."
                    : editingPricingMatrixId
                      ? "Update draft"
                      : "Save draft"}
                </button>
              </div>
            </div>
            <div className="space-y-4">
              <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Active version</p>
                    <h3 className="mt-1 font-headline text-xl font-extrabold text-on-surface">
                      {activePricing ? surfacePricingLabel(activePricing) : "Nothing live yet"}
                    </h3>
                    <p className="mt-2 text-sm text-slate-500">
                      {activePricing?.rules[0]
                        ? pricingRuleSummary(activePricing.rules[0])
                        : "Publish a pricing draft when booking rules are active."}
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">
                    {activePricing ? "Active" : "Offline"}
                  </span>
                </div>
                <button
                  className="mt-4 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!activePricing || rollbackPricingMutation.isPending}
                  onClick={() => void handleRollbackPricing()}
                  type="button"
                >
                  {rollbackPricingMutation.isPending ? "Rolling back..." : "Rollback"}
                </button>
              </div>
              <div className="space-y-3">
                {pricingDrafts.length > 0 ? (
                  pricingDrafts.map((draft) => (
                    <div className="rounded-[24px] border border-amber-100 bg-amber-50 p-5" key={draft.id}>
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-amber-700">Draft version</p>
                          <h4 className="mt-1 font-headline text-lg font-extrabold text-on-surface">{surfacePricingLabel(draft)}</h4>
                          <p className="mt-2 text-sm text-slate-600">
                            {draft.rules[0]
                              ? pricingRuleSummary(draft.rules[0])
                              : "Draft pricing rules ready to publish"}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                            onClick={() => startEditingPricingMatrix(draft)}
                            type="button"
                          >
                            {editingPricingMatrixId === draft.id ? "Editing" : "Edit"}
                          </button>
                          <button
                            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                            disabled={publishPricingMutation.isPending}
                            onClick={() => void handlePublishPricing(draft.id)}
                            type="button"
                          >
                            {publishPricingMutation.isPending ? "Publishing..." : "Publish"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[24px] border border-dashed border-slate-200 bg-white px-5 py-6 text-sm text-slate-500">
                    No draft pricing matrices waiting for publish.
                  </div>
                )}
              </div>
            </div>
          </div>
        </fieldset>
      </SetupSection>
    </AdminWorkspace>
  );
}


