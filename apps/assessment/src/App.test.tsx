import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "./App.js";

describe("App scaffold", () => {
  it("renders the app shell and lists linked workspace packages", () => {
    render(<App />);
    expect(screen.getByText("识字")).toBeInTheDocument();
    expect(screen.getByText("@shizi/character-data")).toBeInTheDocument();
    expect(screen.getByText("@shizi/curriculum")).toBeInTheDocument();
    expect(screen.getByText("@shizi/learner-state")).toBeInTheDocument();
    expect(screen.getByText("@shizi/validator")).toBeInTheDocument();
  });
});
