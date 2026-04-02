import { useState } from "react";

import { MaterialSymbol } from "../components/benchmark/material-symbol";
import AdminShell from "../components/shell/AdminShell";
import {
  useCreateNewsPostMutation,
  useDeleteNewsPostMutation,
  useNewsPostsQuery,
  useUpdateNewsPostMutation,
} from "../features/comms/hooks";
import { useSession } from "../session/session-context";
import type { NewsPost, NewsPostVisibility } from "../types/comms";

type Tab = "all" | "published" | "draft";

function visibilityLabel(v: NewsPostVisibility): string {
  switch (v) {
    case "public":       return "Public";
    case "members_only": return "Members Only";
    case "internal":     return "Internal";
  }
}

function visibilityIcon(v: NewsPostVisibility): string {
  switch (v) {
    case "public":       return "public";
    case "members_only": return "group";
    case "internal":     return "lock";
  }
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return "just now";
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

interface ComposeModalProps {
  onClose: () => void;
}

function ComposeModal({ onClose }: ComposeModalProps): JSX.Element {
  const [title, setTitle]           = useState("");
  const [body, setBody]             = useState("");
  const [visibility, setVisibility] = useState<NewsPostVisibility>("members_only");
  const [pinned, setPinned]         = useState(false);
  const createMutation = useCreateNewsPostMutation();

  function handleSubmit(publish: boolean): void {
    if (!title.trim() || !body.trim()) return;
    createMutation.mutate(
      { title: title.trim(), body: body.trim(), visibility, pinned, publish },
      { onSuccess: onClose },
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="font-headline text-base font-extrabold text-slate-900">New Post</h3>
          <button className="rounded-full p-2 text-slate-400 hover:bg-slate-100" onClick={onClose} type="button">
            <MaterialSymbol icon="close" />
          </button>
        </div>
        <div className="space-y-4 p-6">
          <input
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="Post title…"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="Write your message…"
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <span>Visibility</span>
              <select
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as NewsPostVisibility)}
              >
                <option value="public">Public</option>
                <option value="members_only">Members Only</option>
                <option value="internal">Internal</option>
              </select>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-600">
              <input
                checked={pinned}
                className="accent-primary"
                type="checkbox"
                onChange={(e) => setPinned(e.target.checked)}
              />
              Pin to top
            </label>
          </div>
        </div>
        <div className="flex gap-3 border-t border-slate-100 px-6 py-4">
          <button
            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            disabled={createMutation.isPending}
            type="button"
            onClick={() => handleSubmit(false)}
          >
            Save Draft
          </button>
          <button
            className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-white hover:bg-primary-dim disabled:opacity-50"
            disabled={createMutation.isPending || !title.trim() || !body.trim()}
            type="button"
            onClick={() => handleSubmit(true)}
          >
            {createMutation.isPending ? "Publishing…" : "Publish"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface PostCardProps {
  post: NewsPost;
}

function PostCard({ post }: PostCardProps): JSX.Element {
  const updateMutation = useUpdateNewsPostMutation();
  const deleteMutation = useDeleteNewsPostMutation();

  return (
    <div className={`rounded-2xl border bg-surface-container-lowest p-5 shadow-sm ${post.pinned ? "border-primary/20" : "border-slate-100"}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {post.pinned && (
            <MaterialSymbol className="text-sm text-primary" filled icon="push_pin" />
          )}
          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${post.status === "published" ? "bg-primary-container text-on-primary-container" : "bg-slate-100 text-slate-500"}`}>
            {post.status}
          </span>
          <span className="flex items-center gap-1 text-[10px] text-slate-400">
            <MaterialSymbol className="text-[12px]" icon={visibilityIcon(post.visibility)} />
            {visibilityLabel(post.visibility)}
          </span>
        </div>
        <span className="shrink-0 text-[10px] text-slate-400">{timeAgo(post.created_at)}</span>
      </div>

      <h4 className="mb-1.5 font-headline text-sm font-extrabold text-on-surface">{post.title}</h4>
      <p className="line-clamp-3 text-sm leading-relaxed text-slate-600">{post.body}</p>

      {post.author && (
        <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          By {post.author.full_name}
        </p>
      )}

      <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3">
        {post.status === "draft" ? (
          <button
            className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-primary-dim disabled:opacity-50"
            disabled={updateMutation.isPending}
            type="button"
            onClick={() => updateMutation.mutate({ postId: post.id, payload: { publish: true } })}
          >
            Publish
          </button>
        ) : (
          <button
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-200 disabled:opacity-50"
            disabled={updateMutation.isPending}
            type="button"
            onClick={() => updateMutation.mutate({ postId: post.id, payload: { unpublish: true } })}
          >
            Unpublish
          </button>
        )}
        <button
          className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors ${post.pinned ? "bg-primary-container text-primary hover:bg-primary-container/70" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
          disabled={updateMutation.isPending}
          type="button"
          onClick={() => updateMutation.mutate({ postId: post.id, payload: { pinned: !post.pinned } })}
        >
          {post.pinned ? "Unpin" : "Pin"}
        </button>
        <button
          className="ml-auto rounded-lg px-3 py-1.5 text-[11px] font-bold text-error transition-colors hover:bg-error-container disabled:opacity-50"
          disabled={deleteMutation.isPending}
          type="button"
          onClick={() => { if (confirm("Delete this post?")) deleteMutation.mutate(post.id); }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export function AdminCommunicationsPage(): JSX.Element {
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;
  const [tab, setTab]           = useState<Tab>("all");
  const [composing, setComposing] = useState(false);

  const statusFilter = tab === "all" ? undefined : tab === "published" ? "published" : "draft";
  const postsQuery = useNewsPostsQuery({ accessToken, selectedClubId, status: statusFilter as any });

  const posts = postsQuery.data?.posts ?? [];
  const total = postsQuery.data?.total_count ?? 0;
  const publishedCount = posts.filter((p) => p.status === "published").length;
  const draftCount     = posts.filter((p) => p.status === "draft").length;
  const pinnedCount    = posts.filter((p) => p.pinned).length;

  return (
    <AdminShell title="Communications" searchPlaceholder="Search posts...">
      {composing && <ComposeModal onClose={() => setComposing(false)} />}

      <div className="mx-auto max-w-4xl px-6 py-8 space-y-8">

        {/* KPI row */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl bg-primary p-5 text-white shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">Total Posts</p>
            <p className="mt-2 font-headline text-3xl font-extrabold">{postsQuery.isLoading ? "—" : total}</p>
          </div>
          <div className="rounded-2xl bg-surface-container-lowest p-5 shadow-sm border border-slate-100">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Published</p>
            <p className="mt-2 font-headline text-3xl font-extrabold text-on-surface">{postsQuery.isLoading ? "—" : publishedCount}</p>
          </div>
          <div className="rounded-2xl bg-surface-container-lowest p-5 shadow-sm border border-slate-100">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Drafts</p>
            <p className="mt-2 font-headline text-3xl font-extrabold text-on-surface">{postsQuery.isLoading ? "—" : draftCount}</p>
          </div>
          <div className="rounded-2xl bg-surface-container-lowest p-5 shadow-sm border border-slate-100">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Pinned</p>
            <p className="mt-2 font-headline text-3xl font-extrabold text-on-surface">{postsQuery.isLoading ? "—" : pinnedCount}</p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-1 rounded-xl border border-slate-200 bg-surface-container-lowest p-1">
            {(["all", "published", "draft"] as Tab[]).map((t) => (
              <button
                className={`rounded-lg px-4 py-1.5 text-sm font-bold transition-colors ${tab === t ? "bg-primary text-white shadow-sm" : "text-slate-500 hover:text-on-surface"}`}
                key={t}
                type="button"
                onClick={() => setTab(t)}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <button
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-dim"
            type="button"
            onClick={() => setComposing(true)}
          >
            <MaterialSymbol icon="add" />
            New Post
          </button>
        </div>

        {/* Posts */}
        {postsQuery.isLoading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => <div className="h-36 animate-pulse rounded-2xl bg-slate-100" key={i} />)}
          </div>
        )}

        {!postsQuery.isLoading && posts.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <MaterialSymbol className="text-5xl text-slate-200" filled icon="newspaper" />
            <p className="text-sm font-medium text-slate-400">
              {tab === "all" ? "No posts yet. Create your first one." : `No ${tab} posts.`}
            </p>
            <button
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary-dim"
              type="button"
              onClick={() => setComposing(true)}
            >
              <MaterialSymbol icon="add" />
              Create Post
            </button>
          </div>
        )}

        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
