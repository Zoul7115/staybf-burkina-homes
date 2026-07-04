import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Paperclip, Send, Search, MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/dashboard/widgets";
import { useHostThreads, useHostThreadMessages } from "@/lib/host";
import { useRealtimeMessages } from "@/lib/realtime";
import { getInitials } from "@/lib/shared";
import { cn } from "@/lib/utils";
import type { HostThread } from "@/lib/host";
import { supabase } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/host/messages")({ component: HostMessagesPage });

// ── Helpers ───────────────────────────────────────────────────

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = diffMs / 3_600_000;
  if (diffH < 24) {
    return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }
  if (diffH < 48) return "Hier";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

// ── Skeleton ──────────────────────────────────────────────────

function MessagesSkeleton() {
  return (
    <Card className="overflow-hidden h-[calc(100vh-220px)] flex">
      {/* Thread list skeleton */}
      <div className="w-full sm:w-80 border-r border-border flex flex-col shrink-0">
        <div className="p-3 border-b border-border">
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
        <ul className="flex-1 overflow-y-auto p-2 space-y-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="p-3 flex gap-3">
              <Skeleton className="h-10 w-10 rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3 w-full" />
              </div>
            </li>
          ))}
        </ul>
      </div>
      {/* Message panel skeleton */}
      <div className="hidden sm:flex flex-1 flex-col">
        <div className="px-5 h-14 border-b border-border flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="space-y-1">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-2.5 w-20" />
          </div>
        </div>
        <div className="flex-1 p-5 space-y-3 bg-muted/30">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={cn("flex", i % 2 === 0 ? "justify-start" : "justify-end")}>
              <Skeleton className={cn("h-10 rounded-2xl", i % 2 === 0 ? "w-48" : "w-36")} />
            </div>
          ))}
        </div>
        <div className="p-3 border-t border-border flex items-center gap-2">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="flex-1 h-9 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
        </div>
      </div>
    </Card>
  );
}

// ── Thread list item ──────────────────────────────────────────

function ThreadItem({
  thread,
  isActive,
  hostUserId,
  onClick,
}: {
  thread: HostThread;
  isActive: boolean;
  hostUserId: string;
  onClick: () => void;
}) {
  const isLastFromHost = thread.lastMessageSenderId === hostUserId;

  return (
    <li>
      <button
        onClick={onClick}
        className={cn(
          "w-full text-left p-3 flex gap-3 hover:bg-muted/50 transition border-b border-border",
          isActive && "bg-primary/5"
        )}
      >
        <div className="h-10 w-10 rounded-full gradient-primary text-primary-foreground grid place-items-center text-xs font-bold shrink-0">
          {getInitials(thread.travelerName)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-sm truncate">
              {thread.travelerName ?? "Voyageur"}
            </p>
            <span className="text-[10px] text-muted-foreground shrink-0">
              {fmtTime(thread.lastMessageAt)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground truncate">
              {isLastFromHost && "Vous : "}
              {thread.lastMessageBody ?? thread.subject ?? thread.roomName ?? "—"}
            </p>
            {thread.hostUnreadCount > 0 && (
              <span className="text-[10px] font-bold rounded-full h-4 min-w-4 px-1.5 grid place-items-center bg-primary text-primary-foreground shrink-0">
                {thread.hostUnreadCount}
              </span>
            )}
          </div>
          {thread.propertyName && (
            <p className="text-[10px] text-muted-foreground truncate mt-0.5">
              {thread.propertyName}
            </p>
          )}
        </div>
      </button>
    </li>
  );
}

// ── Message panel ─────────────────────────────────────────────

function MessagePanel({
  thread,
  hostUserId,
}: {
  thread: HostThread;
  hostUserId: string;
}) {
  const { messages, loading, error, sendMessage, sending, sendError } =
    useHostThreadMessages(thread.id);

  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Realtime: push incoming messages directly into cache
  useRealtimeMessages(thread.id, "host", hostUserId);

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || sending) return;
    const text = draft;
    setDraft("");
    await sendMessage(text);
  }

  return (
    <div className="hidden sm:flex flex-1 flex-col min-h-0">
      {/* Header */}
      <div className="px-5 h-14 border-b border-border flex items-center gap-3 shrink-0">
        <div className="h-9 w-9 rounded-full gradient-primary text-primary-foreground grid place-items-center text-xs font-bold shrink-0">
          {getInitials(thread.travelerName)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">
            {thread.travelerName ?? "Voyageur"}
          </p>
          <p className="text-[11px] text-muted-foreground truncate">
            {thread.propertyName
              ? `${thread.propertyName}${thread.roomName ? ` · ${thread.roomName}` : ""}`
              : thread.roomName ?? "Conversation"}
          </p>
        </div>
        {thread.isFrozen && (
          <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            Archivée
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-muted/30 min-h-0">
        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={cn("flex", i % 2 === 0 ? "justify-start" : "justify-end")}>
                <Skeleton className={cn("h-10 rounded-2xl", i % 2 === 0 ? "w-48" : "w-36")} />
              </div>
            ))}
          </div>
        )}

        {!loading && error && (
          <p className="text-xs text-destructive text-center">{error}</p>
        )}

        {!loading && !error && messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-10">
            Aucun message dans cette conversation.
          </p>
        )}

        {!loading &&
          messages.map((m) => {
            const isMe = m.senderId === hostUserId;
            const isSystem = m.isSystemMessage;

            if (isSystem) {
              return (
                <div key={m.id} className="text-center">
                  <span className="text-[10px] text-muted-foreground bg-muted/60 rounded-full px-3 py-0.5">
                    {m.body ?? "Événement système"}
                  </span>
                </div>
              );
            }

            return (
              <div
                key={m.id}
                className={cn("max-w-[75%] rounded-2xl px-4 py-2", isMe
                  ? "ml-auto gradient-primary text-primary-foreground"
                  : "bg-background border border-border"
                )}
              >
                <p className="text-sm">{m.body}</p>
                <p
                  className={cn(
                    "text-[10px] mt-1",
                    isMe ? "text-primary-foreground/70" : "text-muted-foreground"
                  )}
                >
                  {fmtTime(m.createdAt)}
                </p>
              </div>
            );
          })}

        <div ref={bottomRef} />
      </div>

      {/* Send form */}
      <form
        onSubmit={handleSubmit}
        className="p-3 border-t border-border flex items-center gap-2 shrink-0"
      >
        {/* Attachments not yet supported — Edge Function needed for signed upload URLs */}
        <Button type="button" variant="ghost" size="icon" disabled title="Pièces jointes — à venir">
          <Paperclip className="h-4 w-4" />
        </Button>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={thread.isFrozen ? "Conversation archivée" : "Écrire un message…"}
          className="flex-1"
          disabled={thread.isFrozen || sending}
        />
        <Button
          type="submit"
          size="icon"
          className="gradient-primary text-primary-foreground"
          disabled={!draft.trim() || sending || thread.isFrozen}
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>

      {sendError && (
        <p className="text-xs text-destructive text-center pb-2">{sendError}</p>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────

function HostMessagesPage() {
  const { threads, loading, error } = useHostThreads();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [hostUserId, setHostUserId] = useState<string>("");

  // Resolve host user id once — used for "isMe" detection and Realtime subscription
  const { data: resolvedUserId } = useQuery({
    queryKey: ["auth", "userId"],
    queryFn: async () => { const { data: { user } } = await supabase.auth.getUser(); return user?.id ?? null; },
    staleTime: Infinity,
  });
  // Keep local state in sync so it can be passed to MessagePanel
  useEffect(() => {
    if (resolvedUserId) setHostUserId(resolvedUserId);
  }, [resolvedUserId]);

  // Auto-select first thread once loaded
  useEffect(() => {
    if (!activeId && threads.length > 0) {
      setActiveId(threads[0].id);
    }
  }, [threads, activeId]);

  const filtered = threads.filter((t) => {
    if (!q) return true;
    const lq = q.toLowerCase();
    return (
      t.travelerName?.toLowerCase().includes(lq) ||
      t.propertyName?.toLowerCase().includes(lq) ||
      t.roomName?.toLowerCase().includes(lq) ||
      t.lastMessageBody?.toLowerCase().includes(lq)
    );
  });

  const activeThread = threads.find((t) => t.id === activeId) ?? null;

  if (loading) return <MessagesSkeleton />;

  if (error) {
    return (
      <Card className="p-10 text-center text-muted-foreground text-sm">
        Erreur lors du chargement des messages : {error}
      </Card>
    );
  }

  if (threads.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="Aucun message"
        description="Vos conversations avec les voyageurs apparaîtront ici."
      />
    );
  }

  return (
    <Card className="overflow-hidden h-[calc(100vh-220px)] flex">
      {/* Thread list */}
      <div className="w-full sm:w-80 border-r border-border flex flex-col shrink-0">
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher…"
              className="pl-9 h-9 bg-muted/50"
            />
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <li className="p-5 text-center text-xs text-muted-foreground">
              Aucune conversation.
            </li>
          )}
          {filtered.map((t) => (
            <ThreadItem
              key={t.id}
              thread={t}
              isActive={t.id === activeId}
              hostUserId={hostUserId}
              onClick={() => setActiveId(t.id)}
            />
          ))}
        </ul>
      </div>

      {/* Message panel */}
      {activeThread ? (
        <MessagePanel
          key={activeThread.id}
          thread={activeThread}
          hostUserId={hostUserId}
        />
      ) : (
        <div className="hidden sm:flex flex-1 items-center justify-center text-muted-foreground text-sm">
          Sélectionnez une conversation
        </div>
      )}
    </Card>
  );
}
