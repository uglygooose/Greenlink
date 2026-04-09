import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import AdminWorkspace from "../components/shell/AdminWorkspace";
import {
  createCourse,
  createPricingMatrix,
  createRuleSet,
  createTee,
  publishGolfPricingMatrix,
  publishGolfRuleSet,
  rollbackGolfPricingMatrix,
  rollbackGolfRuleSet,
} from "../api/operations";
import {
  operationsKeys,
  useCoursesQuery,
  useGolfSettingsReadinessQuery,
  usePricingMatricesQuery,
  useRuleSetsQuery,
  useTeesQuery,
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
  PricingRuleInput,
  PricingRuleAppliesTo,
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

type PricingDraftForm = {
  name: string;
  appliesTo: PricingRuleAppliesTo;
  timeBand: PricingTimeBand;
  price: string;
  currency: string;
};

const SECTION_ORDER: SetupStage[] = ["courses", "tees", "rules", "pricing"];

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
    appliesTo: "member",
    timeBand: "morning",
    price: "325.00",
    currency: "ZAR",
  };
}

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed";
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

function buildPricingPayload(form: PricingDraftForm): PricingRuleInput {
  return {
    applies_to: form.appliesTo,
    day_type: "weekday",
    time_band: form.timeBand,
    time_band_ref: form.timeBand === "custom" ? "custom-window" : null,
    price: form.price,
    currency: form.currency.toUpperCase(),
    active: true,
  };
}

function surfaceRuleSetLabel(ruleSet: BookingRuleSet): string {
  return `${ruleSet.name} / ${ruleSet.applies_to}`;
}

function surfacePricingLabel(matrix: PricingMatrix): string {
  const firstRule = matrix.rules[0];
  return firstRule ? `${matrix.name} / ${firstRule.applies_to}` : matrix.name;
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

export function AdminGolfSettingsGuidedPage(): JSX.Element {
  const queryClient = useQueryClient();
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
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!teeCourseId && courses[0]?.id) {
      setTeeCourseId(courses[0].id);
    }
  }, [courses, teeCourseId]);

  async function invalidateSetupQueries(): Promise<void> {
    if (!selectedClubId) {
      return;
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: operationsKeys.courses(selectedClubId) }),
      queryClient.invalidateQueries({ queryKey: operationsKeys.tees(selectedClubId) }),
      queryClient.invalidateQueries({ queryKey: operationsKeys.rules(selectedClubId) }),
      queryClient.invalidateQueries({ queryKey: operationsKeys.pricing(selectedClubId) }),
      queryClient.invalidateQueries({ queryKey: operationsKeys.readiness(selectedClubId) }),
    ]);
  }

  const courseMutation = useMutation({
    mutationFn: () =>
      createCourse(
        { name: courseName.trim(), holes: Number(courseHoles), active: true },
        { accessToken: accessToken as string, selectedClubId: selectedClubId as string },
      ),
    onSuccess: async () => {
      setCourseName("");
      setCourseHoles("18");
      setError(null);
      await invalidateSetupQueries();
    },
    onError: (mutationError) => setError(asMessage(mutationError)),
  });

  const teeMutation = useMutation({
    mutationFn: () =>
      createTee(
        {
          course_id: teeCourseId,
          name: teeName.trim(),
          gender: teeGender,
          slope_rating: Number(teeSlope),
          course_rating: teeRating,
          color_code: teeColor,
          active: true,
        },
        { accessToken: accessToken as string, selectedClubId: selectedClubId as string },
      ),
    onSuccess: async () => {
      setTeeName("");
      setTeeGender("mixed");
      setTeeSlope("113");
      setTeeRating("72.0");
      setTeeColor("#1b4d8f");
      setError(null);
      await invalidateSetupQueries();
    },
    onError: (mutationError) => setError(asMessage(mutationError)),
  });

  const ruleCreateMutation = useMutation({
    mutationFn: () =>
      createRuleSet(
        {
          name: ruleDraft.name.trim(),
          applies_to: ruleDraft.appliesTo,
          priority: Number(ruleDraft.priority),
          active: false,
          rules: [buildRulePayload(ruleDraft)],
        },
        { accessToken: accessToken as string, selectedClubId: selectedClubId as string },
      ),
    onSuccess: async () => {
      setRuleDraft(blankRuleDraft());
      setError(null);
      await invalidateSetupQueries();
    },
    onError: (mutationError) => setError(asMessage(mutationError)),
  });

  const pricingCreateMutation = useMutation({
    mutationFn: () =>
      createPricingMatrix(
        {
          name: pricingDraft.name.trim(),
          active: false,
          rules: [buildPricingPayload(pricingDraft)],
        },
        { accessToken: accessToken as string, selectedClubId: selectedClubId as string },
      ),
    onSuccess: async () => {
      setPricingDraft(blankPricingDraft());
      setError(null);
      await invalidateSetupQueries();
    },
    onError: (mutationError) => setError(asMessage(mutationError)),
  });

  const publishRulesMutation = useMutation({
    mutationFn: (ruleSetId: string) =>
      publishGolfRuleSet(ruleSetId, {
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    onSuccess: async () => {
      setError(null);
      await invalidateSetupQueries();
    },
    onError: (mutationError) => setError(asMessage(mutationError)),
  });

  const rollbackRulesMutation = useMutation({
    mutationFn: () =>
      rollbackGolfRuleSet({
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    onSuccess: async () => {
      setError(null);
      await invalidateSetupQueries();
    },
    onError: (mutationError) => setError(asMessage(mutationError)),
  });

  const publishPricingMutation = useMutation({
    mutationFn: (matrixId: string) =>
      publishGolfPricingMatrix(matrixId, {
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    onSuccess: async () => {
      setError(null);
      await invalidateSetupQueries();
    },
    onError: (mutationError) => setError(asMessage(mutationError)),
  });

  const rollbackPricingMutation = useMutation({
    mutationFn: () =>
      rollbackGolfPricingMatrix({
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    onSuccess: async () => {
      setError(null);
      await invalidateSetupQueries();
    },
    onError: (mutationError) => setError(asMessage(mutationError)),
  });

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
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-on-surface focus:border-emerald-500 focus:outline-none"
              onChange={(event) => setCourseName(event.target.value)}
              placeholder="Championship"
              value={courseName}
            />
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
              onClick={() => courseMutation.mutate()}
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
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-on-surface focus:border-emerald-500 focus:outline-none"
                    onChange={(event) => setTeeName(event.target.value)}
                    placeholder="Blue"
                    value={teeName}
                  />
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
                onClick={() => teeMutation.mutate()}
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
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-on-surface focus:border-emerald-500 focus:outline-none"
                    onChange={(event) => setRuleDraft((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Member standard"
                    value={ruleDraft.name}
                  />
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
                onClick={() => ruleCreateMutation.mutate()}
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
                  onClick={() => rollbackRulesMutation.mutate()}
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
                          onClick={() => publishRulesMutation.mutate(draft.id)}
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
                  <h3 className="mt-1 font-headline text-xl font-extrabold text-on-surface">Create pricing draft</h3>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Draft only</span>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <FieldLabel label="Matrix name" />
                  <input
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-on-surface focus:border-emerald-500 focus:outline-none"
                    onChange={(event) => setPricingDraft((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Member weekday"
                    value={pricingDraft.name}
                  />
                </div>
                <div>
                  <FieldLabel label="Audience" />
                  <select
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-on-surface focus:border-emerald-500 focus:outline-none"
                    onChange={(event) =>
                      setPricingDraft((current) => ({ ...current, appliesTo: event.target.value as PricingRuleAppliesTo }))
                    }
                    value={pricingDraft.appliesTo}
                  >
                    <option value="member">Member</option>
                    <option value="guest">Guest</option>
                  </select>
                </div>
                <div>
                  <FieldLabel label="Time band" />
                  <select
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-on-surface focus:border-emerald-500 focus:outline-none"
                    onChange={(event) =>
                      setPricingDraft((current) => ({ ...current, timeBand: event.target.value as PricingTimeBand }))
                    }
                    value={pricingDraft.timeBand}
                  >
                    <option value="morning">Morning</option>
                    <option value="afternoon">Afternoon</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div>
                  <FieldLabel label="Price" />
                  <input
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-on-surface focus:border-emerald-500 focus:outline-none"
                    onChange={(event) => setPricingDraft((current) => ({ ...current, price: event.target.value }))}
                    value={pricingDraft.price}
                  />
                </div>
                <div>
                  <FieldLabel label="Currency" note={selectedRole === "club_admin" ? "Managed locally" : undefined} />
                  <input
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm uppercase text-on-surface focus:border-emerald-500 focus:outline-none"
                    onChange={(event) => setPricingDraft((current) => ({ ...current, currency: event.target.value.toUpperCase() }))}
                    value={pricingDraft.currency}
                  />
                </div>
              </div>
              <button
                className="mt-5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={!pricingDraft.name.trim() || pricingCreateMutation.isPending}
                onClick={() => pricingCreateMutation.mutate()}
                type="button"
              >
                {pricingCreateMutation.isPending ? "Saving..." : "Save draft"}
              </button>
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
                        ? `${activePricing.rules[0].time_band} / ${activePricing.rules[0].price} ${activePricing.rules[0].currency}`
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
                  onClick={() => rollbackPricingMutation.mutate()}
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
                              ? `${draft.rules[0].time_band} / ${draft.rules[0].price} ${draft.rules[0].currency}`
                              : "Draft pricing rules ready to publish"}
                          </p>
                        </div>
                        <button
                          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                          disabled={publishPricingMutation.isPending}
                          onClick={() => publishPricingMutation.mutate(draft.id)}
                          type="button"
                        >
                          {publishPricingMutation.isPending ? "Publishing..." : "Publish"}
                        </button>
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


