import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Send, MessageSquare } from "lucide-react";
import { TravelerShell } from "@/components/traveler/TravelerShell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { conversations } from "@/lib/staybf-traveler-data";

export const Route = createFileRoute("/traveler/messages")({
  head: () => ({ meta: [{ title: "Messages — StayBF" }] }),
  component: MessagesPage,
});

function MessagesPage() {
  const [activeId, setActiveId] = useState(conversations[0]?.id);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const filtered = conversations.filter((c) => c.hostName.toLowerCase().includes(query.toLowerCase()));
  const active = conversations.find((c) => c.id === activeId);
  const [messages, setMessages] = useState(active?.messages ?? []);

  const switchConv = (id: string) => {
    setActiveId(id);
    setMessages(conversations.find((c) => c.id === id)?.messages ?? []);
  };

  const send = () => {
    if (!draft.trim()) return;
    setMessages((m) => [...m, { from: "me", text: draft.trim(), time: "À l'instant" }]);
    setDraft("");
  };

  return (
    <TravelerShell title="Messages">
      <div className="rounded-3xl bg-card border border-border overflow-hidden shadow-card grid md:grid-cols-[320px_1fr] h-[calc(100vh-180px)] min-h-[500px]">
        {/* List */}
        <div className={cn("border-r border-border flex flex-col", active && "hidden md:flex")}>
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher…" className="pl-9 h-10 rounded-xl bg-muted/50 border-0" />
            </div>
          </div>
          <ul className="flex-1 overflow-y-auto">
            {filtered.map((c) => (
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
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">{c.time}</span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{c.lastMessage}</p>
                  </div>
                  {c.unread > 0 && (
                    <Badge className="bg-primary text-primary-foreground border-0 h-5 min-w-5 px-1.5 text-[10px] mt-1">{c.unread}</Badge>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Thread */}
        {active ? (
          <div className="flex flex-col min-w-0">
            <div className="px-4 py-3 border-b border-border flex items-center gap-3">
              <button className="md:hidden text-sm text-primary" onClick={() => setActiveId(undefined)}>← Retour</button>
              <div className="h-10 w-10 rounded-full gradient-primary text-primary-foreground grid place-items-center font-bold text-sm">
                {active.hostInitials}
              </div>
              <div className="min-w-0">
                <p className="font-semibold truncate">{active.hostName}</p>
                <p className="text-xs text-muted-foreground">En ligne</p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/20">
              {messages.map((m, i) => (
                <motion.div
                  key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className={cn("max-w-[75%] flex flex-col", m.from === "me" ? "ml-auto items-end" : "items-start")}
                >
                  <div className={cn("rounded-2xl px-4 py-2.5 text-sm shadow-sm",
                    m.from === "me" ? "gradient-primary text-primary-foreground" : "bg-card border border-border")}>
                    {m.text}
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-1">{m.time}</span>
                </motion.div>
              ))}
            </div>
            <div className="p-3 border-t border-border flex gap-2">
              <Input
                value={draft} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                placeholder="Écrire un message…" className="h-11 rounded-xl"
              />
              <Button onClick={send} className="h-11 rounded-xl gradient-primary text-primary-foreground px-4">
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
