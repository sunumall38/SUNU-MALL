// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PaymentReturnPage from "@/pages/payment-return";
import * as paymentsApi from "@/api/payments";
import { successDestination } from "@/lib/paymentFlow";
import type { Payment } from "@/types";

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "pay-1",
    order: "ord-1",
    global_order: null,
    subscription: null,
    method: "wave",
    amount: "10000.00",
    status: "pending",
    provider_ref: "cos-1",
    refund: null,
    created_at: "2026-10-28T00:00:00Z",
    ...overrides,
  };
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/paiement/retour" element={<PaymentReturnPage />} />
        <Route path="/order-confirmed" element={<p>page confirmation</p>} />
        <Route path="/subscriptions" element={<p>page abonnements</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("successDestination", () => {
  it("renvoie vers la bonne page selon l'objet payé", () => {
    expect(successDestination(payment())).toBe("/order-confirmed?order=ord-1");
    expect(successDestination(payment({ order: null, global_order: "g-1" }))).toBe("/order-confirmed?gorder=g-1");
    expect(successDestination(payment({ order: null, subscription: "s-1" }))).toBe("/subscriptions?paiement=ok");
  });
});

describe("PaymentReturnPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("redirige vers la confirmation quand le backend confirme le paiement", async () => {
    vi.spyOn(paymentsApi, "refreshPayment").mockResolvedValue(payment({ status: "success" }));
    renderAt("/paiement/retour?payment=pay-1");
    expect(await screen.findByText("page confirmation")).toBeInTheDocument();
  });

  it("ne croit jamais le retour navigateur : un paiement en attente n'est pas affiché comme réglé", async () => {
    const refresh = vi.spyOn(paymentsApi, "refreshPayment").mockResolvedValue(payment());
    renderAt("/paiement/retour?payment=pay-1");
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.queryByText("page confirmation")).not.toBeInTheDocument();
    expect(screen.getByText(/Confirmation du paiement en cours/)).toBeInTheDocument();
  });

  it("propose de réessayer après une erreur signalée par le fournisseur", async () => {
    vi.spyOn(paymentsApi, "refreshPayment").mockResolvedValue(payment());
    renderAt("/paiement/retour?payment=pay-1&error=1");
    expect(await screen.findByText("Le paiement n'a pas abouti")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Réessayer le paiement/ })).toBeInTheDocument();
  });

  it("propose de réessayer un paiement en échec", async () => {
    vi.spyOn(paymentsApi, "refreshPayment").mockResolvedValue(payment({ status: "failed" }));
    renderAt("/paiement/retour?payment=pay-1");
    expect(await screen.findByRole("button", { name: /Réessayer le paiement/ })).toBeInTheDocument();
  });

  it("explique l'absence de paiement à vérifier", () => {
    renderAt("/paiement/retour");
    expect(screen.getByText("Aucun paiement à vérifier")).toBeInTheDocument();
  });

  it("paiement lancé depuis l'appli : renvoie vers l'appli sans interroger l'API", () => {
    const refresh = vi.spyOn(paymentsApi, "refreshPayment");
    renderAt("/paiement/retour?payment=pay-1&app=1");
    expect(screen.getByText("Retournez dans l'appli Sunu Mall")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "sunumall://client/payment/pay-1");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("paiement interrompu depuis l'appli : invite à réessayer dans l'appli", () => {
    renderAt("/paiement/retour?payment=pay-1&app=1&error=1");
    expect(screen.getByText("Le paiement n'a pas abouti")).toBeInTheDocument();
    expect(screen.getByText(/pour réessayer/)).toBeInTheDocument();
  });
});
