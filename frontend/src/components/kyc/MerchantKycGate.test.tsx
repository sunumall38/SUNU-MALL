// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MerchantKycGate } from "@/components/kyc/MerchantKycGate";
import * as kycApi from "@/api/kyc";
import { ApiError } from "@/lib/api";
import type { KycStatus, SellerKyc } from "@/types";

function kyc(status: KycStatus, rejection_reason: string | null = null) {
  return { id: "kyc-1", status, rejection_reason, submitted_at: null, fraud_flags: [], history: [] } as unknown as SellerKyc;
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

  it("bloque l'espace tant que la pièce d'identité n'est pas envoyée", async () => {
    vi.spyOn(kycApi, "getMySellerKyc").mockRejectedValue(new ApiError(404, {}));
    renderGate();
    expect(await screen.findByText("Étape 1 sur 2 — votre identité")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Envoyer ma pièce d'identité/ })).toBeInTheDocument();
  });

  it("redemande la pièce après un refus", async () => {
    vi.spyOn(kycApi, "getMySellerKyc").mockResolvedValue(kyc("REJECTED", "Photo floue"));
    renderGate();
    expect(await screen.findByText(/Votre dossier est à corriger/)).toBeInTheDocument();
  });

  it("ouvre l'espace dès que la pièce est envoyée, sans attendre la validation", async () => {
    vi.spyOn(kycApi, "getMySellerKyc").mockResolvedValue(kyc("SUBMITTED"));
    renderGate();
    await gateLoaded();
    expect(screen.queryByText("Étape 1 sur 2 — votre identité")).not.toBeInTheDocument();
  });

  it("garde l'espace fermé pour un vendeur suspendu", async () => {
    vi.spyOn(kycApi, "getMySellerKyc").mockResolvedValue(kyc("SUSPENDED"));
    renderGate();
    expect(await screen.findByText("Compte vendeur restreint")).toBeInTheDocument();
  });
});
