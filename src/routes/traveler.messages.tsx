import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Search, Send, MessageSquare } from "lucide-react";
import { TravelerShell } from "@/components/traveler/TravelerShell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useTravelerMessages, useThreadMessages } from "@/lib/traveler/useTravelerMessages";
import { useRealtimeMessages } from "@/lib/realtime";
import { supabase } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/traveler/messages")({
  head: () => ({ meta: [{ title: "Messages — StayBF" }] }),
  component: MessagesPage,
});

function MessagesPage() {
  const { threads, loading: threadsLoading } = useTravelerMessages();
  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: userId } = useQuery({
    queryKey: ["auth", "userId"],
    queryFn: async () => { const { data: { user } } = await supabase.auth.getUser(); return user?.id ?? null; },
    staleTime: Infinity,
  });

  const filtered = threads.filter((c) => c.hostName.toLowerCase().includes(query.toLowerCase()));
  const active = threads.find((c) => c.id === activeId);

  const { messages, loading: messagesLoading, send, markRead } = useThreadMessages(activeId);

  // Realtime: push incoming messages directly into cache
  useRealtimeMessages(activeId ?? null, "traveler", userId ?? null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Mark messages as read when a thread becomes active
  useEffect(() => {
    if (activeId && !messagesLoading) markRead();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, messagesLoading]);

  const switchConv = (id: string) => {
    setActiveId(id);
    setDraft("");
  };

  const handleSend = async () => {
    if (!draft.trim()) return;
    await send(draft.trim());
    setDraft("");
  };

  return (
    <TravelerShell title="Messages">
      <div className="rounded-3xl bg-card border border-border overflow-hidden shadow-card grid md:grid-cols-[320px_1fr] h-[calc(100vh-180px)] min-h-[500px]">
        {/* Thread list */}
        <div className={cn("border-r border-border flex flex-col", active && "hidden md:flex")}>
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher…" className="pl-9 h-10 rounded-xl bg-muted/50 border-0" />
            </div>
          </div>
          <ul className="flex-1 overflow-y-auto">
            {threadsLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="px-4 py-3 border-b border-border flex items-start gap-3">
                  <Skeleton className="h-11 w-11 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </li>
              ))
            ) : filtered.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-muted-foreground">Aucune conversation</li>
            ) : (
              filtered.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => switchConv(c.id)}
                    className={cn("w-full text-left px-4 py-3 flex items-start gap-3 border-b border-border hover:bg-muted/50 transition",
                      activeId === c.id && "bg-primary/5")}
                  >
                    <div className="h-11 w-11 rounded-full gradient-primary text-primary-foreground grid place-items-center font-bold text-sm shrink-0">
                      {c.hostInitials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-sm truncate">{c.hostName}</p>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">{c.lastMessageLabel}</span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{c.lastMessageBody ?? ""}</p>
                    </div>
                    {c.unreadCount > 0 && (
                      <Badge className="bg-primary text-primary-foreground border-0 h-5 min-w-5 px-1.5 text-[10px] mt-1">{c.unreadCount}</Badge>
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>

        {/* Thread messages */}
        {active ? (
          <div className="flex flex-col min-w-0">
            <div className="px-4 py-3 border-b border-border flex items-center gap-3">
              <button className="md:hidden text-sm text-primary" onClick={() => setActiveId(undefined)}>← Retour</button>
              <div className="h-10 w-10 rounded-full gradient-primary text-primary-foreground grid place-items-center font-bold text-sm">
                {active.hostInitials}
              </div>
              <div className="min-w-0">
                <p className="font-semibold truncate">{active.hostName}</p>
                {active.propertyName && <p className="text-xs text-muted-foreground truncate">{active.propertyName}</p>}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/20">
              {messagesLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className={cn("max-w-[75%] flex flex-col", i % 2 === 0 ? "ml-auto items-end" : "items-start")}>
                    <Skeleton className="h-10 w-48 rounded-2xl" />
                  </div>
                ))
              ) : (
                messages.map((m, i) => (
                  <motion.div
                    key={m.id ?? i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    className={cn("max-w-[75%] flex flex-col", m.isFromMe ? "ml-auto items-end" : "items-start")}
                  >
                    <div className={cn("rounded-2xl px-4 py-2.5 text-sm shadow-sm",
                      m.isFromMe ? "gradient-primary text-primary-foreground" : "bg-card border border-border")}>
                      {m.body}
                    </div>
                    <span className="text-[10px] text-muted-foreground mt-1">{m.timeLabel}</span>
                  </motion.div>
                ))
              )}
              <div ref={bottomRef} />
            </div>
            <div className="p-3 border-t border-border flex gap-2">
              <Input
                value={draft} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
                placeholder="Écrire un message…" className="h-11 rounded-xl"
              />
              <Button onClick={handleSend} className="h-11 rounded-xl gradient-primary text-primary-foreground px-4">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="hidden md:flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageSquare className="h-10 w-10 mx-auto opacity-40" />
              <p className="mt-2 text-sm">Sélectionnez une conversation</p>
            </div>
          </div>
        )}
      </div>
    </TravelerShell>
  );
}
