import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AdminCommunicationsPage } from "./admin-communications-page";

const mockUseSession = vi.fn();
const mockUseNewsPostsQuery = vi.fn();
const mockUsePublishedNewsFeedQuery = vi.fn();
const mockUseCreateNewsPostMutation = vi.fn();
const mockUseUpdateNewsPostMutation = vi.fn();
const mockUseDeleteNewsPostMutation = vi.fn();

vi.mock("../session/session-context", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../features/comms/hooks", () => ({
  useNewsPostsQuery: () => mockUseNewsPostsQuery(),
  usePublishedNewsFeedQuery: () => mockUsePublishedNewsFeedQuery(),
  useCreateNewsPostMutation: () => mockUseCreateNewsPostMutation(),
  useUpdateNewsPostMutation: () => mockUseUpdateNewsPostMutation(),
  useDeleteNewsPostMutation: () => mockUseDeleteNewsPostMutation(),
}));

function renderPage(): void {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  render(
    <MemoryRouter initialEntries={["/admin/communications"]}>
      <QueryClientProvider client={queryClient}>
        <AdminCommunicationsPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const post = {
  id: "post-1",
  club_id: "club-1",
  title: "Course Aeration",
  body: "The front nine reopens at 10:00 after maintenance.",
  visibility: "members_only" as const,
  status: "published" as const,
  pinned: true,
  published_at: "2026-04-04T08:00:00Z",
  created_at: "2026-04-04T08:00:00Z",
  updated_at: "2026-04-04T08:00:00Z",
  author: { person_id: "person-1", full_name: "Admin User" },
};

describe("AdminCommunicationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({
      accessToken: "token",
      bootstrap: {
        user: { id: "user-1", email: "admin@test.com", display_name: "Admin User", user_type: "user" },
        available_clubs: [
          {
            club_id: "club-1",
            club_name: "Club One",
            club_slug: "club-one",
            membership_role: "club_admin",
            membership_status: "active",
            selectable: true,
            is_primary_hint: true,
          },
        ],
        selected_club_id: "club-1",
        selected_club: { id: "club-1", name: "Club One", slug: "club-one", location: "", timezone: "Africa/Johannesburg", branding: { logo_object_key: null, name: null } },
        club_selection_required: false,
        role_shell: "admin",
        default_workspace: "/admin/communications",
        landing_path: "/admin/communications",
        module_flags: {},
        permissions: [],
        feature_flags: {},
      },
    });
    mockUseNewsPostsQuery.mockReturnValue({
      data: { posts: [post], total_count: 1 },
      isLoading: false,
    });
    mockUsePublishedNewsFeedQuery.mockReturnValue({
      data: { posts: [post], total_count: 1 },
      isLoading: false,
    });
    mockUseCreateNewsPostMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(post),
      isPending: false,
    });
    mockUseUpdateNewsPostMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(post),
      isPending: false,
    });
    mockUseDeleteNewsPostMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
    });
  });

  test("allows a club admin to publish a new post and shows the member-feed confirmation", async () => {
    const mutateAsync = vi.fn().mockResolvedValue(post);
    mockUseCreateNewsPostMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
    });
    mockUseNewsPostsQuery.mockReturnValue({
      data: { posts: [], total_count: 0 },
      isLoading: false,
    });
    mockUsePublishedNewsFeedQuery.mockReturnValue({
      data: { posts: [post], total_count: 1 },
      isLoading: false,
    });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /create first post/i }));
    fireEvent.change(screen.getByPlaceholderText("Post title..."), { target: { value: "Weekend shotgun start" } });
    fireEvent.change(screen.getByPlaceholderText("Write your message..."), {
      target: { value: "All players should arrive 30 minutes before tee off." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        title: "Weekend shotgun start",
        body: "All players should arrive 30 minutes before tee off.",
        visibility: "members_only",
        pinned: false,
        publish: true,
      });
    });

    expect(screen.getByText("Post published. It now appears in club updates for members.")).toBeInTheDocument();
    expect(screen.getByText("Live Member Feed")).toBeInTheDocument();
  });

  test("keeps staff users in read-only mode for posts", () => {
    mockUseSession.mockReturnValue({
      accessToken: "token",
      bootstrap: {
        user: { id: "user-2", email: "staff@test.com", display_name: "Staff User", user_type: "user" },
        available_clubs: [
          {
            club_id: "club-1",
            club_name: "Club One",
            club_slug: "club-one",
            membership_role: "club_staff",
            membership_status: "active",
            selectable: true,
            is_primary_hint: true,
          },
        ],
        selected_club_id: "club-1",
        selected_club: { id: "club-1", name: "Club One", slug: "club-one", location: "", timezone: "Africa/Johannesburg", branding: { logo_object_key: null, name: null } },
        club_selection_required: false,
        role_shell: "admin",
        default_workspace: "/admin/communications",
        landing_path: "/admin/communications",
        module_flags: {},
        permissions: [],
        feature_flags: {},
      },
    });

    renderPage();

    expect(screen.getByText(/only club admins can create, publish, pin, or delete/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /admin access required/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^publish$/i })).not.toBeInTheDocument();
    expect(screen.getByText(/staff can review member-facing updates here/i)).toBeInTheDocument();
  });
});
