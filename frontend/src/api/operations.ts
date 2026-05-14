import { apiRequest } from "./client";
import type {
  BookingCancelResult,
  BookingChargePostInput,
  BookingChargePostResult,
  BookingCheckInResult,
  BookingCreateInput,
  BookingCreateResult,
  BookingCompleteResult,
  BookingPaymentRecordResult,
  BookingPaymentStatusUpdateInput,
  BookingPaymentStatusUpdateResult,
  BookingRefundInput,
  BookingRefundResult,
  PlayerBookingReadModelResponse,
  BookingUpdateInput,
  BookingUpdateResult,
  BookingMoveInput,
  BookingMoveResult,
  BookingNoShowResult,
} from "../types/bookings";
import type {
  OrderCancelResult,
  OrderChargePostResult,
  OrderCollectedResult,
  OrderCreateInput,
  OrderCreateResult,
  OrderDetail,
  OrderMenuItem,
  OrderPreparingResult,
  OrderReadyResult,
  OrderStatus,
  OrderSummary,
} from "../types/orders";
import type { SelfProfileResponse, SelfProfileUpdateInput } from "../types/profile";
import type {
  GolfSettingsPricingMutationResult,
  GolfSettingsReadiness,
  GolfSettingsRulesMutationResult,
  BookingRuleSet,
  BookingRuleSetInput,
  ClubConfig,
  ClubConfigInput,
  Course,
  CourseInput,
  PricingMatrix,
  PricingMatrixInput,
  Tee,
  TeeInput,
} from "../types/operations";
import type { TeeSheetDayResponse } from "../types/tee-sheet";
import type {
  TeeSheetLockAcquireRequest,
  TeeSheetLockConflict409Body,
  TeeSheetLockConflictDetail,
  TeeSheetLockListResponse,
  TeeSheetLockResponse,
} from "../types/tee-sheet-locks";
import { ApiError } from "./client";

interface AuthenticatedOptions {
  accessToken: string;
  selectedClubId: string;
}

interface PlayerBookingReadModelParams {
  referenceDatetime?: string | null;
  upcomingLimit?: number;
  historyLimit?: number;
}

export function fetchClubConfig({ accessToken, selectedClubId }: AuthenticatedOptions): Promise<ClubConfig> {
  return apiRequest<ClubConfig>("/api/clubs/config", {
    method: "GET",
    accessToken,
    selectedClubId
  });
}

export function fetchGolfSettingsReadiness({
  accessToken,
  selectedClubId,
}: AuthenticatedOptions): Promise<GolfSettingsReadiness> {
  return apiRequest<GolfSettingsReadiness>("/api/golf/settings/readiness", {
    method: "GET",
    accessToken,
    selectedClubId,
  });
}

export function updateClubConfig(
  payload: ClubConfigInput,
  { accessToken, selectedClubId }: AuthenticatedOptions,
): Promise<ClubConfig> {
  return apiRequest<ClubConfig>("/api/clubs/config", {
    method: "PUT",
    accessToken,
    selectedClubId,
    body: JSON.stringify(payload)
  });
}

export function fetchCourses({ accessToken, selectedClubId }: AuthenticatedOptions): Promise<Course[]> {
  return apiRequest<Course[]>("/api/golf/courses", {
    method: "GET",
    accessToken,
    selectedClubId
  });
}

export function createCourse(
  payload: CourseInput,
  { accessToken, selectedClubId }: AuthenticatedOptions,
): Promise<Course> {
  return apiRequest<Course>("/api/golf/courses", {
    method: "POST",
    accessToken,
    selectedClubId,
    body: JSON.stringify(payload)
  });
}

export function fetchTees({ accessToken, selectedClubId }: AuthenticatedOptions): Promise<Tee[]> {
  return apiRequest<Tee[]>("/api/golf/tees", {
    method: "GET",
    accessToken,
    selectedClubId
  });
}

export function createTee(payload: TeeInput, { accessToken, selectedClubId }: AuthenticatedOptions): Promise<Tee> {
  return apiRequest<Tee>("/api/golf/tees", {
    method: "POST",
    accessToken,
    selectedClubId,
    body: JSON.stringify(payload)
  });
}

export function fetchRuleSets({
  accessToken,
  selectedClubId,
}: AuthenticatedOptions): Promise<BookingRuleSet[]> {
  return apiRequest<BookingRuleSet[]>("/api/rules", {
    method: "GET",
    accessToken,
    selectedClubId
  });
}

export function createRuleSet(
  payload: BookingRuleSetInput,
  { accessToken, selectedClubId }: AuthenticatedOptions,
): Promise<BookingRuleSet> {
  return apiRequest<BookingRuleSet>("/api/rules", {
    method: "POST",
    accessToken,
    selectedClubId,
    body: JSON.stringify(payload)
  });
}

export function updateRuleSet(
  ruleSetId: string,
  payload: BookingRuleSetInput,
  { accessToken, selectedClubId }: AuthenticatedOptions,
): Promise<BookingRuleSet> {
  return apiRequest<BookingRuleSet>(`/api/rules/${ruleSetId}`, {
    method: "PUT",
    accessToken,
    selectedClubId,
    body: JSON.stringify(payload)
  });
}

export function publishGolfRuleSet(
  ruleSetId: string,
  { accessToken, selectedClubId }: AuthenticatedOptions,
): Promise<GolfSettingsRulesMutationResult> {
  return apiRequest<GolfSettingsRulesMutationResult>("/api/golf/settings/rules/publish", {
    method: "POST",
    accessToken,
    selectedClubId,
    body: JSON.stringify({ rule_set_id: ruleSetId }),
  });
}

export function rollbackGolfRuleSet({
  accessToken,
  selectedClubId,
}: AuthenticatedOptions): Promise<GolfSettingsRulesMutationResult> {
  return apiRequest<GolfSettingsRulesMutationResult>("/api/golf/settings/rules/rollback", {
    method: "POST",
    accessToken,
    selectedClubId,
    body: JSON.stringify({}),
  });
}

export function fetchPricingMatrices({
  accessToken,
  selectedClubId,
}: AuthenticatedOptions): Promise<PricingMatrix[]> {
  return apiRequest<PricingMatrix[]>("/api/pricing", {
    method: "GET",
    accessToken,
    selectedClubId
  });
}

export function createPricingMatrix(
  payload: PricingMatrixInput,
  { accessToken, selectedClubId }: AuthenticatedOptions,
): Promise<PricingMatrix> {
  return apiRequest<PricingMatrix>("/api/pricing", {
    method: "POST",
    accessToken,
    selectedClubId,
    body: JSON.stringify(payload)
  });
}

export function updatePricingMatrix(
  matrixId: string,
  payload: PricingMatrixInput,
  { accessToken, selectedClubId }: AuthenticatedOptions,
): Promise<PricingMatrix> {
  return apiRequest<PricingMatrix>(`/api/pricing/${matrixId}`, {
    method: "PUT",
    accessToken,
    selectedClubId,
    body: JSON.stringify(payload)
  });
}

export function publishGolfPricingMatrix(
  matrixId: string,
  { accessToken, selectedClubId }: AuthenticatedOptions,
): Promise<GolfSettingsPricingMutationResult> {
  return apiRequest<GolfSettingsPricingMutationResult>("/api/golf/settings/pricing/publish", {
    method: "POST",
    accessToken,
    selectedClubId,
    body: JSON.stringify({ matrix_id: matrixId }),
  });
}

export function rollbackGolfPricingMatrix({
  accessToken,
  selectedClubId,
}: AuthenticatedOptions): Promise<GolfSettingsPricingMutationResult> {
  return apiRequest<GolfSettingsPricingMutationResult>("/api/golf/settings/pricing/rollback", {
    method: "POST",
    accessToken,
    selectedClubId,
    body: JSON.stringify({}),
  });
}

export function fetchTeeSheetDay(
  params: {
    courseId: string;
    date: string;
    membershipType: "member" | "guest" | "staff";
    teeId?: string | null;
    referenceDatetime?: string | null;
    intervalMinutes?: number | null;
  },
  { accessToken, selectedClubId }: AuthenticatedOptions,
): Promise<TeeSheetDayResponse> {
  const searchParams = new URLSearchParams({
    course_id: params.courseId,
    date: params.date,
    membership_type: params.membershipType,
  });
  if (params.teeId) {
    searchParams.set("tee_id", params.teeId);
  }
  if (params.referenceDatetime) {
    searchParams.set("reference_datetime", params.referenceDatetime);
  }
  if (params.intervalMinutes != null) {
    searchParams.set("interval_minutes", String(params.intervalMinutes));
  }
  return apiRequest<TeeSheetDayResponse>(`/api/golf/tee-sheet/day?${searchParams.toString()}`, {
    method: "GET",
    accessToken,
    selectedClubId,
  });
}

export function fetchPlayerBookingReadModel(
  params: PlayerBookingReadModelParams,
  { accessToken, selectedClubId }: AuthenticatedOptions,
): Promise<PlayerBookingReadModelResponse> {
  const searchParams = new URLSearchParams();
  if (params.referenceDatetime) {
    searchParams.set("reference_datetime", params.referenceDatetime);
  }
  if (params.upcomingLimit != null) {
    searchParams.set("upcoming_limit", String(params.upcomingLimit));
  }
  if (params.historyLimit != null) {
    searchParams.set("history_limit", String(params.historyLimit));
  }
  const path = searchParams.size
    ? `/api/golf/bookings/player?${searchParams.toString()}`
    : "/api/golf/bookings/player";
  return apiRequest<PlayerBookingReadModelResponse>(path, {
    method: "GET",
    accessToken,
    selectedClubId,
  });
}

export function createBooking(
  payload: BookingCreateInput,
  { accessToken, selectedClubId }: AuthenticatedOptions,
): Promise<BookingCreateResult> {
  return apiRequest<BookingCreateResult>("/api/golf/bookings", {
    method: "POST",
    accessToken,
    selectedClubId,
    body: JSON.stringify(payload),
  });
}

export function updateBooking(
  bookingId: string,
  payload: BookingUpdateInput,
  { accessToken, selectedClubId }: AuthenticatedOptions,
): Promise<BookingUpdateResult> {
  return apiRequest<BookingUpdateResult>(`/api/golf/bookings/${bookingId}`, {
    method: "PATCH",
    accessToken,
    selectedClubId,
    body: JSON.stringify(payload),
  });
}

export function updateBookingPaymentStatus(
  bookingId: string,
  payload: BookingPaymentStatusUpdateInput,
  { accessToken, selectedClubId }: AuthenticatedOptions,
): Promise<BookingPaymentStatusUpdateResult> {
  return apiRequest<BookingPaymentStatusUpdateResult>(`/api/golf/bookings/${bookingId}/payment-status`, {
    method: "PATCH",
    accessToken,
    selectedClubId,
    body: JSON.stringify(payload),
  });
}

export function postBookingCharge(
  bookingId: string,
  payload: BookingChargePostInput,
  { accessToken, selectedClubId }: AuthenticatedOptions,
): Promise<BookingChargePostResult> {
  return apiRequest<BookingChargePostResult>(`/api/golf/bookings/${bookingId}/post-charge`, {
    method: "POST",
    accessToken,
    selectedClubId,
    body: JSON.stringify(payload),
  });
}

export function recordBookingPayment(
  bookingId: string,
  { accessToken, selectedClubId }: AuthenticatedOptions,
): Promise<BookingPaymentRecordResult> {
  return apiRequest<BookingPaymentRecordResult>(`/api/golf/bookings/${bookingId}/record-payment`, {
    method: "POST",
    accessToken,
    selectedClubId,
    body: JSON.stringify({}),
  });
}

export function postBookingRefund(
  bookingId: string,
  payload: BookingRefundInput,
  { accessToken, selectedClubId }: AuthenticatedOptions,
): Promise<BookingRefundResult> {
  return apiRequest<BookingRefundResult>(`/api/golf/bookings/${bookingId}/post-refund`, {
    method: "POST",
    accessToken,
    selectedClubId,
    body: JSON.stringify(payload),
  });
}

export function moveBooking(
  bookingId: string,
  payload: BookingMoveInput,
  { accessToken, selectedClubId }: AuthenticatedOptions,
): Promise<BookingMoveResult> {
  return apiRequest<BookingMoveResult>(`/api/golf/bookings/${bookingId}/move`, {
    method: "POST",
    accessToken,
    selectedClubId,
    body: JSON.stringify(payload),
  });
}

export function cancelBooking(
  bookingId: string,
  { accessToken, selectedClubId }: AuthenticatedOptions,
): Promise<BookingCancelResult> {
  return apiRequest<BookingCancelResult>(`/api/golf/bookings/${bookingId}/cancel`, {
    method: "POST",
    accessToken,
    selectedClubId,
    body: JSON.stringify({}),
  });
}

export function checkInBooking(
  bookingId: string,
  { accessToken, selectedClubId }: AuthenticatedOptions,
): Promise<BookingCheckInResult> {
  return apiRequest<BookingCheckInResult>(`/api/golf/bookings/${bookingId}/check-in`, {
    method: "POST",
    accessToken,
    selectedClubId,
    body: JSON.stringify({}),
  });
}

export function completeBooking(
  bookingId: string,
  { accessToken, selectedClubId }: AuthenticatedOptions,
): Promise<BookingCompleteResult> {
  return apiRequest<BookingCompleteResult>(`/api/golf/bookings/${bookingId}/complete`, {
    method: "POST",
    accessToken,
    selectedClubId,
    body: JSON.stringify({}),
  });
}

export function markBookingNoShow(
  bookingId: string,
  { accessToken, selectedClubId }: AuthenticatedOptions,
): Promise<BookingNoShowResult> {
  return apiRequest<BookingNoShowResult>(`/api/golf/bookings/${bookingId}/no-show`, {
    method: "POST",
    accessToken,
    selectedClubId,
    body: JSON.stringify({}),
  });
}

export function fetchOrders(
  status: OrderStatus | null,
  { accessToken, selectedClubId }: AuthenticatedOptions,
): Promise<OrderSummary[]> {
  const searchParams = new URLSearchParams();
  if (status) {
    searchParams.set("status", status);
  }
  const path = searchParams.size ? `/api/orders?${searchParams.toString()}` : "/api/orders";
  return apiRequest<OrderSummary[]>(path, {
    method: "GET",
    accessToken,
    selectedClubId,
  });
}

export function fetchOrderMenu({ accessToken, selectedClubId }: AuthenticatedOptions): Promise<OrderMenuItem[]> {
  return apiRequest<OrderMenuItem[]>("/api/orders/menu", {
    method: "GET",
    accessToken,
    selectedClubId,
  });
}

export function createOrder(
  payload: OrderCreateInput,
  { accessToken, selectedClubId }: AuthenticatedOptions,
): Promise<OrderCreateResult> {
  return apiRequest<OrderCreateResult>("/api/orders", {
    method: "POST",
    accessToken,
    selectedClubId,
    body: JSON.stringify(payload),
  });
}

export function fetchOrder(
  orderId: string,
  { accessToken, selectedClubId }: AuthenticatedOptions,
): Promise<OrderDetail> {
  return apiRequest<OrderDetail>(`/api/orders/${orderId}`, {
    method: "GET",
    accessToken,
    selectedClubId,
  });
}

export function markOrderPreparing(
  orderId: string,
  { accessToken, selectedClubId }: AuthenticatedOptions,
): Promise<OrderPreparingResult> {
  return apiRequest<OrderPreparingResult>(`/api/orders/${orderId}/preparing`, {
    method: "POST",
    accessToken,
    selectedClubId,
    body: JSON.stringify({}),
  });
}

export function markOrderReady(
  orderId: string,
  { accessToken, selectedClubId }: AuthenticatedOptions,
): Promise<OrderReadyResult> {
  return apiRequest<OrderReadyResult>(`/api/orders/${orderId}/ready`, {
    method: "POST",
    accessToken,
    selectedClubId,
    body: JSON.stringify({}),
  });
}

export function markOrderCollected(
  orderId: string,
  { accessToken, selectedClubId }: AuthenticatedOptions,
): Promise<OrderCollectedResult> {
  return apiRequest<OrderCollectedResult>(`/api/orders/${orderId}/collected`, {
    method: "POST",
    accessToken,
    selectedClubId,
    body: JSON.stringify({}),
  });
}

export function fetchSelfProfile({ accessToken, selectedClubId }: AuthenticatedOptions): Promise<SelfProfileResponse> {
  return apiRequest<SelfProfileResponse>("/api/people/me/profile", {
    method: "GET",
    accessToken,
    selectedClubId,
  });
}

export function updateSelfProfile(
  payload: SelfProfileUpdateInput,
  { accessToken, selectedClubId }: AuthenticatedOptions,
): Promise<SelfProfileResponse> {
  return apiRequest<SelfProfileResponse>("/api/people/me/profile", {
    method: "PATCH",
    accessToken,
    selectedClubId,
    body: JSON.stringify(payload),
  });
}

export function cancelOrder(
  orderId: string,
  { accessToken, selectedClubId }: AuthenticatedOptions,
): Promise<OrderCancelResult> {
  return apiRequest<OrderCancelResult>(`/api/orders/${orderId}/cancel`, {
    method: "POST",
    accessToken,
    selectedClubId,
    body: JSON.stringify({}),
  });
}

export function postOrderCharge(
  orderId: string,
  { accessToken, selectedClubId }: AuthenticatedOptions,
): Promise<OrderChargePostResult> {
  return apiRequest<OrderChargePostResult>(`/api/orders/${orderId}/post-charge`, {
    method: "POST",
    accessToken,
    selectedClubId,
    body: JSON.stringify({}),
  });
}

// ---------------------------------------------------------------------------
// Phase 10 / Slice 9a — tee-sheet optimistic locks (holder side).
// The acquire endpoint returns 409 with a structured TeeSheetLockConflictDetail
// when the slot is already held; the client unwraps it into a typed result
// so the orchestrator hook can distinguish "held by me" from "held by other".
// ---------------------------------------------------------------------------

export type LockAcquireResult =
  | { kind: "lock"; lock: TeeSheetLockResponse }
  | { kind: "conflict"; existing_lock: TeeSheetLockResponse; message: string };

export async function acquireTeeSheetLock(
  payload: TeeSheetLockAcquireRequest,
  { accessToken, selectedClubId }: AuthenticatedOptions,
): Promise<LockAcquireResult> {
  try {
    const lock = await apiRequest<TeeSheetLockResponse>("/api/golf/tee-sheet/locks", {
      method: "POST",
      accessToken,
      selectedClubId,
      body: JSON.stringify(payload),
    });
    return { kind: "lock", lock };
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      const detail = unwrapLockConflict(err.body);
      if (detail) {
        return { kind: "conflict", existing_lock: detail.existing_lock, message: detail.message };
      }
    }
    throw err;
  }
}

export type LockRenewResult =
  | { kind: "lock"; lock: TeeSheetLockResponse }
  | { kind: "conflict"; existing_lock: TeeSheetLockResponse | null; message: string };

export async function renewTeeSheetLock(
  lockId: string,
  { accessToken, selectedClubId }: AuthenticatedOptions,
): Promise<LockRenewResult> {
  try {
    const lock = await apiRequest<TeeSheetLockResponse>(
      `/api/golf/tee-sheet/locks/${lockId}/renew`,
      {
        method: "POST",
        accessToken,
        selectedClubId,
      },
    );
    return { kind: "lock", lock };
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      const detail = unwrapLockConflict(err.body);
      return {
        kind: "conflict",
        existing_lock: detail?.existing_lock ?? null,
        message: detail?.message ?? err.message,
      };
    }
    throw err;
  }
}

export async function releaseTeeSheetLock(
  lockId: string,
  { accessToken, selectedClubId }: AuthenticatedOptions,
): Promise<void> {
  try {
    await apiRequest<void>(`/api/golf/tee-sheet/locks/${lockId}`, {
      method: "DELETE",
      accessToken,
      selectedClubId,
    });
  } catch {
    // Release failures are non-recoverable per slice spec — the lock
    // decays via the 60s server-side TTL. Swallow.
  }
}

export function listTeeSheetLocks(
  params: { courseId: string; date: string },
  { accessToken, selectedClubId }: AuthenticatedOptions,
): Promise<TeeSheetLockListResponse> {
  const search = new URLSearchParams({ course_id: params.courseId, date: params.date });
  return apiRequest<TeeSheetLockListResponse>(`/api/golf/tee-sheet/locks?${search.toString()}`, {
    method: "GET",
    accessToken,
    selectedClubId,
  });
}

// FastAPI's HTTPException(detail=...) emits `{ detail: ... }`. The
// generic ErrorBody type in client.ts knows `detail` can be a string or
// validation-error array, but Slice 8.5 returns a structured object on
// 409. Narrow to the lock-conflict shape if present.
function unwrapLockConflict(body: unknown): TeeSheetLockConflictDetail | null {
  if (typeof body !== "object" || body === null) return null;
  const wrapped = body as Partial<TeeSheetLockConflict409Body>;
  if (!wrapped.detail || typeof wrapped.detail !== "object") return null;
  const detail = wrapped.detail as Partial<TeeSheetLockConflictDetail>;
  if (
    !detail.existing_lock ||
    typeof detail.existing_lock !== "object" ||
    typeof detail.message !== "string"
  ) {
    return null;
  }
  return detail as TeeSheetLockConflictDetail;
}
