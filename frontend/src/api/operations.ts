import { apiRequest } from "./client";
import type {
  BookingCancelResult,
  BookingCheckInResult,
  BookingCreateInput,
  BookingCreateResult,
  BookingCompleteResult,
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
import type {
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

interface AuthenticatedOptions {
  accessToken: string;
  selectedClubId: string;
}

export function fetchClubConfig({ accessToken, selectedClubId }: AuthenticatedOptions): Promise<ClubConfig> {
  return apiRequest<ClubConfig>("/api/clubs/config", {
    method: "GET",
    accessToken,
    selectedClubId
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

export function fetchTeeSheetDay(
  params: {
    courseId: string;
    date: string;
    membershipType: "member" | "guest" | "staff";
    teeId?: string | null;
    referenceDatetime?: string | null;
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
  return apiRequest<TeeSheetDayResponse>(`/api/golf/tee-sheet/day?${searchParams.toString()}`, {
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
