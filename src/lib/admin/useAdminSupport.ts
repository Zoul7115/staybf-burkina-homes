import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import type { AdminTicketRow } from "./types";

type RawRow = {
  id: string;
  subject: string;
  status: string;
  priority: string;
  category: string | null;
  updated_at: string;
  created_at: string;
  profiles: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
};

function unwrap<T>(v: T | T[] | null): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export type UseAdminSupportReturn = {
  tickets: AdminTicketRow[];
  loading: boolean;
  error: string | null;
  sendReply: (ticketId: string, body: string) => Promise<void>;
  sending: boolean;
  sendError: string | null;
};

export function useAdminSupport(): UseAdminSupportReturn {
  const [tickets, setTickets] = useState<AdminTicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: dbErr } = await (supabase as any)
        .from("support_tickets")
        .select(`
          id, subject, status, priority, category, updated_at, created_at,
          profiles!requester_id(full_name, email)
        `)
        .not("status", "eq", "closed")
        .order("updated_at", { ascending: false })
        .limit(100);

      if (cancelled) return;
      if (dbErr) { setError(dbErr.message); setLoading(false); return; }

      const mapped: AdminTicketRow[] = ((data ?? []) as RawRow[]).map((t) => {
        const req = unwrap(t.profiles);
        return {
          id: t.id,
          subject: t.subject,
          status: t.status,
          priority: t.priority,
          category: t.category,
          requesterName: req?.full_name ?? null,
          requesterEmail: req?.email ?? null,
          updatedAt: t.updated_at,
          createdAt: t.created_at,
        };
      });

      setTickets(mapped);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  // ticket_messages: GRANT INSERT allowed for admin
  const sendReply = useCallback(async (ticketId: string, body: string) => {
    if (!body.trim()) return;
    setSending(true);
    setSendError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSendError("Non authentifié."); setSending(false); return; }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: dbErr } = await (supabase as any)
      .from("ticket_messages")
      .insert({ ticket_id: ticketId, sender_id: user.id, body: body.trim(), is_internal: false });

    if (dbErr) { setSendError(dbErr.message); setSending(false); return; }
    setSending(false);
  }, []);

  return { tickets, loading, error, sendReply, sending, sendError };
}
