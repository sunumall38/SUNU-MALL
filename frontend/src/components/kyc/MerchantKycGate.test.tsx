// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MerchantKycGate } from "@/components/kyc/MerchantKycGate";
import * as catalogApi from "@/api/catalog";
import * as kycApi from "@/api/kyc";
import { ApiError } from "@/lib/api";
import type { KycStatus, SellerKyc, Store } from "@/types";

function kyc(status: KycStatus, rejection_reason: string | null = null) {
  return { id: "kyc-1", status, rejection_reason, submitted_at: null, fraud_flags: [], history: [] } as unknown as SellerKyc;
}

const STORE = { id: "s1", name: "Ma boutique", status: "inactive" } as Store;

function mockDossier(seller: SellerKyc | null, store: Store | null) {
  if (seller) vi.spyOn(kycApi, "getMySellerKyc").mockResolvedValue(seller);
  else vi.spyOn(kycApi, "getMySellerKyc").mockRejectedValue(new ApiError(404, {}));
  vi.spyOn(catalogApi, "listMyStores").mockResolvedValue(store ? [store] : []);
  vi.spyOn(catalogApi, "listStoreCategories").mockResolvedValue([]);
}

function renderGate() {
  return render(
    <MemoryRouter initialEntries={["/merchant"]}>
      <MerchantKycGate nav={[]} title="Espace vendeur test" />
    </MemoryRouter>,
  );
}

async function gateLoaded() {
  await waitFor(() => expect(screen.queryByText(/Vérification de votre dossier/)).not.toBeInTheDocument());
}

describe("MerchantKycGate", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("commence par la boutique", async () => {
    mockDossier(null, null);
    renderGate();
    expect(await screen.findByText("Étape 1 sur 2 — votre boutique")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Créer la boutique" })).toBeInTheDocument();
  });

  it("demande ensuite la pièce d'identité", async () => {
    mockDossier(null, STORE);
    renderGate();
    expect(await screen.findByText("Étape 2 sur 2 — votre identité")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Envoyer ma pièce d'identité/ })).toBeInTheDocument();
  });

  it("redemande la pièce après un refus", async () => {
    mockDossier(kyc("REJECTED", "Photo floue"), STORE);
    renderGate();
    expect(await screen.findByText(/Votre dossier est à corriger/)).toBeInTheDocument();
  });

  it("ouvre l'espace dès que la pièce est envoyée, sans attendre la validation", async () => {
    mockDossier(kyc("SUBMITTED"), STORE);
    renderGate();
    await gateLoaded();
    expect(screen.queryByText(/Étape \d sur 2/)).not.toBeInTheDocument();
  });

  it("garde l'espace fermé pour un vendeur suspendu", async () => {
    mockDossier(kyc("SUSPENDED"), STORE);
    renderGate();
    expect(await screen.findByText("Compte vendeur restreint")).toBeInTheDocument();
  });
});
