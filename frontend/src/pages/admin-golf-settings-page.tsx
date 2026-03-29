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
      <section className="admin-card">
        <p className="eyebrow">Golf Settings</p>
        <h1>Club context required</h1>
        <p className="muted">Select an active club before loading operational rules.</p>
      </section>
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
    <div className="admin-content-stack">
      <section className="admin-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Operational Rules Foundation</p>
            <h1>Golf settings</h1>
          </div>
          <p className="muted">All records are club-scoped and tied to the selected club context.</p>
        </div>
      </section>

      <section className="admin-card">
        <div className="section-heading">
          <div>
            <h2>Club Config</h2>
            <p className="muted">Central configuration used by future rule evaluation.</p>
          </div>
          <button className="primary-button" onClick={saveClubConfig} type="button">
            {configMutation.isPending ? "Saving..." : "Save config"}
          </button>
        </div>
        {clubConfigDraft ? (
          <div className="form-grid form-grid-wide">
            <label>
              Timezone
              <input
                value={clubConfigDraft.timezone}
                onChange={(event) =>
                  setClubConfigDraft((current) => (current ? { ...current, timezone: event.target.value } : current))
                }
              />
            </label>
            <label>
              Booking window days
              <input
                type="number"
                value={clubConfigDraft.bookingWindowDays}
                onChange={(event) =>
                  setClubConfigDraft((current) =>
                    current ? { ...current, bookingWindowDays: event.target.value } : current,
                  )
                }
              />
            </label>
            <label>
              Cancellation policy hours
              <input
                type="number"
                value={clubConfigDraft.cancellationPolicyHours}
                onChange={(event) =>
                  setClubConfigDraft((current) =>
                    current ? { ...current, cancellationPolicyHours: event.target.value } : current,
                  )
                }
              />
            </label>
            <label>
              Slot interval minutes
              <input
                type="number"
                value={clubConfigDraft.defaultSlotIntervalMinutes}
                onChange={(event) =>
                  setClubConfigDraft((current) =>
                    current ? { ...current, defaultSlotIntervalMinutes: event.target.value } : current,
                  )
                }
              />
            </label>
            <label className="form-span-full">
              Operating hours JSON
              <textarea
                rows={10}
                value={clubConfigDraft.operatingHoursText}
                onChange={(event) =>
                  setClubConfigDraft((current) =>
                    current ? { ...current, operatingHoursText: event.target.value } : current,
                  )
                }
              />
            </label>
          </div>
        ) : (
          <p className="muted">{clubConfigQuery.isLoading ? "Loading club config..." : "Club config unavailable."}</p>
        )}
        {errors.clubConfig ? <p className="error-text">{errors.clubConfig}</p> : null}
      </section>

      <section className="admin-card">
        <div className="section-heading">
          <div>
            <h2>Courses &amp; Tees</h2>
            <p className="muted">Course and tee definitions only. No booking logic yet.</p>
          </div>
        </div>
        <div className="dual-column">
          <div className="tonal-panel">
            <h3>Add course</h3>
            <div className="form-grid">
              <label>
                Course name
                <input value={courseName} onChange={(event) => setCourseName(event.target.value)} />
              </label>
              <label>
                Holes
                <select value={courseHoles} onChange={(event) => setCourseHoles(event.target.value)}>
                  <option value="9">9</option>
                  <option value="18">18</option>
                </select>
              </label>
            </div>
            <button
              className="primary-button"
              onClick={() => courseMutation.mutate({ name: courseName.trim(), holes: Number(courseHoles) })}
              type="button"
            >
              {courseMutation.isPending ? "Adding..." : "Add course"}
            </button>
            {errors.courses ? <p className="error-text">{errors.courses}</p> : null}
            <div className="compact-list">
              {(coursesQuery.data ?? []).map((course) => (
                <article className="list-row" key={course.id}>
                  <strong>{course.name}</strong>
                  <span className="muted">
                    {course.holes} holes · {course.active ? "active" : "inactive"}
                  </span>
                </article>
              ))}
              {coursesQuery.isLoading ? <p className="muted">Loading courses...</p> : null}
            </div>
          </div>
          <div className="tonal-panel">
            <h3>Add tee</h3>
            <div className="form-grid">
              <label>
                Course
                <select
                  value={teeDraft.courseId}
                  onChange={(event) => setTeeDraft((current) => ({ ...current, courseId: event.target.value }))}
                >
                  {(coursesQuery.data ?? []).map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tee name
                <input
                  value={teeDraft.name}
                  onChange={(event) => setTeeDraft((current) => ({ ...current, name: event.target.value }))}
                />
              </label>
              <label>
                Gender
                <input
                  value={teeDraft.gender}
                  onChange={(event) => setTeeDraft((current) => ({ ...current, gender: event.target.value }))}
                />
              </label>
              <label>
                Slope rating
                <input
                  type="number"
                  value={teeDraft.slopeRating}
                  onChange={(event) => setTeeDraft((current) => ({ ...current, slopeRating: event.target.value }))}
                />
              </label>
              <label>
                Course rating
                <input
                  value={teeDraft.courseRating}
                  onChange={(event) => setTeeDraft((current) => ({ ...current, courseRating: event.target.value }))}
                />
              </label>
              <label>
                Color code
                <input
                  value={teeDraft.colorCode}
                  onChange={(event) => setTeeDraft((current) => ({ ...current, colorCode: event.target.value }))}
                />
              </label>
            </div>
            <button className="primary-button" onClick={() => teeMutation.mutate(teeDraft)} type="button">
              {teeMutation.isPending ? "Adding..." : "Add tee"}
            </button>
            {errors.tees ? <p className="error-text">{errors.tees}</p> : null}
            <div className="compact-list">
              {(teesQuery.data ?? []).map((tee) => (
                <article className="list-row" key={tee.id}>
                  <strong>
                    {tee.course_name} · {tee.name}
                  </strong>
                  <span className="muted">
                    {tee.color_code} · slope {tee.slope_rating} · rating {tee.course_rating}
                  </span>
                </article>
              ))}
              {teesQuery.isLoading ? <p className="muted">Loading tees...</p> : null}
            </div>
          </div>
        </div>
      </section>

      <section className="admin-card">
        <div className="section-heading">
          <div>
            <h2>Booking Rules</h2>
            <p className="muted">Priority-based rulesets with deferred execution.</p>
          </div>
        </div>
        <div className="tonal-panel">
          <h3>New ruleset</h3>
          <RuleSetEditor draft={newRuleSetDraft} onChange={setNewRuleSetDraft} />
          <button
            className="primary-button"
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
            {ruleCreateMutation.isPending ? "Adding..." : "Add ruleset"}
          </button>
          {errors.rulesCreate ? <p className="error-text">{errors.rulesCreate}</p> : null}
        </div>
        <div className="stack-list">
          {ruleSetDrafts.map((draft, index) => (
            <div className="tonal-panel" key={draft.id}>
              <div className="section-heading">
                <h3>Ruleset {index + 1}</h3>
                <button className="secondary-button" onClick={() => saveRuleSet(draft)} type="button">
                  {ruleUpdateMutation.isPending ? "Saving..." : "Save ruleset"}
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
          {ruleSetsQuery.isLoading ? <p className="muted">Loading booking rules...</p> : null}
        </div>
        {errors.rulesUpdate ? <p className="error-text">{errors.rulesUpdate}</p> : null}
      </section>

      <section className="admin-card">
        <div className="section-heading">
          <div>
            <h2>Pricing</h2>
            <p className="muted">Definitional pricing matrices without billing execution.</p>
          </div>
        </div>
        <div className="tonal-panel">
          <h3>New pricing matrix</h3>
          <PricingMatrixEditor draft={newPricingDraft} onChange={setNewPricingDraft} />
          <button className="primary-button" onClick={() => pricingCreateMutation.mutate(newPricingDraft)} type="button">
            {pricingCreateMutation.isPending ? "Adding..." : "Add matrix"}
          </button>
          {errors.pricingCreate ? <p className="error-text">{errors.pricingCreate}</p> : null}
        </div>
        <div className="stack-list">
          {pricingDrafts.map((draft, index) => (
            <div className="tonal-panel" key={draft.id}>
              <div className="section-heading">
                <h3>Matrix {index + 1}</h3>
                <button
                  className="secondary-button"
                  onClick={() => pricingUpdateMutation.mutate(draft)}
                  type="button"
                >
                  {pricingUpdateMutation.isPending ? "Saving..." : "Save matrix"}
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
          {pricingQuery.isLoading ? <p className="muted">Loading pricing matrices...</p> : null}
        </div>
        {errors.pricingUpdate ? <p className="error-text">{errors.pricingUpdate}</p> : null}
      </section>
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
    <div className="stack-list">
      <div className="form-grid">
        <label>
          Name
          <input value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} />
        </label>
        <label>
          Applies to
          <select
            value={draft.appliesTo}
            onChange={(event) => onChange({ ...draft, appliesTo: event.target.value as BookingRuleAppliesTo })}
          >
            {RULE_AUDIENCES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          Priority
          <input
            type="number"
            value={draft.priority}
            onChange={(event) => onChange({ ...draft, priority: event.target.value })}
          />
        </label>
      </div>
      {draft.rules.map((rule, index) => (
        <div className="sub-card" key={`${draft.id}-${index}`}>
          <div className="form-grid">
            <label>
              Rule type
              <select
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
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="form-span-full">
            Rule config JSON
            <textarea
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
          </label>
        </div>
      ))}
      <button
        className="secondary-button"
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
    <div className="stack-list">
      <div className="form-grid">
        <label>
          Name
          <input value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} />
        </label>
      </div>
      {draft.rules.map((rule, index) => (
        <div className="sub-card" key={`${draft.id}-${index}`}>
          <div className="form-grid">
            <label>
              Applies to
              <select
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
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Day type
              <select
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
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Time band
              <select
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
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Price
              <input
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
            </label>
            <label>
              Currency
              <input
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
            </label>
          </div>
        </div>
      ))}
      <button
        className="secondary-button"
        onClick={() => onChange({ ...draft, rules: [...draft.rules, emptyPricingRuleDraft()] })}
        type="button"
      >
        Add pricing rule
      </button>
    </div>
  );
}
