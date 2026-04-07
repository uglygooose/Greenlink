import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  createCourse,
  createPricingMatrix,
  createRuleSet,
  createTee,
  updateClubConfig,
  updatePricingMatrix,
  updateRuleSet,
} from "../api/operations";
import {
  operationsKeys,
  useClubConfigQuery,
  useCoursesQuery,
  usePricingMatricesQuery,
  useRuleSetsQuery,
  useTeesQuery,
} from "../features/golf-settings/hooks";
import AdminWorkspace from "../components/shell/AdminWorkspace";
import { useSession } from "../session/session-context";
import type {
  BookingRuleAppliesTo,
  BookingRuleSet,
  BookingRuleSetInput,
  BookingRuleType,
  ClubConfig,
  ClubConfigInput,
  Course,
  PricingDayType,
  PricingMatrix,
  PricingMatrixInput,
  PricingRuleAppliesTo,
  PricingTimeBand,
  Tee,
} from "../types/operations";

type ClubConfigDraft = {
  timezone: string;
  operatingHoursText: string;
  bookingWindowDays: string;
  cancellationPolicyHours: string;
  defaultSlotIntervalMinutes: string;
};

type RuleDraft = { type: BookingRuleType; configText: string; active: boolean };
type RuleSetDraft = {
  id: string;
  name: string;
  appliesTo: BookingRuleAppliesTo;
  priority: string;
  active: boolean;
  rules: RuleDraft[];
};
type PricingRuleDraft = {
  appliesTo: PricingRuleAppliesTo;
  dayType: PricingDayType;
  timeBand: PricingTimeBand;
  price: string;
  currency: string;
  active: boolean;
};
type PricingMatrixDraft = { id: string; name: string; active: boolean; rules: PricingRuleDraft[] };

const RULE_TYPES: BookingRuleType[] = [
  "advance_window",
  "max_bookings_per_day",
  "max_future_bookings",
  "guest_limit",
  "time_restriction",
];
const RULE_AUDIENCES: BookingRuleAppliesTo[] = ["member", "guest", "staff"];
const PRICING_AUDIENCES: PricingRuleAppliesTo[] = ["member", "guest"];
const PRICING_DAY_TYPES: PricingDayType[] = ["weekday", "weekend", "public_holiday"];
const PRICING_TIME_BANDS: PricingTimeBand[] = ["morning", "afternoon", "custom"];

function nowIso(): string {
  return new Date().toISOString();
}

function tempId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}`;
}

function formatJson(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed";
}

function emptyRuleDraft(): RuleDraft {
  return { type: "advance_window", configText: "{\n  \"days\": 14\n}", active: true };
}

function emptyRuleSetDraft(): RuleSetDraft {
  return {
    id: tempId("rule-set"),
    name: "",
    appliesTo: "member",
    priority: "10",
    active: true,
    rules: [emptyRuleDraft()],
  };
}

function emptyPricingRuleDraft(): PricingRuleDraft {
  return {
    appliesTo: "member",
    dayType: "weekday",
    timeBand: "morning",
    price: "0.00",
    currency: "ZAR",
    active: true,
  };
}

function emptyPricingMatrixDraft(): PricingMatrixDraft {
  return { id: tempId("pricing-matrix"), name: "", active: true, rules: [emptyPricingRuleDraft()] };
}

function toClubConfigDraft(config: ClubConfig): ClubConfigDraft {
  return {
    timezone: config.timezone,
    operatingHoursText: formatJson(config.operating_hours),
    bookingWindowDays: String(config.booking_window_days),
    cancellationPolicyHours: String(config.cancellation_policy_hours),
    defaultSlotIntervalMinutes: String(config.default_slot_interval_minutes),
  };
}

function toRuleSetDraft(ruleSet: BookingRuleSet): RuleSetDraft {
  return {
    id: ruleSet.id,
    name: ruleSet.name,
    appliesTo: ruleSet.applies_to,
    priority: String(ruleSet.priority),
    active: ruleSet.active,
    rules: ruleSet.rules.map((rule) => ({
      type: rule.type,
      configText: formatJson(rule.config),
      active: rule.active,
    })),
  };
}

function toPricingMatrixDraft(matrix: PricingMatrix): PricingMatrixDraft {
  return {
    id: matrix.id,
    name: matrix.name,
    active: matrix.active,
    rules: matrix.rules.map((rule) => ({
      appliesTo: rule.applies_to,
      dayType: rule.day_type,
      timeBand: rule.time_band,
      price: rule.price,
      currency: rule.currency,
      active: rule.active,
    })),
  };
}

function buildClubConfigInput(draft: ClubConfigDraft): ClubConfigInput {
  return {
    timezone: draft.timezone.trim(),
    operating_hours: JSON.parse(draft.operatingHoursText) as Record<string, unknown>,
    booking_window_days: Number(draft.bookingWindowDays),
    cancellation_policy_hours: Number(draft.cancellationPolicyHours),
    default_slot_interval_minutes: Number(draft.defaultSlotIntervalMinutes),
  };
}

function buildRuleSetInput(draft: RuleSetDraft): BookingRuleSetInput {
  return {
    name: draft.name.trim(),
    applies_to: draft.appliesTo,
    scope_type: "club",
    scope_ref_id: null,
    conflict_strategy: "first_match",
    applies_from: null,
    applies_until: null,
    priority: Number(draft.priority),
    active: draft.active,
    rules: draft.rules.map((rule) => ({
      type: rule.type,
      evaluation_order: 0,
      config: JSON.parse(rule.configText) as Record<string, unknown>,
      active: rule.active,
    })),
  };
}

function buildPricingMatrixInput(draft: PricingMatrixDraft): PricingMatrixInput {
  return {
    name: draft.name.trim(),
    active: draft.active,
    rules: draft.rules.map((rule) => ({
      applies_to: rule.appliesTo,
      day_type: rule.dayType,
      time_band: rule.timeBand,
      price: rule.price,
      currency: rule.currency.toUpperCase(),
      active: rule.active,
    })),
  };
}

export function AdminGolfSettingsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;

  const clubConfigQuery = useClubConfigQuery({ accessToken, selectedClubId });
  const coursesQuery = useCoursesQuery({ accessToken, selectedClubId });
  const teesQuery = useTeesQuery({ accessToken, selectedClubId });
  const ruleSetsQuery = useRuleSetsQuery({ accessToken, selectedClubId });
  const pricingQuery = usePricingMatricesQuery({ accessToken, selectedClubId });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [clubConfigDraft, setClubConfigDraft] = useState<ClubConfigDraft | null>(null);
  const [courseName, setCourseName] = useState("");
  const [courseHoles, setCourseHoles] = useState("18");
  const [teeDraft, setTeeDraft] = useState({
    courseId: "",
    name: "",
    gender: "",
    slopeRating: "113",
    courseRating: "72.0",
    colorCode: "#1b4d8f",
    active: true,
  });
  const [ruleSetDrafts, setRuleSetDrafts] = useState<RuleSetDraft[]>([]);
  const [newRuleSetDraft, setNewRuleSetDraft] = useState<RuleSetDraft>(emptyRuleSetDraft());
  const [pricingDrafts, setPricingDrafts] = useState<PricingMatrixDraft[]>([]);
  const [newPricingDraft, setNewPricingDraft] = useState<PricingMatrixDraft>(emptyPricingMatrixDraft());

  useEffect(() => {
    if (clubConfigQuery.data) {
      setClubConfigDraft(toClubConfigDraft(clubConfigQuery.data));
    }
  }, [clubConfigQuery.data]);

  useEffect(() => {
    if (coursesQuery.data?.length && !teeDraft.courseId) {
      setTeeDraft((current) => ({ ...current, courseId: coursesQuery.data?.[0]?.id ?? "" }));
    }
  }, [coursesQuery.data, teeDraft.courseId]);

  useEffect(() => {
    if (ruleSetsQuery.data) {
      setRuleSetDrafts(ruleSetsQuery.data.map(toRuleSetDraft));
    }
  }, [ruleSetsQuery.data]);

  useEffect(() => {
    if (pricingQuery.data) {
      setPricingDrafts(pricingQuery.data.map(toPricingMatrixDraft));
    }
  }, [pricingQuery.data]);

  const configMutation = useMutation({
    mutationFn: (payload: ClubConfigInput) =>
      updateClubConfig(payload, { accessToken: accessToken as string, selectedClubId: selectedClubId as string }),
    onMutate: async (payload) => {
      if (!selectedClubId) {
        return {};
      }
      const key = operationsKeys.clubConfig(selectedClubId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ClubConfig>(key);
      queryClient.setQueryData<ClubConfig>(key, {
        id: previous?.id ?? tempId("club-config"),
        club_id: selectedClubId,
        timezone: payload.timezone,
        operating_hours: payload.operating_hours,
        booking_window_days: payload.booking_window_days,
        cancellation_policy_hours: payload.cancellation_policy_hours,
        default_slot_interval_minutes: payload.default_slot_interval_minutes,
        created_at: previous?.created_at ?? nowIso(),
        updated_at: nowIso(),
      });
      return { previous };
    },
    onError: (error, _, context) => {
      if (selectedClubId) {
        queryClient.setQueryData(operationsKeys.clubConfig(selectedClubId), context?.previous);
      }
      setErrors((current) => ({ ...current, clubConfig: asMessage(error) }));
    },
    onSuccess: () => setErrors((current) => ({ ...current, clubConfig: "" })),
    onSettled: () => {
      if (selectedClubId) {
        void queryClient.invalidateQueries({ queryKey: operationsKeys.clubConfig(selectedClubId) });
      }
    },
  });

  const courseMutation = useMutation({
    mutationFn: (payload: { name: string; holes: number }) =>
      createCourse(
        { name: payload.name, holes: payload.holes, active: true },
        { accessToken: accessToken as string, selectedClubId: selectedClubId as string },
      ),
    onMutate: async (payload) => {
      if (!selectedClubId) {
        return {};
      }
      const key = operationsKeys.courses(selectedClubId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Course[]>(key) ?? [];
      queryClient.setQueryData(key, [
        ...previous,
        {
          id: tempId("course"),
          club_id: selectedClubId,
          name: payload.name,
          holes: payload.holes,
          active: true,
          created_at: nowIso(),
          updated_at: nowIso(),
        },
      ]);
      return { previous };
    },
    onError: (error, _, context) => {
      if (selectedClubId) {
        queryClient.setQueryData(operationsKeys.courses(selectedClubId), context?.previous);
      }
      setErrors((current) => ({ ...current, courses: asMessage(error) }));
    },
    onSuccess: () => {
      setCourseName("");
      setCourseHoles("18");
      setErrors((current) => ({ ...current, courses: "" }));
    },
    onSettled: () => {
      if (selectedClubId) {
        void queryClient.invalidateQueries({ queryKey: operationsKeys.courses(selectedClubId) });
      }
    },
  });

  const teeMutation = useMutation({
    mutationFn: (payload: typeof teeDraft) =>
      createTee(
        {
          course_id: payload.courseId,
          name: payload.name,
          gender: payload.gender || null,
          slope_rating: Number(payload.slopeRating),
          course_rating: payload.courseRating,
          color_code: payload.colorCode,
          active: payload.active,
        },
        { accessToken: accessToken as string, selectedClubId: selectedClubId as string },
      ),
    onMutate: async (payload) => {
      if (!selectedClubId) {
        return {};
      }
      const key = operationsKeys.tees(selectedClubId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Tee[]>(key) ?? [];
      const courseNameValue =
        (coursesQuery.data ?? []).find((course) => course.id === payload.courseId)?.name ?? "Course";
      queryClient.setQueryData(key, [
        ...previous,
        {
          id: tempId("tee"),
          course_id: payload.courseId,
          course_name: courseNameValue,
          name: payload.name,
          gender: payload.gender || null,
          slope_rating: Number(payload.slopeRating),
          course_rating: payload.courseRating,
          color_code: payload.colorCode,
          active: payload.active,
          created_at: nowIso(),
          updated_at: nowIso(),
        },
      ]);
      return { previous };
    },
    onError: (error, _, context) => {
      if (selectedClubId) {
        queryClient.setQueryData(operationsKeys.tees(selectedClubId), context?.previous);
      }
      setErrors((current) => ({ ...current, tees: asMessage(error) }));
    },
    onSuccess: () => {
      setTeeDraft((current) => ({ ...current, name: "", gender: "", slopeRating: "113", courseRating: "72.0" }));
      setErrors((current) => ({ ...current, tees: "" }));
    },
    onSettled: () => {
      if (selectedClubId) {
        void queryClient.invalidateQueries({ queryKey: operationsKeys.tees(selectedClubId) });
      }
    },
  });

  const ruleCreateMutation = useMutation({
    mutationFn: (draft: RuleSetDraft) =>
      createRuleSet(buildRuleSetInput(draft), {
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    onMutate: async (draft) => {
      if (!selectedClubId) {
        return {};
      }
      const key = operationsKeys.rules(selectedClubId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<BookingRuleSet[]>(key) ?? [];
      const payload = buildRuleSetInput(draft);
      queryClient.setQueryData(key, [
        ...previous,
        {
          id: tempId("rule-set"),
          club_id: selectedClubId,
          name: payload.name,
          applies_to: payload.applies_to,
          scope_type: payload.scope_type ?? "club",
          scope_ref_id: payload.scope_ref_id ?? null,
          conflict_strategy: payload.conflict_strategy ?? "first_match",
          applies_from: payload.applies_from ?? null,
          applies_until: payload.applies_until ?? null,
          priority: payload.priority,
          active: payload.active,
          rules: payload.rules.map((rule) => ({
            id: tempId("rule"),
            type: rule.type,
            evaluation_order: rule.evaluation_order ?? 0,
            config: rule.config,
            active: rule.active,
            created_at: nowIso(),
            updated_at: nowIso(),
          })),
          created_at: nowIso(),
          updated_at: nowIso(),
        },
      ]);
      return { previous };
    },
    onError: (error, _, context) => {
      if (selectedClubId) {
        queryClient.setQueryData(operationsKeys.rules(selectedClubId), context?.previous);
      }
      setErrors((current) => ({ ...current, rulesCreate: asMessage(error) }));
    },
    onSuccess: () => {
      setNewRuleSetDraft(emptyRuleSetDraft());
      setErrors((current) => ({ ...current, rulesCreate: "" }));
    },
    onSettled: () => {
      if (selectedClubId) {
        void queryClient.invalidateQueries({ queryKey: operationsKeys.rules(selectedClubId) });
      }
    },
  });

  const ruleUpdateMutation = useMutation({
    mutationFn: (draft: RuleSetDraft) =>
      updateRuleSet(draft.id, buildRuleSetInput(draft), {
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    onMutate: async (draft) => {
      if (!selectedClubId) {
        return {};
      }
      const key = operationsKeys.rules(selectedClubId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<BookingRuleSet[]>(key) ?? [];
      const payload = buildRuleSetInput(draft);
      queryClient.setQueryData(
        key,
        previous.map((item) =>
          item.id === draft.id
            ? {
                ...item,
                name: payload.name,
                applies_to: payload.applies_to,
                scope_type: payload.scope_type ?? "club",
                scope_ref_id: payload.scope_ref_id ?? null,
                conflict_strategy: payload.conflict_strategy ?? "first_match",
                applies_from: payload.applies_from ?? null,
                applies_until: payload.applies_until ?? null,
                priority: payload.priority,
                active: payload.active,
                rules: payload.rules.map((rule) => ({
                  id: tempId("rule"),
                  type: rule.type,
                  evaluation_order: rule.evaluation_order ?? 0,
                  config: rule.config,
                  active: rule.active,
                  created_at: nowIso(),
                  updated_at: nowIso(),
                })),
                updated_at: nowIso(),
              }
            : item,
        ),
      );
      return { previous };
    },
    onError: (error, _, context) => {
      if (selectedClubId) {
        queryClient.setQueryData(operationsKeys.rules(selectedClubId), context?.previous);
      }
      setErrors((current) => ({ ...current, rulesUpdate: asMessage(error) }));
    },
    onSuccess: () => setErrors((current) => ({ ...current, rulesUpdate: "" })),
    onSettled: () => {
      if (selectedClubId) {
        void queryClient.invalidateQueries({ queryKey: operationsKeys.rules(selectedClubId) });
      }
    },
  });

  const pricingCreateMutation = useMutation({
    mutationFn: (draft: PricingMatrixDraft) =>
      createPricingMatrix(buildPricingMatrixInput(draft), {
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    onMutate: async (draft) => {
      if (!selectedClubId) {
        return {};
      }
      const key = operationsKeys.pricing(selectedClubId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PricingMatrix[]>(key) ?? [];
      const payload = buildPricingMatrixInput(draft);
      queryClient.setQueryData(key, [
        ...previous,
        {
          id: tempId("pricing-matrix"),
          club_id: selectedClubId,
          name: payload.name,
          active: payload.active,
          rules: payload.rules.map((rule) => ({
            id: tempId("pricing-rule"),
            applies_to: rule.applies_to,
            day_type: rule.day_type,
            time_band: rule.time_band,
            price: rule.price,
            currency: rule.currency,
            active: rule.active,
            created_at: nowIso(),
            updated_at: nowIso(),
          })),
          created_at: nowIso(),
          updated_at: nowIso(),
        },
      ]);
      return { previous };
    },
    onError: (error, _, context) => {
      if (selectedClubId) {
        queryClient.setQueryData(operationsKeys.pricing(selectedClubId), context?.previous);
      }
      setErrors((current) => ({ ...current, pricingCreate: asMessage(error) }));
    },
    onSuccess: () => {
      setNewPricingDraft(emptyPricingMatrixDraft());
      setErrors((current) => ({ ...current, pricingCreate: "" }));
    },
    onSettled: () => {
      if (selectedClubId) {
        void queryClient.invalidateQueries({ queryKey: operationsKeys.pricing(selectedClubId) });
      }
    },
  });

  const pricingUpdateMutation = useMutation({
    mutationFn: (draft: PricingMatrixDraft) =>
      updatePricingMatrix(draft.id, buildPricingMatrixInput(draft), {
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    onMutate: async (draft) => {
      if (!selectedClubId) {
        return {};
      }
      const key = operationsKeys.pricing(selectedClubId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PricingMatrix[]>(key) ?? [];
      const payload = buildPricingMatrixInput(draft);
      queryClient.setQueryData(
        key,
        previous.map((item) =>
          item.id === draft.id
            ? {
                ...item,
                name: payload.name,
                active: payload.active,
                rules: payload.rules.map((rule) => ({
                  id: tempId("pricing-rule"),
                  applies_to: rule.applies_to,
                  day_type: rule.day_type,
                  time_band: rule.time_band,
                  price: rule.price,
                  currency: rule.currency,
                  active: rule.active,
                  created_at: nowIso(),
                  updated_at: nowIso(),
                })),
                updated_at: nowIso(),
              }
            : item,
        ),
      );
      return { previous };
    },
    onError: (error, _, context) => {
      if (selectedClubId) {
        queryClient.setQueryData(operationsKeys.pricing(selectedClubId), context?.previous);
      }
      setErrors((current) => ({ ...current, pricingUpdate: asMessage(error) }));
    },
    onSuccess: () => setErrors((current) => ({ ...current, pricingUpdate: "" })),
    onSettled: () => {
      if (selectedClubId) {
        void queryClient.invalidateQueries({ queryKey: operationsKeys.pricing(selectedClubId) });
      }
    },
  });

  if (!selectedClubId) {
    return (
      <AdminWorkspace
        title="Golf Settings"
        description="Operational rules remain club-scoped and require an active club selection."
      >
        <div className="rounded-2xl bg-surface-container-lowest p-6 shadow-sm">
          <p className="text-sm text-slate-500">Select an active club before loading operational rules.</p>
        </div>
      </AdminWorkspace>
    );
  }

  function saveClubConfig(): void {
    try {
      if (clubConfigDraft) {
        configMutation.mutate(buildClubConfigInput(clubConfigDraft));
      }
    } catch (error) {
      setErrors((current) => ({ ...current, clubConfig: asMessage(error) }));
    }
  }

  function saveRuleSet(draft: RuleSetDraft): void {
    try {
      buildRuleSetInput(draft);
      ruleUpdateMutation.mutate(draft);
    } catch (error) {
      setErrors((current) => ({ ...current, rulesUpdate: asMessage(error) }));
    }
  }

  return (
    <AdminWorkspace
      title="Golf Settings"
      description="Club-scoped configuration, course setup, booking rules, and pricing matrices."
      kpis={
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <div className="rounded-2xl bg-surface-container-low p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Courses</p>
            <p className="mt-2 font-headline text-3xl font-extrabold text-on-surface">
              {coursesQuery.data?.length ?? 0}
            </p>
          </div>
          <div className="rounded-2xl bg-surface-container-low p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Tees</p>
            <p className="mt-2 font-headline text-3xl font-extrabold text-on-surface">
              {teesQuery.data?.length ?? 0}
            </p>
          </div>
          <div className="rounded-2xl bg-surface-container-low p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Rule Sets</p>
            <p className="mt-2 font-headline text-3xl font-extrabold text-on-surface">
              {ruleSetsQuery.data?.length ?? 0}
            </p>
          </div>
          <div className="rounded-2xl bg-surface-container-low p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Price Matrices</p>
            <p className="mt-2 font-headline text-3xl font-extrabold text-on-surface">
              {pricingQuery.data?.length ?? 0}
            </p>
          </div>
        </div>
      }
    >
      <div className="space-y-6">

        {/* Club Config */}
        <section className="rounded-2xl bg-surface-container-lowest p-6 shadow-sm">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Club Config</p>
              <p className="mt-0.5 text-xs text-slate-500">Timezone, booking window, slot interval, and cancellation policy.</p>
            </div>
            <button
              className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
              onClick={saveClubConfig}
              type="button"
            >
              {configMutation.isPending ? "Saving..." : "Save config"}
            </button>
          </div>
          {clubConfigDraft ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldGroup label="Timezone">
                <input
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none"
                  value={clubConfigDraft.timezone}
                  onChange={(event) =>
                    setClubConfigDraft((current) => (current ? { ...current, timezone: event.target.value } : current))
                  }
                />
              </FieldGroup>
              <FieldGroup label="Booking window (days)">
                <input
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none"
                  type="number"
                  value={clubConfigDraft.bookingWindowDays}
                  onChange={(event) =>
                    setClubConfigDraft((current) =>
                      current ? { ...current, bookingWindowDays: event.target.value } : current,
                    )
                  }
                />
              </FieldGroup>
              <FieldGroup label="Cancellation policy (hours notice)">
                <input
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none"
                  type="number"
                  value={clubConfigDraft.cancellationPolicyHours}
                  onChange={(event) =>
                    setClubConfigDraft((current) =>
                      current ? { ...current, cancellationPolicyHours: event.target.value } : current,
                    )
                  }
                />
              </FieldGroup>
              <FieldGroup label="Slot interval (minutes)">
                <input
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none"
                  type="number"
                  value={clubConfigDraft.defaultSlotIntervalMinutes}
                  onChange={(event) =>
                    setClubConfigDraft((current) =>
                      current ? { ...current, defaultSlotIntervalMinutes: event.target.value } : current,
                    )
                  }
                />
              </FieldGroup>
              <div className="col-span-full">
                <FieldGroup label="Operating hours (JSON)">
                  <textarea
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-on-surface focus:border-primary focus:outline-none"
                    rows={8}
                    value={clubConfigDraft.operatingHoursText}
                    onChange={(event) =>
                      setClubConfigDraft((current) =>
                        current ? { ...current, operatingHoursText: event.target.value } : current,
                      )
                    }
                  />
                </FieldGroup>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">{clubConfigQuery.isLoading ? "Loading..." : "Club config unavailable."}</p>
          )}
          {errors.clubConfig ? <p className="mt-3 text-sm text-red-600">{errors.clubConfig}</p> : null}
        </section>

        {/* Courses & Tees */}
        <section className="rounded-2xl bg-surface-container-lowest p-6 shadow-sm">
          <div className="mb-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Courses &amp; Tees</p>
            <p className="mt-0.5 text-xs text-slate-500">Course and tee definitions used by the tee sheet and booking engine.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Add course panel */}
            <div className="rounded-xl bg-surface-container-low p-4">
              <p className="mb-3 text-sm font-semibold text-on-surface">Add course</p>
              <div className="space-y-3">
                <FieldGroup label="Course name">
                  <input
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none"
                    value={courseName}
                    onChange={(event) => setCourseName(event.target.value)}
                  />
                </FieldGroup>
                <FieldGroup label="Holes">
                  <select
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none"
                    value={courseHoles}
                    onChange={(event) => setCourseHoles(event.target.value)}
                  >
                    <option value="9">9</option>
                    <option value="18">18</option>
                  </select>
                </FieldGroup>
              </div>
              <button
                className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
                onClick={() => courseMutation.mutate({ name: courseName.trim(), holes: Number(courseHoles) })}
                type="button"
              >
                {courseMutation.isPending ? "Adding..." : "Add course"}
              </button>
              {errors.courses ? <p className="mt-2 text-sm text-red-600">{errors.courses}</p> : null}
              {(coursesQuery.data ?? []).length > 0 ? (
                <div className="mt-4 space-y-1 border-t border-slate-100 pt-4">
                  {(coursesQuery.data ?? []).map((course) => (
                    <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm" key={course.id}>
                      <span className="font-medium text-on-surface">{course.name}</span>
                      <span className="text-xs text-slate-400">{course.holes}h · {course.active ? "active" : "inactive"}</span>
                    </div>
                  ))}
                </div>
              ) : coursesQuery.isLoading ? (
                <p className="mt-3 text-xs text-slate-400">Loading courses...</p>
              ) : null}
            </div>

            {/* Add tee panel */}
            <div className="rounded-xl bg-surface-container-low p-4">
              <p className="mb-3 text-sm font-semibold text-on-surface">Add tee</p>
              <div className="space-y-3">
                <FieldGroup label="Course">
                  <select
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none"
                    value={teeDraft.courseId}
                    onChange={(event) => setTeeDraft((current) => ({ ...current, courseId: event.target.value }))}
                  >
                    {(coursesQuery.data ?? []).map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.name}
                      </option>
                    ))}
                  </select>
                </FieldGroup>
                <FieldGroup label="Tee name">
                  <input
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none"
                    value={teeDraft.name}
                    onChange={(event) => setTeeDraft((current) => ({ ...current, name: event.target.value }))}
                  />
                </FieldGroup>
                <FieldGroup label="Gender">
                  <input
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none"
                    value={teeDraft.gender}
                    onChange={(event) => setTeeDraft((current) => ({ ...current, gender: event.target.value }))}
                  />
                </FieldGroup>
                <FieldGroup label="Slope rating">
                  <input
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none"
                    type="number"
                    value={teeDraft.slopeRating}
                    onChange={(event) => setTeeDraft((current) => ({ ...current, slopeRating: event.target.value }))}
                  />
                </FieldGroup>
                <FieldGroup label="Course rating">
                  <input
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none"
                    value={teeDraft.courseRating}
                    onChange={(event) => setTeeDraft((current) => ({ ...current, courseRating: event.target.value }))}
                  />
                </FieldGroup>
                <FieldGroup label="Color code">
                  <input
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none"
                    value={teeDraft.colorCode}
                    onChange={(event) => setTeeDraft((current) => ({ ...current, colorCode: event.target.value }))}
                  />
                </FieldGroup>
              </div>
              <button
                className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
                onClick={() => teeMutation.mutate(teeDraft)}
                type="button"
              >
                {teeMutation.isPending ? "Adding..." : "Add tee"}
              </button>
              {errors.tees ? <p className="mt-2 text-sm text-red-600">{errors.tees}</p> : null}
              {(teesQuery.data ?? []).length > 0 ? (
                <div className="mt-4 space-y-1 border-t border-slate-100 pt-4">
                  {(teesQuery.data ?? []).map((tee) => (
                    <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm" key={tee.id}>
                      <span className="font-medium text-on-surface">{tee.course_name} · {tee.name}</span>
                      <span className="text-xs text-slate-400">slope {tee.slope_rating} · {tee.color_code}</span>
                    </div>
                  ))}
                </div>
              ) : teesQuery.isLoading ? (
                <p className="mt-3 text-xs text-slate-400">Loading tees...</p>
              ) : null}
            </div>
          </div>
        </section>

        {/* Booking Rules */}
        <section className="rounded-2xl bg-surface-container-lowest p-6 shadow-sm">
          <div className="mb-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Booking Rules</p>
            <p className="mt-0.5 text-xs text-slate-500">Priority-based rule sets evaluated by the booking engine.</p>
          </div>
          <div className="rounded-xl bg-surface-container-low p-4">
            <p className="mb-3 text-sm font-semibold text-on-surface">New rule set</p>
            <RuleSetEditor draft={newRuleSetDraft} onChange={setNewRuleSetDraft} />
            <button
              className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
              onClick={() => {
                try {
                  buildRuleSetInput(newRuleSetDraft);
                  ruleCreateMutation.mutate(newRuleSetDraft);
                } catch (error) {
                  setErrors((current) => ({ ...current, rulesCreate: asMessage(error) }));
                }
              }}
              type="button"
            >
              {ruleCreateMutation.isPending ? "Adding..." : "Add rule set"}
            </button>
            {errors.rulesCreate ? <p className="mt-2 text-sm text-red-600">{errors.rulesCreate}</p> : null}
          </div>
          {ruleSetDrafts.length > 0 ? (
            <div className="mt-4 space-y-3">
              {ruleSetDrafts.map((draft, index) => (
                <div className="rounded-xl border border-slate-100 bg-white p-4" key={draft.id}>
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-on-surface">Rule set {index + 1}</p>
                    <button
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                      onClick={() => saveRuleSet(draft)}
                      type="button"
                    >
                      {ruleUpdateMutation.isPending ? "Saving..." : "Save"}
                    </button>
                  </div>
                  <RuleSetEditor
                    draft={draft}
                    onChange={(nextDraft) =>
                      setRuleSetDrafts((current) => current.map((item) => (item.id === draft.id ? nextDraft : item)))
                    }
                  />
                </div>
              ))}
            </div>
          ) : ruleSetsQuery.isLoading ? (
            <p className="mt-3 text-xs text-slate-400">Loading booking rules...</p>
          ) : null}
          {errors.rulesUpdate ? <p className="mt-3 text-sm text-red-600">{errors.rulesUpdate}</p> : null}
        </section>

        {/* Pricing Matrices */}
        <section className="rounded-2xl bg-surface-container-lowest p-6 shadow-sm">
          <div className="mb-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Pricing Matrices</p>
            <p className="mt-0.5 text-xs text-slate-500">Definitional rate matrices applied by audience, day type, and time band.</p>
          </div>
          <div className="rounded-xl bg-surface-container-low p-4">
            <p className="mb-3 text-sm font-semibold text-on-surface">New pricing matrix</p>
            <PricingMatrixEditor draft={newPricingDraft} onChange={setNewPricingDraft} />
            <button
              className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
              onClick={() => pricingCreateMutation.mutate(newPricingDraft)}
              type="button"
            >
              {pricingCreateMutation.isPending ? "Adding..." : "Add matrix"}
            </button>
            {errors.pricingCreate ? <p className="mt-2 text-sm text-red-600">{errors.pricingCreate}</p> : null}
          </div>
          {pricingDrafts.length > 0 ? (
            <div className="mt-4 space-y-3">
              {pricingDrafts.map((draft, index) => (
                <div className="rounded-xl border border-slate-100 bg-white p-4" key={draft.id}>
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-on-surface">Matrix {index + 1}</p>
                    <button
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                      onClick={() => pricingUpdateMutation.mutate(draft)}
                      type="button"
                    >
                      {pricingUpdateMutation.isPending ? "Saving..." : "Save"}
                    </button>
                  </div>
                  <PricingMatrixEditor
                    draft={draft}
                    onChange={(nextDraft) =>
                      setPricingDrafts((current) => current.map((item) => (item.id === draft.id ? nextDraft : item)))
                    }
                  />
                </div>
              ))}
            </div>
          ) : pricingQuery.isLoading ? (
            <p className="mt-3 text-xs text-slate-400">Loading pricing matrices...</p>
          ) : null}
          {errors.pricingUpdate ? <p className="mt-3 text-sm text-red-600">{errors.pricingUpdate}</p> : null}
        </section>

      </div>
    </AdminWorkspace>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-slate-600">{label}</p>
      {children}
    </div>
  );
}

function RuleSetEditor({
  draft,
  onChange,
}: {
  draft: RuleSetDraft;
  onChange: (nextDraft: RuleSetDraft) => void;
}): JSX.Element {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <FieldGroup label="Name">
          <input
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none"
            value={draft.name}
            onChange={(event) => onChange({ ...draft, name: event.target.value })}
          />
        </FieldGroup>
        <FieldGroup label="Applies to">
          <select
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none"
            value={draft.appliesTo}
            onChange={(event) => onChange({ ...draft, appliesTo: event.target.value as BookingRuleAppliesTo })}
          >
            {RULE_AUDIENCES.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </FieldGroup>
        <FieldGroup label="Priority">
          <input
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none"
            type="number"
            value={draft.priority}
            onChange={(event) => onChange({ ...draft, priority: event.target.value })}
          />
        </FieldGroup>
      </div>
      {draft.rules.map((rule, index) => (
        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 space-y-3" key={`${draft.id}-${index}`}>
          <FieldGroup label="Rule type">
            <select
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none"
              value={rule.type}
              onChange={(event) =>
                onChange({
                  ...draft,
                  rules: draft.rules.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, type: event.target.value as BookingRuleType } : item,
                  ),
                })
              }
            >
              {RULE_TYPES.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </FieldGroup>
          <FieldGroup label="Rule config (JSON)">
            <textarea
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-on-surface focus:border-primary focus:outline-none"
              rows={5}
              value={rule.configText}
              onChange={(event) =>
                onChange({
                  ...draft,
                  rules: draft.rules.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, configText: event.target.value } : item,
                  ),
                })
              }
            />
          </FieldGroup>
        </div>
      ))}
      <button
        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
        onClick={() => onChange({ ...draft, rules: [...draft.rules, emptyRuleDraft()] })}
        type="button"
      >
        Add rule
      </button>
    </div>
  );
}

function PricingMatrixEditor({
  draft,
  onChange,
}: {
  draft: PricingMatrixDraft;
  onChange: (nextDraft: PricingMatrixDraft) => void;
}): JSX.Element {
  return (
    <div className="space-y-4">
      <FieldGroup label="Name">
        <input
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none"
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
        />
      </FieldGroup>
      {draft.rules.map((rule, index) => (
        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3" key={`${draft.id}-${index}`}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <FieldGroup label="Applies to">
              <select
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none"
                value={rule.appliesTo}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    rules: draft.rules.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, appliesTo: event.target.value as PricingRuleAppliesTo } : item,
                    ),
                  })
                }
              >
                {PRICING_AUDIENCES.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </FieldGroup>
            <FieldGroup label="Day type">
              <select
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none"
                value={rule.dayType}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    rules: draft.rules.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, dayType: event.target.value as PricingDayType } : item,
                    ),
                  })
                }
              >
                {PRICING_DAY_TYPES.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </FieldGroup>
            <FieldGroup label="Time band">
              <select
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none"
                value={rule.timeBand}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    rules: draft.rules.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, timeBand: event.target.value as PricingTimeBand } : item,
                    ),
                  })
                }
              >
                {PRICING_TIME_BANDS.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </FieldGroup>
            <FieldGroup label="Price">
              <input
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none"
                value={rule.price}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    rules: draft.rules.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, price: event.target.value } : item,
                    ),
                  })
                }
              />
            </FieldGroup>
            <FieldGroup label="Currency">
              <input
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none"
                value={rule.currency}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    rules: draft.rules.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, currency: event.target.value.toUpperCase() } : item,
                    ),
                  })
                }
              />
            </FieldGroup>
          </div>
        </div>
      ))}
      <button
        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
        onClick={() => onChange({ ...draft, rules: [...draft.rules, emptyPricingRuleDraft()] })}
        type="button"
      >
        Add pricing rule
      </button>
    </div>
  );
}
