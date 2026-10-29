// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { FEATURES } from "@/lib/features";
import { SupportChatWidget } from "./SupportChatWidget";

describe("SupportChatWidget", () => {
  it("n'affiche aucune bulle tant que l'assistant est désactivé", () => {
    expect(FEATURES.supportChat).toBe(false);
    const { container } = render(
      <MemoryRouter>
        <SupportChatWidget />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
