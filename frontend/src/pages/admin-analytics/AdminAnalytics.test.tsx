// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminAnalyticsPage from "@/pages/admin-analytics";
import * as api from "@/lib/api";

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminAnalyticsPage />
    </MemoryRouter>,
  );
}

describe("AdminAnalyticsPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ne plante pas quand l'API ne renvoie qu'une partie des blocs", async () => {
    // Réponse de l'ancien backend : ni commandes, ni paiements, ni plaintes, ni abonnements.
    vi.spyOn(api, "apiGet").mockResolvedValue({
      users: { total: 12, active: 10, unverified: 2 },
      stores: { total: 3, active: 2, pending_review: 1, suspended: 0 },
      trend: { new_users: [] },
    });
    renderPage();
    expect(await screen.findByRole("heading", { name: "Analytics" })).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Commandes")).toBeInTheDocument();
  });

  it("affiche le chiffre d'affaires en FCFA", async () => {
    vi.spyOn(api, "apiGet").mockResolvedValue({
      users: { total: 1, active: 1, unverified: 0 },
      stores: { total: 1, active: 1, pending_review: 0, suspended: 0 },
      orders: { total: 4, pending: 1, delivered: 2, cancelled: 1 },
      payments: { total: 3, success: 2, failed: 1, revenue: "45000.00" },
      complaints: { total: 0, open: 0, resolved: 0 },
      subscriptions: { total: 1, active: 1, expiring: 0 },
      trend: { new_users: [], new_orders: [] },
    });
    renderPage();
    expect(await screen.findByText(/45\s?000/)).toBeInTheDocument();
    expect(screen.getByText("2 paiements réussis")).toBeInTheDocument();
  });
});
