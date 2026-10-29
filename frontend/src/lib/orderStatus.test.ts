import { describe, expect, it } from "vitest";
import { FEATURES } from "@/lib/features";
import { ASSIGNABLE_ORDER_STATUSES, PAID_ORDER_STATUSES, orderStatusLabel, paymentMethodLabel } from "@/lib/orderStatus";

describe("orderStatus", () => {
  it("affiche les statuts en français, jamais le code brut", () => {
    expect(orderStatusLabel("pending")).toBe("En attente de paiement");
    expect(orderStatusLabel("delivered")).toBe("Livrée");
    expect(orderStatusLabel("inconnu")).toBe("inconnu");
  });

  it("ne compte pas une commande non payée dans le chiffre d'affaires", () => {
    expect(PAID_ORDER_STATUSES.has("pending")).toBe(false);
    expect(PAID_ORDER_STATUSES.has("cancelled")).toBe(false);
    expect(PAID_ORDER_STATUSES.has("delivered")).toBe(true);
  });

  it("n'autorise l'affectation d'un livreur qu'après paiement et avant livraison", () => {
    expect(ASSIGNABLE_ORDER_STATUSES.has("pending")).toBe(false);
    expect(ASSIGNABLE_ORDER_STATUSES.has("paid")).toBe(true);
    expect(ASSIGNABLE_ORDER_STATUSES.has("delivered")).toBe(false);
  });

  it("gère une méthode de paiement absente", () => {
    expect(paymentMethodLabel(null)).toBe("—");
  });
});

describe("FEATURES (phase pilote)", () => {
  it("masque les fonctions pas encore prêtes", () => {
    expect(FEATURES.aiProductDescription).toBe(false);
    expect(FEATURES.storePickup).toBe(false);
  });
});
