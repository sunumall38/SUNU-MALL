// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import AddProductPage from "@/pages/add-product";
import * as catalogApi from "@/api/catalog";
import * as kycApi from "@/api/kyc";
import * as monetizationApi from "@/api/monetization";
import type { Category, SellerKyc, Store } from "@/types";

function category(id: string, name: string, parent: string | null) {
  return { id, name, parent } as Category;
}

function renderPage({ verified }: { verified: boolean }) {
  vi.spyOn(catalogApi, "listMyStores").mockResolvedValue([{ id: "s1", name: "Ma boutique" } as Store]);
  vi.spyOn(catalogApi, "listCategories").mockResolvedValue([
    category("5", "Mode", null),
    category("7", "Chaussures", "5"),
    category("16", "Alimentation", null),
  ]);
  vi.spyOn(monetizationApi, "getMySubscriptionState").mockRejectedValue(new Error("hors test"));
  if (verified) vi.spyOn(kycApi, "getMySellerKyc").mockResolvedValue({ status: "VERIFIED" } as SellerKyc);
  else vi.spyOn(kycApi, "getMySellerKyc").mockResolvedValue({ status: "SUBMITTED" } as SellerKyc);

  render(
    <MemoryRouter>
      <AddProductPage />
    </MemoryRouter>,
  );
}

describe("AddProductPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ne propose que les catégories principales, sans génération IA", async () => {
    renderPage({ verified: true });

    const select = await screen.findByLabelText("Catégorie");
    expect(await within(select).findByRole("option", { name: "Mode" })).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: "Alimentation" })).toBeInTheDocument();
    expect(within(select).queryByRole("option", { name: "Chaussures" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Description")).toBeInTheDocument();
    expect(screen.queryByText(/Générer avec l'IA/)).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Publier le produit" })).toBeInTheDocument();
  });

  it("enregistre en brouillon tant que la boutique n'est pas validée", async () => {
    renderPage({ verified: false });

    expect(await screen.findByRole("button", { name: "Enregistrer en brouillon" })).toBeInTheDocument();
    expect(screen.getByText(/mis en ligne\s+automatiquement dès la validation/)).toBeInTheDocument();
  });
});
