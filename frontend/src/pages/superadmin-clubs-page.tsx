import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";

import { MaterialSymbol } from "../components/benchmark/material-symbol";
import { usePricingMatricesQuery, useRuleSetsQuery } from "../features/golf-settings/hooks";
import type { SuperadminLayoutContext } from "../routes/superadmin-layout";
import {
  useAssignSuperadminClubUserMutation,
  useCreateSuperadminClubMutation,
  useSuperadminAssignmentCandidatesQuery,
  useSuperadminClubOnboardingQuery,
  useSuperadminClubsQuery,
  useUpdateSuperadminClubOnboardingMutation,
} from "../features/superadmin/hooks";
import { useSession } from "../session/session-context";
import type {
  ClubOnboardingStep,
  ClubRegistryStatus,
  SuperadminOnboardingAction,
  SuperadminClubCreateInput,
  SuperadminClubSummary,
} from "../types/superadmin";

type NoticeTone = "success" | "error" | "info";

const STEP_ORDER: ClubOnboardingStep[] = ["basic_info", "finance", "rules", "modules"];
const MODULE_CATALOG = ["communications", "finance", "golf", "pos"] as const;

function emptyClubForm(): SuperadminClubCreateInput {
  return {
    name: "",
    location: "",
    timezone: "Africa/Johannesburg",
  };
}

function formatStepLabel(step: ClubOnboardingStep): string {
  return step.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusBadgeClass(status: ClubRegistryStatus): string {
  if (status === "active") return "bg-primary-container text-on-primary-container";
  if (status === "paused") return "bg-error-container/40 text-on-error-container";
  return "bg-surface-container-high text-on-surface-variant";
}

function noticeClass(tone: NoticeTone): string {
  if (tone === "error") return "bg-error-container/45 text-on-error-container";
  if (tone === "success") return "bg-primary-container/45 text-on-primary-container";
  return "bg-secondary-container/55 text-on-secondary-container";
}

function stepAccent(status: "complete" | "current" | "upcoming", ready: boolean): string {
  if (status === "complete") return "bg-primary";
  if (status === "current") return ready ? "bg-primary" : "bg-secondary";
  return "bg-surface-container-highest";
}

function stepLabelClass(status: "complete" | "current" | "upcoming"): string {
  if (status === "current" || status === "complete") return "text-on-surface";
  return "text-slate-400";
}

function currentStepDescription(step: ClubOnboardingStep): { title: string; body: string; icon: string } {
  if (step === "basic_info") {
    return {
      title: "Basic Info",
      body: "Set the club identity and base timezone that will feed the operational environment.",
      icon: "domain",
    };
  }
  if (step === "finance") {
    return {
      title: "Finance",
      body: "Link the club to an existing accounting export profile without duplicating finance configuration.",
      icon: "account_balance",
    };
  }
  if (step === "rules") {
    return {
      title: "Rules",
      body: "Review readiness for booking rules and pricing matrices. Full rule configuration remains in the next slice.",
      icon: "rule_settings",
    };
  }
  return {
    title: "Modules",
    body: "Confirm the module footprint that the club environment will expose at go-live.",
    icon: "widgets",
  };
}

export function SuperadminClubsPage(): JSX.Element {
  const { accessToken, bootstrap, setSelectedClub } = useSession();
  const { search } = useOutletContext<SuperadminLayoutContext>();
  const [selectedClubId, setSelectedClubId] = useState<string | null>(bootstrap?.selected_club_id ?? null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [clubForm, setClubForm] = useState<SuperadminClubCreateInput>(emptyClubForm);
  const [basicInfoForm, setBasicInfoForm] = useState<SuperadminClubCreateInput>(emptyClubForm);
  const [financeProfileId, setFinanceProfileId] = useState<string | null>(null);
  const [enabledModuleKeys, setEnabledModuleKeys] = useState<string[]>([]);
  const [assignmentQuery, setAssignmentQuery] = useState("");
  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);

  const clubsQuery = useSuperadminClubsQuery({ accessToken });
  const onboardingQuery = useSuperadminClubOnboardingQuery({ accessToken, clubId: selectedClubId });
  const ruleSetsQuery = useRuleSetsQuery({ accessToken, selectedClubId });
  const pricingMatricesQuery = usePricingMatricesQuery({ accessToken, selectedClubId });
  const assignmentCandidatesQuery = useSuperadminAssignmentCandidatesQuery({
    accessToken,
    clubId: selectedClubId,
    query: assignmentQuery,
  });
  const createClubMutation = useCreateSuperadminClubMutation();
  const updateOnboardingMutation = useUpdateSuperadminClubOnboardingMutation();
  const assignClubUserMutation = useAssignSuperadminClubUserMutation();

  const clubs = clubsQuery.data?.items ?? [];
  const filteredClubs = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return clubs;
    return clubs.filter((club) =>
      [club.name, club.location, club.slug].some((value) => value.toLowerCase().includes(query)),
    );
  }, [clubs, search]);
  const selectedClub = onboardingQuery.data?.club;

  useEffect(() => {
    if (clubs.length === 0) {
      setSelectedClubId(null);
      return;
    }
    if (selectedClubId && clubs.some((club) => club.id === selectedClubId)) {
      return;
    }
    if (bootstrap?.selected_club_id && clubs.some((club) => club.id === bootstrap.selected_club_id)) {
      setSelectedClubId(bootstrap.selected_club_id);
      return;
    }
    setSelectedClubId(clubs[0].id);
  }, [bootstrap?.selected_club_id, clubs, selectedClubId]);

  useEffect(() => {
    if (!onboardingQuery.data) return;
    setBasicInfoForm({
      name: onboardingQuery.data.club.name,
      location: onboardingQuery.data.club.location,
      timezone: onboardingQuery.data.club.timezone,
    });
    setFinanceProfileId(onboardingQuery.data.finance.selected_accounting_profile_id);
    setEnabledModuleKeys(onboardingQuery.data.modules.enabled_module_keys);
  }, [onboardingQuery.data]);

  const currentStep = onboardingQuery.data?.club.onboarding_current_step ?? "basic_info";
  const currentStepIndex = STEP_ORDER.indexOf(currentStep);
  const stepMeta = currentStepDescription(currentStep);

  async function persistStep(action: SuperadminOnboardingAction): Promise<void> {
    if (!selectedClubId) return;
    const payload: {
      action: SuperadminOnboardingAction;
      acted_step: ClubOnboardingStep;
      name?: string;
      location?: string;
      timezone?: string;
      preferred_accounting_profile_id?: string | null;
      enabled_module_keys?: string[] | null;
    } = {
      action,
      acted_step: currentStep,
    };
    if (currentStep === "basic_info") {
      payload.name = basicInfoForm.name.trim();
      payload.location = basicInfoForm.location.trim();
      payload.timezone = basicInfoForm.timezone.trim();
    }
    if (currentStep === "finance") {
      payload.preferred_accounting_profile_id = financeProfileId;
    }
    if (currentStep === "modules") {
      payload.enabled_module_keys = enabledModuleKeys;
    }

    try {
      const result = await updateOnboardingMutation.mutateAsync({ clubId: selectedClubId, payload });
      setNotice({
        tone: "success",
        message:
          action === "save_draft"
            ? "Onboarding draft saved."
            : action === "complete_step"
              ? result.club.onboarding_current_step === currentStep
                ? `${formatStepLabel(currentStep)} completed.`
                : `${formatStepLabel(result.club.onboarding_current_step)} is now the current onboarding step.`
              : `Returned to ${formatStepLabel(result.club.onboarding_current_step)}.`,
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to save onboarding progress.",
      });
    }
  }

  async function handleCreateClub(): Promise<void> {
    setNotice(null);
    try {
      const club = await createClubMutation.mutateAsync({
        name: clubForm.name.trim(),
        location: clubForm.location.trim(),
        timezone: clubForm.timezone.trim(),
      });
      setIsCreateOpen(false);
      setClubForm(emptyClubForm());
      setSelectedClubId(club.id);
      await setSelectedClub(club.id);
      setNotice({ tone: "success", message: `${club.name} created and onboarding started.` });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to create club.",
      });
    }
  }

  async function handleSelectClub(club: SuperadminClubSummary): Promise<void> {
    setSelectedClubId(club.id);
    try {
      await setSelectedClub(club.id);
    } catch {
      // Keep the local workspace responsive even if bootstrap refresh lags.
    }
  }

  async function handleAssignUser(personId: string, role: "club_admin" | "club_staff"): Promise<void> {
    if (!selectedClubId) return;
    setNotice(null);
    try {
      await assignClubUserMutation.mutateAsync({
        clubId: selectedClubId,
        payload: { person_id: personId, role },
      });
      setAssignmentQuery("");
      setNotice({
        tone: "success",
        message: role === "club_admin" ? "Club admin assigned." : "Staff user assigned.",
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to assign user.",
      });
    }
  }

  function toggleModule(moduleKey: string): void {
    setEnabledModuleKeys((current) =>
      current.includes(moduleKey) ? current.filter((item) => item !== moduleKey) : [...current, moduleKey].sort(),
    );
  }

  const activeRuleSets = (ruleSetsQuery.data ?? []).filter((item) => item.active);
  const activePricingMatrices = (pricingMatricesQuery.data ?? []).filter((item) => item.active);

  function renderStepBody(): JSX.Element | null {
    if (!onboardingQuery.data) return null;

    if (currentStep === "basic_info") {
      return (
        <div className="grid gap-5 md:grid-cols-2">
          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Club Name
            <input
              className="rounded-2xl bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none focus:bg-white"
              onChange={(event) => setBasicInfoForm((current) => ({ ...current, name: event.target.value }))}
              type="text"
              value={basicInfoForm.name}
            />
          </label>
          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Timezone
            <input
              className="rounded-2xl bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none focus:bg-white"
              onChange={(event) => setBasicInfoForm((current) => ({ ...current, timezone: event.target.value }))}
              type="text"
              value={basicInfoForm.timezone}
            />
          </label>
          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 md:col-span-2">
            Location
            <input
              className="rounded-2xl bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none focus:bg-white"
              onChange={(event) => setBasicInfoForm((current) => ({ ...current, location: event.target.value }))}
              type="text"
              value={basicInfoForm.location}
            />
          </label>
          <div className="rounded-2xl bg-surface-container-low px-5 py-4 md:col-span-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">System Linkage</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              These values write directly to the club record and club config that admin and staff will operate after go-live.
            </p>
          </div>
        </div>
      );
    }

    if (currentStep === "finance") {
      return (
        <div className="space-y-5">
          <div className="rounded-2xl bg-surface-container-low px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Finance Readiness</p>
            <div className="mt-3 grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-sm font-semibold text-on-surface">{onboardingQuery.data.finance.profile_count}</p>
                <p className="text-xs text-slate-500">Accounting profiles available</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-on-surface">{onboardingQuery.data.finance.active_profile_count}</p>
                <p className="text-xs text-slate-500">Active profiles ready</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-on-surface">
                  {onboardingQuery.data.finance.setup_complete ? "Ready" : "Pending"}
                </p>
                <p className="text-xs text-slate-500">Finance setup state</p>
              </div>
            </div>
          </div>
          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Accounting Profile
            <select
              className="rounded-2xl bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none focus:bg-white"
              onChange={(event) => setFinanceProfileId(event.target.value || null)}
              value={financeProfileId ?? ""}
            >
              <option value="">Select an accounting profile</option>
              {onboardingQuery.data.finance.profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name} ({profile.target_system.replace(/_/g, " ")})
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            {onboardingQuery.data.finance.profiles.map((profile) => (
              <div
                key={profile.id}
                className={`rounded-2xl px-5 py-4 ${
                  financeProfileId === profile.id ? "bg-primary-container/45" : "bg-surface-container-low"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-on-surface">{profile.name}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
                      {profile.target_system.replace(/_/g, " ")}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                      profile.is_active
                        ? "bg-primary-container text-on-primary-container"
                        : "bg-surface-container-high text-on-surface-variant"
                    }`}
                  >
                    {profile.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  {financeProfileId === profile.id ? "Selected for onboarding." : "Available for finance linkage."}
                </p>
              </div>
            ))}
          </div>
          {onboardingQuery.data.finance.profiles.length === 0 ? (
            <div className="rounded-2xl bg-surface-container-low px-5 py-4 text-sm text-slate-500">
              No accounting profiles exist for this club yet. Build them in Finance, then return here to select the live mapping profile.
            </div>
          ) : null}
        </div>
      );
    }

    if (currentStep === "rules") {
      return (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-surface-container-low px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Rule Sets</p>
              <p className="mt-3 text-2xl font-extrabold text-on-surface">{ruleSetsQuery.data?.length ?? 0}</p>
              <p className="mt-2 text-sm text-slate-500">{activeRuleSets.length} active rule sets ready for evaluation.</p>
            </div>
            <div className="rounded-2xl bg-surface-container-low px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Pricing Matrices</p>
              <p className="mt-3 text-2xl font-extrabold text-on-surface">{pricingMatricesQuery.data?.length ?? 0}</p>
              <p className="mt-2 text-sm text-slate-500">
                {activePricingMatrices.length} active pricing matrices available for rollout.
              </p>
            </div>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Rule Set Detail</p>
                {ruleSetsQuery.isLoading ? <span className="text-xs text-slate-400">Loading...</span> : null}
              </div>
              {(ruleSetsQuery.data ?? []).map((ruleSet) => (
                <div key={ruleSet.id} className="rounded-2xl bg-surface-container-low px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-on-surface">{ruleSet.name}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
                        {ruleSet.applies_to} · priority {ruleSet.priority}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                        ruleSet.active
                          ? "bg-primary-container text-on-primary-container"
                          : "bg-surface-container-high text-on-surface-variant"
                      }`}
                    >
                      {ruleSet.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-500">{ruleSet.rules.length} rules in this set.</p>
                </div>
              ))}
              {!ruleSetsQuery.isLoading && (ruleSetsQuery.data?.length ?? 0) === 0 ? (
                <div className="rounded-2xl bg-surface-container-low px-5 py-4 text-sm text-slate-500">
                  No booking rule sets exist for this club yet.
                </div>
              ) : null}
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Pricing Detail</p>
                {pricingMatricesQuery.isLoading ? <span className="text-xs text-slate-400">Loading...</span> : null}
              </div>
              {(pricingMatricesQuery.data ?? []).map((matrix) => (
                <div key={matrix.id} className="rounded-2xl bg-surface-container-low px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-on-surface">{matrix.name}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
                        {matrix.rules.length} pricing rules
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                        matrix.active
                          ? "bg-primary-container text-on-primary-container"
                          : "bg-surface-container-high text-on-surface-variant"
                      }`}
                    >
                      {matrix.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>
              ))}
              {!pricingMatricesQuery.isLoading && (pricingMatricesQuery.data?.length ?? 0) === 0 ? (
                <div className="rounded-2xl bg-surface-container-low px-5 py-4 text-sm text-slate-500">
                  No pricing matrices exist for this club yet.
                </div>
              ) : null}
            </div>
          </div>
          <div className="rounded-2xl bg-surface-container-low px-5 py-4">
            <p className="text-sm font-semibold text-on-surface">Rules readiness now reflects live club data.</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              This step reads the real club-scoped rules and pricing records that the golf operations layer already uses.
              It does not duplicate configuration into a separate onboarding store.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="rounded-2xl bg-surface-container-low px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Enabled Modules</p>
          <p className="mt-3 text-2xl font-extrabold text-on-surface">{enabledModuleKeys.length}</p>
          <p className="mt-2 text-sm text-slate-500">These modules are what the club admin and staff shell will expose at go-live.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {MODULE_CATALOG.map((moduleKey) => {
            const enabled = enabledModuleKeys.includes(moduleKey);
            return (
              <button
                key={moduleKey}
                className={`rounded-2xl px-5 py-4 text-left ${
                  enabled ? "bg-primary-container/45" : "bg-surface-container-low"
                }`}
                onClick={() => toggleModule(moduleKey)}
                type="button"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold capitalize text-on-surface">{moduleKey.replace(/_/g, " ")}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      {enabled ? "Enabled for club rollout." : "Disabled for now."}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                      enabled
                        ? "bg-primary-container text-on-primary-container"
                        : "bg-surface-container-high text-on-surface-variant"
                    }`}
                  >
                    {enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        <div className="rounded-2xl bg-surface-container-low px-5 py-4 text-sm leading-6 text-slate-500">
          Module changes persist back into the real club module records that session bootstrap uses for club
          environments.
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6 pt-6">
        {notice ? (
          <section className={`rounded-2xl px-5 py-4 text-sm ${noticeClass(notice.tone)}`}>
            <div className="flex items-start gap-3">
              <MaterialSymbol icon={notice.tone === "error" ? "error" : notice.tone === "success" ? "task_alt" : "info"} />
              <p>{notice.message}</p>
            </div>
          </section>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <button
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-dim"
              onClick={() => setIsCreateOpen(true)}
              type="button"
            >
              <MaterialSymbol filled icon="add_circle" />
              <span>Add New Club</span>
            </button>

            <section className="rounded-3xl bg-surface-container-low px-5 py-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Club Registry</p>
                  <h2 className="mt-1 font-headline text-lg font-bold text-on-surface">Current Clubs</h2>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm">
                  {filteredClubs.length}
                </span>
              </div>

              <div className="space-y-3">
                {clubsQuery.isLoading ? <div className="rounded-2xl bg-white px-4 py-4 text-sm text-slate-500 shadow-sm">Loading clubs...</div> : null}
                {filteredClubs.map((club) => (
                  <button
                    key={club.id}
                    className={`w-full rounded-2xl px-4 py-4 text-left shadow-sm transition-colors ${
                      selectedClubId === club.id ? "bg-white" : "bg-white/75 hover:bg-white"
                    }`}
                    onClick={() => {
                      void handleSelectClub(club);
                    }}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className={`text-sm font-semibold ${selectedClubId === club.id ? "text-primary" : "text-on-surface"}`}>
                          {club.name}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">{club.location}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${statusBadgeClass(club.registry_status)}`}>
                        {club.registry_status}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3 text-[11px] font-medium text-slate-400">
                      <span>{formatStepLabel(club.onboarding_current_step)}</span>
                      <span>{club.finance_profile_count} finance profiles</span>
                    </div>
                  </button>
                ))}
                {!clubsQuery.isLoading && filteredClubs.length === 0 ? (
                  <div className="rounded-2xl bg-white px-4 py-5 text-sm text-slate-500 shadow-sm">
                    No clubs match the current filter.
                  </div>
                ) : null}
              </div>
            </section>
          </aside>

          <section className="space-y-6">
            {selectedClub ? (
              <>
                <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                      {selectedClub.location} / {selectedClub.timezone}
                    </p>
                    <div className="space-y-1">
                      <h2 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface">
                        {selectedClub.name}
                      </h2>
                      <p className="text-sm text-slate-500">
                        Superadmin-owned onboarding workspace for rollout, finance linkage, and operational readiness.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] ${statusBadgeClass(selectedClub.registry_status)}`}>
                      {selectedClub.registry_status}
                    </span>
                    <span className="rounded-full bg-surface-container-low px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                      {onboardingQuery.data?.progress_percent ?? 0}% progress
                    </span>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  {onboardingQuery.data?.steps.map((step) => (
                    <div
                      key={step.key}
                      className="space-y-3 rounded-2xl bg-surface-container-low px-4 py-4 text-left"
                    >
                      <div className={`h-1.5 rounded-full ${stepAccent(step.status, step.ready)}`} />
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                          {STEP_ORDER.indexOf(step.key) + 1}. {step.label}
                        </p>
                        <p className={`text-sm font-semibold ${stepLabelClass(step.status)}`}>
                          {step.status === "current" ? "In progress" : step.status === "complete" ? "Complete" : "Upcoming"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_360px]">
                  <section className="rounded-3xl bg-white px-6 py-6 shadow-sm">
                    <div className="flex flex-col gap-4 pb-6 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                          Step Container
                        </p>
                        <h3 className="font-headline text-2xl font-bold text-on-surface">{stepMeta.title}</h3>
                        <p className="max-w-2xl text-sm leading-6 text-slate-500">{stepMeta.body}</p>
                      </div>
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-container text-primary">
                        <MaterialSymbol filled icon={stepMeta.icon} />
                      </div>
                    </div>

                    <div className="py-6">{renderStepBody()}</div>

                    <div className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
                      <button
                        className="flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-500 transition-colors hover:bg-surface-container-low hover:text-on-surface disabled:opacity-50"
                        disabled={currentStepIndex === 0 || updateOnboardingMutation.isPending}
                        onClick={() => {
                          void persistStep("return_to_previous_step");
                        }}
                        type="button"
                      >
                        <MaterialSymbol icon="arrow_back" />
                        <span>Previous</span>
                      </button>

                      <div className="flex flex-col gap-3 sm:flex-row">
                        <button
                          className="rounded-2xl bg-surface-container-low px-4 py-3 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container"
                          onClick={() => {
                            void persistStep("save_draft");
                          }}
                          type="button"
                        >
                          Save Draft
                        </button>
                        <button
                          className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-dim disabled:opacity-50"
                          disabled={updateOnboardingMutation.isPending}
                          onClick={() => {
                            void persistStep("complete_step");
                          }}
                          type="button"
                        >
                          <span>Complete Step</span>
                          <MaterialSymbol icon="arrow_forward" />
                        </button>
                      </div>
                    </div>
                  </section>
                  <aside className="space-y-4">
                    <section className="rounded-3xl bg-surface-container-low px-5 py-5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Readiness</p>
                      <div className="mt-4 space-y-3">
                        <div className="rounded-2xl bg-white px-4 py-4 shadow-sm">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Finance</p>
                          <p className="mt-2 text-sm font-semibold text-on-surface">
                            {onboardingQuery.data?.finance.setup_complete ? "Profile selected" : "Selection pending"}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-white px-4 py-4 shadow-sm">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Rules</p>
                          <p className="mt-2 text-sm font-semibold text-on-surface">
                            {onboardingQuery.data?.rules.rule_set_count ?? 0} rule sets / {onboardingQuery.data?.rules.pricing_matrix_count ?? 0} pricing matrices
                          </p>
                        </div>
                        <div className="rounded-2xl bg-white px-4 py-4 shadow-sm">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Modules</p>
                          <p className="mt-2 text-sm font-semibold text-on-surface">
                            {enabledModuleKeys.length} enabled
                          </p>
                        </div>
                      </div>
                    </section>

                    <section className="rounded-3xl bg-surface-container-low px-5 py-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Assignments</p>
                          <h3 className="mt-1 font-headline text-lg font-bold text-on-surface">Club Admin and Staff</h3>
                        </div>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm">
                          {onboardingQuery.data?.assignments.length ?? 0}
                        </span>
                      </div>

                      <div className="mt-4 space-y-3">
                        <input
                          className="w-full rounded-2xl bg-white px-4 py-3 text-sm text-on-surface outline-none shadow-sm"
                          onChange={(event) => setAssignmentQuery(event.target.value)}
                          placeholder="Search linked users..."
                          type="search"
                          value={assignmentQuery}
                        />

                        {assignmentQuery.trim().length > 0 ? (
                          <div className="space-y-2">
                            {assignmentCandidatesQuery.data?.items.map((candidate) => (
                              <div key={candidate.user_id} className="rounded-2xl bg-white px-4 py-4 shadow-sm">
                                <p className="text-sm font-semibold text-on-surface">{candidate.display_name}</p>
                                <p className="mt-1 text-xs text-slate-500">{candidate.email}</p>
                                <div className="mt-3 flex gap-2">
                                  <button
                                    className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white"
                                    onClick={() => {
                                      void handleAssignUser(candidate.person_id, "club_admin");
                                    }}
                                    type="button"
                                  >
                                    Assign Club Admin
                                  </button>
                                  <button
                                    className="rounded-xl bg-surface-container px-3 py-2 text-xs font-bold text-on-surface"
                                    onClick={() => {
                                      void handleAssignUser(candidate.person_id, "club_staff");
                                    }}
                                    type="button"
                                  >
                                    Assign Staff
                                  </button>
                                </div>
                              </div>
                            ))}
                            {assignmentCandidatesQuery.isLoading ? (
                              <div className="rounded-2xl bg-white px-4 py-4 text-sm text-slate-500 shadow-sm">Searching users...</div>
                            ) : null}
                            {!assignmentCandidatesQuery.isLoading && (assignmentCandidatesQuery.data?.items.length ?? 0) === 0 ? (
                              <div className="rounded-2xl bg-white px-4 py-4 text-sm text-slate-500 shadow-sm">No linked users match the current query.</div>
                            ) : null}
                          </div>
                        ) : null}

                        <div className="space-y-2">
                          {onboardingQuery.data?.assignments.map((assignment) => (
                            <div key={assignment.membership_id} className="rounded-2xl bg-white px-4 py-4 shadow-sm">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-on-surface">{assignment.display_name}</p>
                                  <p className="mt-1 text-xs text-slate-500">{assignment.email}</p>
                                </div>
                                <span className="rounded-full bg-surface-container px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant">
                                  {assignment.role === "club_admin" ? "Club Admin" : "Staff"}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </section>
                  </aside>
                </div>
              </>
            ) : (
              <section className="rounded-3xl bg-white px-6 py-10 text-center shadow-sm">
                <h2 className="font-headline text-2xl font-bold text-on-surface">No clubs yet</h2>
                <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">
                  Create the first club to start the onboarding workflow, finance linkage, and club-admin handoff path.
                </p>
                <button
                  className="mt-6 rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-white"
                  onClick={() => setIsCreateOpen(true)}
                  type="button"
                >
                  Add New Club
                </button>
              </section>
            )}
          </section>
        </div>
      </div>

      {isCreateOpen ? (
        <>
          <button
            aria-label="Close create club drawer"
            className="fixed inset-0 z-40 bg-slate-900/25"
            onClick={() => setIsCreateOpen(false)}
            type="button"
          />
          <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[440px] flex-col bg-white shadow-2xl">
            <div className="flex items-start justify-between px-6 py-5">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">New Club</p>
                <h2 className="font-headline text-2xl font-bold text-on-surface">Start Onboarding</h2>
                <p className="text-sm text-slate-500">Create the club record and initialize onboarding tracking.</p>
              </div>
              <button
                aria-label="Close create club"
                className="rounded-full p-2 text-slate-400 transition-colors hover:bg-surface-container-low hover:text-on-surface"
                onClick={() => setIsCreateOpen(false)}
                type="button"
              >
                <MaterialSymbol icon="close" />
              </button>
            </div>
            <div className="flex-1 space-y-5 px-6 py-4">
              <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Club Name
                <input
                  aria-label="Create Club Name"
                  className="rounded-2xl bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none focus:bg-white"
                  onChange={(event) => setClubForm((current) => ({ ...current, name: event.target.value }))}
                  type="text"
                  value={clubForm.name}
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Location
                <input
                  aria-label="Create Club Location"
                  className="rounded-2xl bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none focus:bg-white"
                  onChange={(event) => setClubForm((current) => ({ ...current, location: event.target.value }))}
                  type="text"
                  value={clubForm.location}
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Timezone
                <input
                  aria-label="Create Club Timezone"
                  className="rounded-2xl bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none focus:bg-white"
                  onChange={(event) => setClubForm((current) => ({ ...current, timezone: event.target.value }))}
                  type="text"
                  value={clubForm.timezone}
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3 bg-surface-container-low px-6 py-5">
              <button
                className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-on-surface"
                onClick={() => setIsCreateOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-white"
                disabled={createClubMutation.isPending}
                onClick={() => {
                  void handleCreateClub();
                }}
                type="button"
              >
                {createClubMutation.isPending ? "Creating..." : "Create Club"}
              </button>
            </div>
          </aside>
        </>
      ) : null}
    </>
  );
}
