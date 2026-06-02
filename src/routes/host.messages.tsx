import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Paperclip, Send, Search } from "lucide-react";
import { hostConversations } from "@/lib/staybf-host-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/host/messages")({ component: HostMessagesPage });

function HostMessagesPage() {
  const [active, setActive] = useState(hostConversations[0]);
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState("");

  const list = hostConversations.filter((c) => c.guest.toLowerCase().includes(q.toLowerCase()));

  return (
    <Card className="overflow-hidden h-[calc(100vh-220px)] flex">
      <div className="w-full sm:w-80 border-r border-border flex flex-col">
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher..." className="pl-9 h-9 bg-muted/50" />
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {list.map((c) => (
            <li key={c.id}>
              <button onClick={() => setActive(c)}
                className={cn("w-full text-left p-3 flex gap-3 hover:bg-muted/50 transition border-b border-border",
                  active.id === c.id && "bg-primary/5")}>
                <div className="h-10 w-10 rounded-full gradient-primary text-primary-foreground grid place-items-center text-xs font-bold shrink-0">{c.avatar}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-sm truncate">{c.guest}</p>
                    <span className="text-[10px] text-muted-foreground shrink-0">{c.time}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground truncate">{c.lastMessage}</p>
                    {c.unread > 0 && <span className="text-[10px] font-bold rounded-full h-4 min-w-4 px-1.5 grid place-items-center bg-primary text-primary-foreground shrink-0">{c.unread}</span>}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="hidden sm:flex flex-1 flex-col">
        <div className="px-5 h-14 border-b border-border flex items-center gap-3">
          <div className="h-9 w-9 rounded-full gradient-primary text-primary-foreground grid place-items-center text-xs font-bold">{active.avatar}</div>
          <div className="flex-1">
            <p className="font-semibold text-sm">{active.guest}</p>
            <p className="text-[11px] text-muted-foreground">En ligne</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-muted/30">
          {active.messages.map((m, i) => (
            <div key={i} className={cn("max-w-[75%] rounded-2xl px-4 py-2",
              m.from === "me" ? "ml-auto gradient-primary text-primary-foreground" : "bg-background border border-border")}>
              <p className="text-sm">{m.text}</p>
              <p className={cn("text-[10px] mt-1", m.from === "me" ? "text-primary-foreground/70" : "text-muted-foreground")}>{m.time}</p>
            </div>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); setDraft(""); }} className="p-3 border-t border-border flex items-center gap-2">
          <Button type="button" variant="ghost" size="icon"><Paperclip className="h-4 w-4" /></Button>
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Écrire un message..." className="flex-1" />
          <Button type="submit" size="icon" className="gradient-primary text-primary-foreground"><Send className="h-4 w-4" /></Button>
        </form>
      </div>
    </Card>
  );
}
