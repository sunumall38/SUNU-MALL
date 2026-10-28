// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as paymentsApi from "@/api/payments";
import { resetPaymentMethodsCache, startPayment, usePaymentMethods } from "@/lib/paymentFlow";

describe("usePaymentMethods", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetPaymentMethodsCache();
  });

  it("n'affiche que les moyens proposés par le backend", async () => {
    vi.spyOn(paymentsApi, "getPaymentMethods").mockResolvedValue({
      sandbox: false,
      methods: [{ id: "orange_money", label: "Orange Money" }],
    });
    const { result } = renderHook(() => usePaymentMethods());
    expect(result.current.methods).toEqual([]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.methods.map((m) => m.id)).toEqual(["orange_money"]);
    expect(result.current.sandbox).toBe(false);
  });

  it("signale une erreur de chargement sans proposer de moyen", async () => {
    vi.spyOn(paymentsApi, "getPaymentMethods").mockRejectedValue(new Error("réseau"));
    const { result } = renderHook(() => usePaymentMethods());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(true);
    expect(result.current.methods).toEqual([]);
  });
});

describe("startPayment", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("envoie le navigateur vers la page du fournisseur", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    vi.spyOn(paymentsApi, "initiatePayment").mockResolvedValue({
      sandbox: false,
      provider_ref: "cos-1",
      checkout_url: "https://pay.wave.com/c/cos-1",
      message: "",
    });
    const result = await startPayment("pay-1");
    expect(result).toEqual({ kind: "redirect", url: "https://pay.wave.com/c/cos-1" });
    expect(assign).toHaveBeenCalledWith("https://pay.wave.com/c/cos-1");
    vi.unstubAllGlobals();
  });

  it("reste sur place en mode test", async () => {
    vi.spyOn(paymentsApi, "initiatePayment").mockResolvedValue({
      sandbox: true,
      provider_ref: "SANDBOX-1",
      message: "Mode test",
    });
    expect(await startPayment("pay-1")).toEqual({ kind: "sandbox", message: "Mode test" });
  });
});
