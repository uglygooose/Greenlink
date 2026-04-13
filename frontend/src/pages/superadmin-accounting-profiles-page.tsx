import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useOutletContext } from "react-router-dom";

import { MaterialSymbol } from "../components/benchmark/material-symbol";
import {
  useBindSuperadminAccountingProfileMutation,
  useCreateSuperadminAccountingProfileMutation,
  useParseSuperadminAccountingTemplateMutation,
  useSuperadminAccountingProfilesQuery,
  useSuperadminAccountingSampleLayoutQuery,
  useSuperadminClubsQuery,
  useUpdateSuperadminAccountingProfileActiveMutation,
} from "../features/superadmin/hooks";
import type { SuperadminLayoutContext } from "../routes/superadmin-layout";
import { useSession } from "../session/session-context";
import type { AccountingExportProfileMappingConfig, FinanceTransactionType } from "../types/finance";
import type {
  SuperadminAccountingProfileCreateInput,
  SuperadminAccountingTemplateParseResult,
} from "../types/superadmin";

type NoticeTone = "success" | "error" | "info";

const TRANSACTION_TYPES: FinanceTransactionType[] = ["charge", "payment", "adjustment"];

function emptyMappingConfig(): AccountingExportProfileMappingConfig {
  return {
    reference_prefix: "GL",
    fallback_customer_code: "UNASSIGNED",
    transaction_mappings: {
      charge: { debit_account_code: "", credit_account_code: "", description_prefix: "Charge" },
      payment: { debit_account_code: "", credit_account_code: "", description_prefix: "Payment" },
      adjustment: { debit_account_code: "", credit_account_code: "", description_prefix: "Adjustment" },
    },
  };
}

function emptyProfileForm(clubId = ""): SuperadminAccountingProfileCreateInput {
  return {
    club_id: clubId,
    code: "",
    name: "",
    target_system: "generic_journal",
    is_active: true,
    mapping_config: emptyMappingConfig(),
  };
}

function noticeClass(tone: NoticeTone): string {
  if (tone === "error") return "bg-error-container/45 text-on-error-container";
  if (tone === "success") return "bg-primary-container/45 text-on-primary-container";
  return "bg-secondary-container/55 text-on-secondary-container";
}

function parseTemplatePayload(raw: string): Partial<SuperadminAccountingProfileCreateInput> {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const mappingConfig =
    parsed.mapping_config && typeof parsed.mapping_config === "object"
      ? (parsed.mapping_config as AccountingExportProfileMappingConfig)
      : (parsed as unknown as AccountingExportProfileMappingConfig);
  if (
    !mappingConfig ||
    typeof mappingConfig.reference_prefix !== "string" ||
    typeof mappingConfig.fallback_customer_code !== "string" ||
    typeof mappingConfig.transaction_mappings !== "object"
  ) {
    throw new Error("Template JSON must include a valid mapping_config payload.");
  }

  return {
    code: typeof parsed.code === "string" ? parsed.code : undefined,
    name: typeof parsed.name === "string" ? parsed.name : undefined,
    target_system: typeof parsed.target_system === "string" ? parsed.target_system : undefined,
    mapping_config: mappingConfig,
  };
}

async function readTemplateFile(file: File): Promise<string> {
  if (typeof file.text === "function") {
    return file.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Template file could not be read as text."));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("Template file could not be read."));
    };
    reader.readAsText(file);
  });
}

export function SuperadminAccountingProfilesPage(): JSX.Element {
  const { accessToken, bootstrap } = useSession();
  const { search } = useOutletContext<SuperadminLayoutContext>();
  const [clubFilter, setClubFilter] = useState<string | null>(null);
  const [form, setForm] = useState<SuperadminAccountingProfileCreateInput>(
    emptyProfileForm(bootstrap?.selected_club_id ?? ""),
  );
  const [templateAnalysis, setTemplateAnalysis] = useState<SuperadminAccountingTemplateParseResult | null>(null);
  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);

  const clubsQuery = useSuperadminClubsQuery({ accessToken });
  const profilesQuery = useSuperadminAccountingProfilesQuery({ accessToken, clubId: clubFilter });
  const sampleLayoutQuery = useSuperadminAccountingSampleLayoutQuery({ accessToken, targetSystem: form.target_system });
  const createProfileMutation = useCreateSuperadminAccountingProfileMutation();
  const updateActiveMutation = useUpdateSuperadminAccountingProfileActiveMutation();
  const bindProfileMutation = useBindSuperadminAccountingProfileMutation();
  const parseTemplateMutation = useParseSuperadminAccountingTemplateMutation();

  const clubs = clubsQuery.data?.items ?? [];
  const profiles = profilesQuery.data?.profiles ?? [];

  useEffect(() => {
    if (!form.club_id && clubs.length > 0) {
      setForm((current) => ({ ...current, club_id: bootstrap?.selected_club_id ?? clubs[0].id }));
    }
  }, [bootstrap?.selected_club_id, clubs, form.club_id]);

  const filteredProfiles = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return profiles;
    return profiles.filter((profile) =>
      [profile.club_name, profile.name, profile.code, profile.target_system].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [profiles, search]);

  async function handleCsvTemplateUpload(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const analysis = await parseTemplateMutation.mutateAsync(file);
      setTemplateAnalysis(analysis);
      setForm((current) => ({
        ...current,
        target_system: analysis.suggested_target_system || current.target_system,
      }));
      setNotice({ tone: "success", message: `${file.name} analyzed against a real accounting CSV layout.` });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to parse template CSV.",
      });
    } finally {
      event.target.value = "";
    }
  }

  async function handleJsonHelperUpload(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const template = parseTemplatePayload(await readTemplateFile(file));
      setTemplateAnalysis(null);
      setForm((current) => ({
        ...current,
        code: template.code ?? current.code,
        name: template.name ?? current.name,
        target_system: template.target_system ?? current.target_system,
        mapping_config: template.mapping_config ?? current.mapping_config,
      }));
      setNotice({ tone: "info", message: `${file.name} loaded from the JSON template.` });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to parse template JSON.",
      });
    } finally {
      event.target.value = "";
    }
  }

  async function handleCreateProfile(): Promise<void> {
    setNotice(null);
    try {
      const result = await createProfileMutation.mutateAsync({
        ...form,
        code: form.code.trim(),
        name: form.name.trim(),
      });
      setForm((current) => emptyProfileForm(current.club_id));
      setTemplateAnalysis(null);
      setNotice({ tone: "success", message: `${result.name} created for ${result.club_name}.` });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to create accounting profile.",
      });
    }
  }

  async function handleToggleProfile(profileId: string, isActive: boolean): Promise<void> {
    setNotice(null);
    try {
      const result = await updateActiveMutation.mutateAsync({ profileId, payload: { is_active: isActive } });
      setNotice({
        tone: "success",
        message: isActive ? `${result.name} is now active.` : `${result.name} is now inactive.`,
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to update profile status.",
      });
    }
  }

  async function handleBindProfile(clubId: string, profileId: string): Promise<void> {
    setNotice(null);
    try {
      const result = await bindProfileMutation.mutateAsync({ clubId, payload: { profile_id: profileId } });
      setNotice({
        tone: "success",
        message: result.finance.selected_accounting_profile_name
          ? `${result.finance.selected_accounting_profile_name} bound for ${result.club.name}.`
          : `Accounting profile bound for ${result.club.name}.`,
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to bind accounting profile.",
      });
    }
  }

  function updateTransactionMapping(
    type: FinanceTransactionType,
    field: "debit_account_code" | "credit_account_code" | "description_prefix",
    value: string,
  ): void {
    setForm((current) => ({
      ...current,
      mapping_config: {
        ...current.mapping_config,
        transaction_mappings: {
          ...current.mapping_config.transaction_mappings,
          [type]: {
            debit_account_code: current.mapping_config.transaction_mappings[type]?.debit_account_code ?? "",
            credit_account_code: current.mapping_config.transaction_mappings[type]?.credit_account_code ?? "",
            description_prefix: current.mapping_config.transaction_mappings[type]?.description_prefix ?? "",
            [field]: value,
          },
        },
      },
    }));
  }

  function downloadSampleLayout(): void {
    if (!sampleLayoutQuery.data) return;
    const blob = new Blob([sampleLayoutQuery.data.sample_csv], { type: "text/csv;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = sampleLayoutQuery.data.file_name;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white px-6 py-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Superadmin Finance</p>
            <h2 className="font-headline text-3xl font-bold text-on-surface">Accounting Profiles</h2>
            <p className="max-w-3xl text-sm leading-6 text-slate-500">
              Create mapping profiles for any club, start from a real accounting CSV or a GreenLink sample layout, and bind the live profile that onboarding should use.
            </p>
          </div>
          <div className="grid min-w-[220px] gap-3 md:grid-cols-2">
            <div className="rounded-2xl bg-surface-container-low px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Profiles</p>
              <p className="mt-2 text-2xl font-extrabold text-on-surface">{profilesQuery.data?.total_count ?? 0}</p>
            </div>
            <div className="rounded-2xl bg-surface-container-low px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Clubs</p>
              <p className="mt-2 text-2xl font-extrabold text-on-surface">{clubs.length}</p>
            </div>
          </div>
        </div>
      </section>

      {notice ? (
        <div className={`rounded-2xl px-4 py-3 text-sm font-medium ${noticeClass(notice.tone)}`}>{notice.message}</div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.05fr,1.35fr]">
        <section className="space-y-4 rounded-[28px] bg-white px-6 py-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Profile Builder</p>
              <h3 className="mt-1 font-headline text-2xl font-bold text-on-surface">Create for Any Club</h3>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-primary px-3 py-2 text-sm font-semibold text-white">
                <MaterialSymbol icon="upload_file" />
                <span>Upload CSV Template</span>
                <input
                  accept=".csv,text/csv"
                  aria-label="Upload CSV template"
                  className="sr-only"
                  onChange={(event) => {
                    void handleCsvTemplateUpload(event);
                  }}
                  type="file"
                />
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-surface-container-low px-3 py-2 text-sm font-semibold text-on-surface">
                <MaterialSymbol icon="data_object" />
                <span>Load JSON Template</span>
                <input
                  accept="application/json,.json"
                  aria-label="Load JSON template"
                  className="sr-only"
                  onChange={(event) => {
                    void handleJsonHelperUpload(event);
                  }}
                  type="file"
                />
              </label>
            </div>
          </div>

          <div className="rounded-2xl bg-surface-container-low px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Sample Layout</p>
                <p className="mt-1 text-sm text-slate-500">
                  Use a known-good starter layout for {form.target_system.replace(/_/g, " ")} when the club has not supplied a real export sample yet.
                </p>
              </div>
              <button
                className="rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-on-surface shadow-sm disabled:opacity-50"
                disabled={!sampleLayoutQuery.data}
                onClick={downloadSampleLayout}
                type="button"
              >
                Download Sample CSV
              </button>
            </div>
            {sampleLayoutQuery.data ? (
              <>
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                  <span>{sampleLayoutQuery.data.headerless ? "Headerless" : "Header row included"}</span>
                  <span>Delimiter: {sampleLayoutQuery.data.delimiter === "," ? "comma" : sampleLayoutQuery.data.delimiter}</span>
                </div>
                <pre className="mt-3 overflow-x-auto rounded-2xl bg-white px-4 py-3 text-xs text-slate-700 shadow-sm">
                  {sampleLayoutQuery.data.sample_csv}
                </pre>
                <div className="mt-3 space-y-2">
                  {sampleLayoutQuery.data.notes.map((note) => (
                    <div key={note} className="rounded-2xl bg-white px-3 py-2 text-xs text-slate-600 shadow-sm">
                      {note}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="mt-3 text-sm text-slate-500">Loading sample layout...</div>
            )}
          </div>

          {templateAnalysis ? (
            <div className="space-y-4 rounded-2xl bg-surface-container-low px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Template Analysis</p>
                  <h4 className="mt-1 text-sm font-semibold text-on-surface">{templateAnalysis.file_name}</h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {templateAnalysis.suggested_target_system.replace(/_/g, " ")}
                  </span>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {templateAnalysis.headerless ? "Headerless" : "Headers detected"}
                  </span>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Detected Columns</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {templateAnalysis.headers_detected.map((header) => (
                      <span key={header} className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm">
                        {header}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Suggested Mapping</p>
                  <div className="mt-2 space-y-2">
                    {Object.entries(templateAnalysis.suggested_mapping).map(([field, source]) => (
                      <div key={field} className="flex items-center justify-between rounded-2xl bg-white px-3 py-2 text-xs shadow-sm">
                        <span className="font-semibold uppercase tracking-[0.14em] text-slate-400">{field.replace(/_/g, " ")}</span>
                        <span className="text-slate-600">{source}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Sample Rows</p>
                <div className="mt-2 space-y-2">
                  {templateAnalysis.sample_rows.map((row, index) => (
                    <div key={`row-${index + 1}`} className="overflow-x-auto rounded-2xl bg-white px-3 py-2 text-xs text-slate-600 shadow-sm">
                      {row.values.join(" | ")}
                    </div>
                  ))}
                </div>
              </div>
              {templateAnalysis.warnings.length > 0 ? (
                <div className="space-y-2">
                  {templateAnalysis.warnings.map((warning) => (
                    <div key={warning} className="rounded-2xl bg-secondary-container/55 px-3 py-2 text-sm text-on-secondary-container">
                      {warning}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-2xl bg-surface-container-low px-4 py-4 text-sm text-slate-500">
              Upload a real accounting CSV to match the club's file structure, or load a JSON template to prefill the profile.
            </div>
          )}

          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Target Club
            <select
              aria-label="Target club"
              className="rounded-2xl bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none focus:bg-white"
              onChange={(event) => setForm((current) => ({ ...current, club_id: event.target.value }))}
              value={form.club_id}
            >
              <option value="">Select a club</option>
              {clubs.map((club) => (
                <option key={club.id} value={club.id}>
                  {club.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Profile Name
              <input
                aria-label="Profile name"
                className="rounded-2xl bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none focus:bg-white"
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                type="text"
                value={form.name}
              />
            </label>
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Profile Code
              <input
                aria-label="Profile code"
                className="rounded-2xl bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none focus:bg-white"
                onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
                type="text"
                value={form.code}
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 md:col-span-2">
              Target System
              <select
                aria-label="Target system"
                className="rounded-2xl bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none focus:bg-white"
                onChange={(event) => setForm((current) => ({ ...current, target_system: event.target.value }))}
                value={form.target_system}
              >
                <option value="generic_journal">Generic Journal</option>
                <option value="sage_like">Sage-like</option>
                <option value="pastel_like">Pastel-like</option>
              </select>
            </label>
            <label className="flex items-center gap-3 rounded-2xl bg-surface-container-low px-4 py-3 text-sm font-semibold text-on-surface">
              <input
                checked={form.is_active}
                onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))}
                type="checkbox"
              />
              <span>Create as active</span>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Reference Prefix
              <input
                aria-label="Reference prefix"
                className="rounded-2xl bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none focus:bg-white"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    mapping_config: { ...current.mapping_config, reference_prefix: event.target.value },
                  }))
                }
                type="text"
                value={form.mapping_config.reference_prefix}
              />
            </label>
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Fallback Customer Code
              <input
                aria-label="Fallback customer code"
                className="rounded-2xl bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none focus:bg-white"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    mapping_config: { ...current.mapping_config, fallback_customer_code: event.target.value },
                  }))
                }
                type="text"
                value={form.mapping_config.fallback_customer_code}
              />
            </label>
          </div>

          <div className="space-y-3">
            {TRANSACTION_TYPES.map((transactionType) => {
              const mapping = form.mapping_config.transaction_mappings[transactionType];
              return (
                <div key={transactionType} className="rounded-2xl bg-surface-container-low px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                    {transactionType.replace(/_/g, " ")}
                  </p>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <input
                      aria-label={`${transactionType} debit account code`}
                      className="rounded-2xl bg-white px-4 py-3 text-sm text-on-surface outline-none"
                      onChange={(event) => updateTransactionMapping(transactionType, "debit_account_code", event.target.value)}
                      placeholder="Debit account"
                      type="text"
                      value={mapping?.debit_account_code ?? ""}
                    />
                    <input
                      aria-label={`${transactionType} credit account code`}
                      className="rounded-2xl bg-white px-4 py-3 text-sm text-on-surface outline-none"
                      onChange={(event) => updateTransactionMapping(transactionType, "credit_account_code", event.target.value)}
                      placeholder="Credit account"
                      type="text"
                      value={mapping?.credit_account_code ?? ""}
                    />
                    <input
                      aria-label={`${transactionType} description prefix`}
                      className="rounded-2xl bg-white px-4 py-3 text-sm text-on-surface outline-none"
                      onChange={(event) => updateTransactionMapping(transactionType, "description_prefix", event.target.value)}
                      placeholder="Description prefix"
                      type="text"
                      value={mapping?.description_prefix ?? ""}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end">
            <button
              className="rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-dim disabled:opacity-50"
              disabled={createProfileMutation.isPending || !form.club_id || !form.name.trim() || !form.code.trim()}
              onClick={() => {
                void handleCreateProfile();
              }}
              type="button"
            >
              {createProfileMutation.isPending ? "Creating..." : "Create Profile"}
            </button>
          </div>
        </section>

        <section className="space-y-4 rounded-[28px] bg-white px-6 py-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Profile Library</p>
              <h3 className="mt-1 font-headline text-2xl font-bold text-on-surface">Cross-Club Visibility</h3>
            </div>
            <label className="flex min-w-[240px] flex-col gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Filter by Club
              <select
                aria-label="Filter by club"
                className="rounded-2xl bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none focus:bg-white"
                onChange={(event) => setClubFilter(event.target.value || null)}
                value={clubFilter ?? ""}
              >
                <option value="">All clubs</option>
                {clubs.map((club) => (
                  <option key={club.id} value={club.id}>
                    {club.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="space-y-3">
            {filteredProfiles.map((profile) => (
              <article key={profile.id} className="rounded-2xl bg-surface-container-low px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-on-surface">{profile.name}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
                      {profile.club_name} - {profile.code} - {profile.target_system.replace(/_/g, " ")}
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
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    className="rounded-2xl bg-primary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                    disabled={bindProfileMutation.isPending}
                    onClick={() => {
                      void handleBindProfile(profile.club_id, profile.id);
                    }}
                    type="button"
                  >
                    Bind Profile
                  </button>
                  <button
                    className="rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-on-surface shadow-sm disabled:opacity-50"
                    disabled={updateActiveMutation.isPending}
                    onClick={() => {
                      void handleToggleProfile(profile.id, !profile.is_active);
                    }}
                    type="button"
                  >
                    {profile.is_active ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </article>
            ))}

            {profilesQuery.isLoading ? (
              <div className="rounded-2xl bg-surface-container-low px-5 py-4 text-sm text-slate-500">Loading profiles...</div>
            ) : null}
            {!profilesQuery.isLoading && filteredProfiles.length === 0 ? (
              <div className="rounded-2xl bg-surface-container-low px-5 py-4 text-sm text-slate-500">
                No accounting profiles match the current club filter or search.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
