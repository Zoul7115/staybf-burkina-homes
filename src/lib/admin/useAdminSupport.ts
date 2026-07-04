import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import type { AdminTicketRow } from "./types";

type RawRow = {
  id: string; subject: string; status: string; priority: string; category: string | null;
  updated_at: string; created_at: string;
  profiles: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
};

function unwrap<T>(v: T | T[] | null): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

async function fetchAdminSupport(): Promise<AdminTicketRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error: dbErr } = await (supabase as any)
    .from("support_tickets")
    .select(`id,subject,status,priority,category,updated_at,created_at,profiles!requester_id(full_name,email)`)
    .not("status", "eq", "closed")
    .order("updated_at", { ascending: false })
    .limit(100);

  if (dbErr) throw new Error(dbErr.message);

  return ((data ?? []) as RawRow[]).map((t) => {
    const req = unwrap(t.profiles);
    return {
      id: t.id, subject: t.subject, status: t.status, priority: t.priority, category: t.category,
      requesterName: req?.full_name ?? null, requesterEmail: req?.email ?? null,
      updatedAt: t.updated_at, createdAt: t.created_at,
    };
  });
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
  const queryClient = useQueryClient();
  const KEY = queryKeys.adminSupport();

  const { data, isLoading, error } = useQuery({ queryKey: KEY, queryFn: fetchAdminSupport });

  const replyMutation = useMutation({
    mutationFn: async ({ ticketId, body }: { ticketId: string; body: string }) => {
      if (!body.trim()) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: dbErr } = await (supabase as any)
        .from("ticket_messages")
        .insert({ ticket_id: ticketId, sender_id: user.id, body: body.trim(), is_internal: false });
      if (dbErr) throw new Error(dbErr.message);
    },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: KEY }); },
  });

  return {
    tickets: data ?? [], loading: isLoading, error: error?.message ?? null,
    sendReply: (ticketId, body) => replyMutation.mutateAsync({ ticketId, body }),
    sending: replyMutation.isPending,
    sendError: replyMutation.error?.message ?? null,
  };
}
