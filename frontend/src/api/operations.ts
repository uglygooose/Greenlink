import { apiRequest } from "./client";
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
