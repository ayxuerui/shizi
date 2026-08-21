import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { EnvBadge } from "./EnvBadge.js";

describe("EnvBadge (add-dev-deployment, specs/deployment/spec.md: 'Deployed builds declare their environment')", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders nothing when VITE_APP_ENV is unset — a default/production build is unchanged", () => {
    vi.stubEnv("VITE_APP_ENV", undefined);
    const { container } = render(<EnvBadge />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a visible DEV marker when VITE_APP_ENV=dev", () => {
    vi.stubEnv("VITE_APP_ENV", "dev");
    render(<EnvBadge />);
    expect(screen.getByLabelText("environment: dev")).toHaveTextContent("DEV");
  });
});
