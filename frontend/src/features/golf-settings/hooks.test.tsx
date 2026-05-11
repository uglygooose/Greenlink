import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  useCreateCourseMutation,
  useCreatePricingMatrixMutation,
  useCreateRuleSetMutation,
  useCreateTeeMutation,
  usePublishGolfPricingMatrixMutation,
  usePublishGolfRuleSetMutation,
  useRollbackGolfPricingMatrixMutation,
  useRollbackGolfRuleSetMutation,
} from "./hooks";

const mockUseSession = vi.fn();
const mockCreateCourse = vi.fn();
const mockCreatePricingMatrix = vi.fn();
const mockCreateRuleSet = vi.fn();
const mockCreateTee = vi.fn();
const mockPublishGolfPricingMatrix = vi.fn();
const mockPublishGolfRuleSet = vi.fn();
const mockRollbackGolfPricingMatrix = vi.fn();
const mockRollbackGolfRuleSet = vi.fn();

vi.mock("../../session/session-context", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../../api/operations", () => ({
  createCourse: (...args: unknown[]) => mockCreateCourse(...args),
  createPricingMatrix: (...args: unknown[]) => mockCreatePricingMatrix(...args),
  createRuleSet: (...args: unknown[]) => mockCreateRuleSet(...args),
  createTee: (...args: unknown[]) => mockCreateTee(...args),
  fetchClubConfig: vi.fn(),
  fetchCourses: vi.fn(),
  fetchGolfSettingsReadiness: vi.fn(),
  fetchPricingMatrices: vi.fn(),
  fetchRuleSets: vi.fn(),
  fetchTees: vi.fn(),
  publishGolfPricingMatrix: (...args: unknown[]) => mockPublishGolfPricingMatrix(...args),
  publishGolfRuleSet: (...args: unknown[]) => mockPublishGolfRuleSet(...args),
  rollbackGolfPricingMatrix: (...args: unknown[]) => mockRollbackGolfPricingMatrix(...args),
  rollbackGolfRuleSet: (...args: unknown[]) => mockRollbackGolfRuleSet(...args),
  updateClubConfig: vi.fn(),
  updatePricingMatrix: vi.fn(),
  updateRuleSet: vi.fn(),
}));

function buildQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

type MutationScenario = {
  name: string;
  useHook: () => { mutate: (...args: never[]) => unknown };
  apiMock: ReturnType<typeof vi.fn>;
  payload?: unknown;
  expectedApiArgs: unknown[];
};

function MutationHarness({
  useHook,
  payload,
}: {
  useHook: () => { mutate: (...args: never[]) => unknown };
  payload?: unknown;
}): JSX.Element {
  const mutation = useHook();

  return (
    <button
      onClick={() => {
        if (payload === undefined) {
          (mutation.mutate as () => void)();
          return;
        }
        (mutation.mutate as (variables: unknown) => void)(payload);
      }}
      type="button"
    >
      Run
    </button>
  );
}

describe("golf settings mutation ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({
      accessToken: "token",
      bootstrap: {
        selected_club_id: "club-1",
      },
    });

    mockCreateCourse.mockResolvedValue({});
    mockCreatePricingMatrix.mockResolvedValue({});
    mockCreateRuleSet.mockResolvedValue({});
    mockCreateTee.mockResolvedValue({});
    mockPublishGolfPricingMatrix.mockResolvedValue({});
    mockPublishGolfRuleSet.mockResolvedValue({});
    mockRollbackGolfPricingMatrix.mockResolvedValue({});
    mockRollbackGolfRuleSet.mockResolvedValue({});
  });

  const scenarios: MutationScenario[] = [
    {
      name: "create course",
      useHook: useCreateCourseMutation,
      apiMock: mockCreateCourse,
      payload: { name: "Championship", holes: 18, active: true },
      expectedApiArgs: [
        { name: "Championship", holes: 18, active: true },
        { accessToken: "token", selectedClubId: "club-1" },
      ],
    },
    {
      name: "create tee",
      useHook: useCreateTeeMutation,
      apiMock: mockCreateTee,
      payload: {
        course_id: "course-1",
        name: "Blue",
        gender: "mixed",
        slope_rating: 113,
        course_rating: "72.0",
        color_code: "#1b4d8f",
        active: true,
      },
      expectedApiArgs: [
        {
          course_id: "course-1",
          name: "Blue",
          gender: "mixed",
          slope_rating: 113,
          course_rating: "72.0",
          color_code: "#1b4d8f",
          active: true,
        },
        { accessToken: "token", selectedClubId: "club-1" },
      ],
    },
    {
      name: "create rule set",
      useHook: useCreateRuleSetMutation,
      apiMock: mockCreateRuleSet,
      payload: {
        name: "Member Standard",
        applies_to: "member",
        priority: 10,
        active: false,
        rules: [{ type: "advance_window", config: { days: 14 }, active: true }],
      },
      expectedApiArgs: [
        {
          name: "Member Standard",
          applies_to: "member",
          priority: 10,
          active: false,
          rules: [{ type: "advance_window", config: { days: 14 }, active: true }],
        },
        { accessToken: "token", selectedClubId: "club-1" },
      ],
    },
    {
      name: "create pricing matrix",
      useHook: useCreatePricingMatrixMutation,
      apiMock: mockCreatePricingMatrix,
      payload: {
        name: "Guest Benchmark",
        active: false,
        rules: [
          {
            applies_to: "guest",
            player_type: "visitor_affiliated",
            holes: 18,
            day_type: "weekday",
            season: "off_peak",
            time_band: "any",
            time_band_ref: null,
            price: "575.00",
            currency: "ZAR",
            active: true,
          },
        ],
      },
      expectedApiArgs: [
        {
          name: "Guest Benchmark",
          active: false,
          rules: [
            {
              applies_to: "guest",
              player_type: "visitor_affiliated",
              holes: 18,
              day_type: "weekday",
              season: "off_peak",
              time_band: "any",
              time_band_ref: null,
              price: "575.00",
              currency: "ZAR",
              active: true,
            },
          ],
        },
        { accessToken: "token", selectedClubId: "club-1" },
      ],
    },
    {
      name: "publish rule set",
      useHook: usePublishGolfRuleSetMutation,
      apiMock: mockPublishGolfRuleSet,
      payload: "rule-1",
      expectedApiArgs: ["rule-1", { accessToken: "token", selectedClubId: "club-1" }],
    },
    {
      name: "rollback rule set",
      useHook: useRollbackGolfRuleSetMutation,
      apiMock: mockRollbackGolfRuleSet,
      expectedApiArgs: [{ accessToken: "token", selectedClubId: "club-1" }],
    },
    {
      name: "publish pricing matrix",
      useHook: usePublishGolfPricingMatrixMutation,
      apiMock: mockPublishGolfPricingMatrix,
      payload: "pricing-1",
      expectedApiArgs: ["pricing-1", { accessToken: "token", selectedClubId: "club-1" }],
    },
    {
      name: "rollback pricing matrix",
      useHook: useRollbackGolfPricingMatrixMutation,
      apiMock: mockRollbackGolfPricingMatrix,
      expectedApiArgs: [{ accessToken: "token", selectedClubId: "club-1" }],
    },
  ];

  test.each(scenarios)("$name uses canonical invalidation after success", async (scenario) => {
    const queryClient = buildQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    render(
      <QueryClientProvider client={queryClient}>
        <MutationHarness payload={scenario.payload} useHook={scenario.useHook} />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    await waitFor(() => {
      expect(scenario.apiMock).toHaveBeenCalledWith(...scenario.expectedApiArgs);
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["operations", "club-1", "courses"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["operations", "club-1", "tees"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["operations", "club-1", "rules"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["operations", "club-1", "pricing"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["operations", "club-1", "golf-settings-readiness"] });
    });
  });
});
