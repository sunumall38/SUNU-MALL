import { apiGet, apiPost } from "@/lib/api";
import type { Paginated } from "@/types";

export type TicketCategory = "question" | "help" | "account" | "payment" | "subscription" | "tech" | "other";

export const TICKET_CATEGORIES: { id: TicketCategory; label: string }[] = [
  { id: "question", label: "Question" },
  { id: "help", label: "Commande / livraison" },
  { id: "payment", label: "Paiement" },
  { id: "account", label: "Mon compte" },
  { id: "subscription", label: "Abonnement" },
  { id: "tech", label: "Problème technique" },
  { id: "other", label: "Autre" },
];

export const TICKET_STATUS: Record<string, { label: string; done: boolean }> = {
  new: { label: "Envoyée", done: false },
  open: { label: "En cours", done: false },
  answered: { label: "Réponse reçue", done: false },
  resolved: { label: "Résolue", done: true },
  closed: { label: "Close", done: true },
};

export interface TicketMessage {
  id: string;
  author_name: string;
  body: string;
  is_support_reply: boolean;
  created_at: string;
}

export interface SupportTicket {
  id: string;
  reference: string;
  category: TicketCategory;
  subject: string;
  description: string;
  status: string;
  messages: TicketMessage[];
  created_at: string;
  updated_at: string;
}

export async function listTickets() {
  const data = await apiGet<Paginated<SupportTicket>>("/complaints/tickets/");
  return data.results;
}

export function getTicket(id: string) {
  return apiGet<SupportTicket>(`/complaints/tickets/${id}/`);
}

export function createTicket(payload: { category: TicketCategory; subject: string; description: string }) {
  return apiPost<SupportTicket>("/complaints/tickets/", payload);
}

export function replyTicket(id: string, body: string) {
  return apiPost<TicketMessage>(`/complaints/tickets/${id}/reply/`, { body });
}
