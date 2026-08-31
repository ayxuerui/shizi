import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MAX_MESSAGE_LENGTH, validateIssueReport, type IssueReport } from "@shizi/issue-reports";
import { __resetDBForTests } from "../offline/db.js";
import { enqueueIssueReport, listPendingIssueReports } from "../offline/event-queue.js";
import { IssueReportScreen, ISSUE_REPORT_FONT_FAMILY } from "./IssueReportScreen.js";

async function resetDatabase(): Promise<void> {
  await __resetDBForTests();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("shizi-assessment");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

function makeIssueReport(overrides: Partial<IssueReport> = {}): IssueReport {
  return {
    id: "report-seeded",
    kind: "bug",
    message: "seeded",
    createdAt: "2026-08-29T09:00:00.000Z",
    context: {
      appEnv: "prod",
      buildId: "unknown",
      userAgent: "ua",
      standalone: false,
      online: true,
      lastSessionId: null,
      lastActivity: null,
    },
    ...overrides,
  };
}

function typeMessage(text: string): void {
  fireEvent.change(screen.getByLabelText("Report message"), { target: { value: text } });
}

describe("IssueReportScreen (add-issue-reporting, issue-reporting spec: 'Adult can file a report from inside the app')", () => {
  beforeEach(async () => {
    await resetDatabase();
    // No sync endpoint: a saved report stays in the outbox, which is what
    // the pending-count assertions below rely on.
    vi.stubEnv("VITE_SYNC_ENDPOINT", "");
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await resetDatabase();
  });

  it("keeps Save disabled while the message is empty or whitespace-only", () => {
    render(<IssueReportScreen onExit={vi.fn()} />);
    const save = screen.getByRole("button", { name: "Save report" });
    expect(save).toBeDisabled();

    typeMessage("   \n\t");
    expect(save).toBeDisabled();

    typeMessage("the audio did not play");
    expect(save).toBeEnabled();
  });

  it("preselects 'Something went wrong' and toggles to 'I have an idea'", () => {
    render(<IssueReportScreen onExit={vi.fn()} />);
    const bug = screen.getByRole("button", { name: "Something went wrong" });
    const feature = screen.getByRole("button", { name: "I have an idea" });
    expect(bug).toHaveAttribute("aria-pressed", "true");
    expect(feature).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(feature);

    expect(feature).toHaveAttribute("aria-pressed", "true");
    expect(bug).toHaveAttribute("aria-pressed", "false");
  });

  it("saves a feature request with a trimmed message and a complete, valid context, then shows the confirmation", async () => {
    const onSubmitted = vi.fn();
    render(<IssueReportScreen onExit={vi.fn()} onSubmitted={onSubmitted} />);
    fireEvent.click(screen.getByRole("button", { name: "I have an idea" }));
    typeMessage("  she wants to trace the character again after the bout  ");

    fireEvent.click(screen.getByRole("button", { name: "Save report" }));

    expect(await screen.findByText(/Saved on this device/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Report message")).not.toBeInTheDocument();

    const pending = await listPendingIssueReports();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      kind: "feature",
      message: "she wants to trace the character again after the bout",
    });
    expect(validateIssueReport(pending[0])).toEqual({ valid: true, errors: [] });
    expect(pending[0]!.context).toMatchObject({
      appEnv: "prod",
      buildId: "unknown",
      lastSessionId: null,
      lastActivity: null,
    });
    expect(typeof pending[0]!.context.userAgent).toBe("string");
    expect(onSubmitted).toHaveBeenCalledExactlyOnceWith(pending[0]);
  });

  it("'Write another' returns to an empty form", async () => {
    render(<IssueReportScreen onExit={vi.fn()} />);
    typeMessage("first");
    fireEvent.click(screen.getByRole("button", { name: "Save report" }));
    await screen.findByText(/Saved on this device/);

    fireEvent.click(screen.getByRole("button", { name: "Write another" }));

    expect(screen.getByLabelText("Report message")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Save report" })).toBeDisabled();
  });

  it("shows how many reports on this device are still waiting to be sent", async () => {
    await enqueueIssueReport(makeIssueReport());
    render(<IssueReportScreen onExit={vi.fn()} />);
    expect(await screen.findByText("1 report waiting to be sent")).toBeInTheDocument();

    typeMessage("a second one");
    fireEvent.click(screen.getByRole("button", { name: "Save report" }));

    expect(await screen.findByText("2 reports waiting to be sent")).toBeInTheDocument();
  });

  it("shows no pending line when nothing is waiting", async () => {
    render(<IssueReportScreen onExit={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save report" })).toBeInTheDocument());
    expect(screen.queryByText(/waiting to be sent/)).not.toBeInTheDocument();
  });

  it("bounds the textarea at MAX_MESSAGE_LENGTH and renders it in a system font, not the subset font", () => {
    render(<IssueReportScreen onExit={vi.fn()} />);
    const textarea = screen.getByLabelText("Report message") as HTMLTextAreaElement;
    expect(textarea.maxLength).toBe(MAX_MESSAGE_LENGTH);
    expect(MAX_MESSAGE_LENGTH).toBe(2000);
    const fontFamily = getComputedStyle(textarea).fontFamily;
    expect(fontFamily).toBe(ISSUE_REPORT_FONT_FAMILY);
    expect(fontFamily).not.toContain("font-hanzi");
  });

  it("keeps typed Chinese in the textarea value", () => {
    render(<IssueReportScreen onExit={vi.fn()} />);
    typeMessage("山的声音没有播放");
    expect(screen.getByLabelText("Report message")).toHaveValue("山的声音没有播放");
  });

  it("Back calls onExit from the form", () => {
    const onExit = vi.fn();
    render(<IssueReportScreen onExit={onExit} />);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onExit).toHaveBeenCalledOnce();
  });

  it("Back calls onExit from the confirmation too", async () => {
    const onExit = vi.fn();
    render(<IssueReportScreen onExit={onExit} />);
    typeMessage("something");
    fireEvent.click(screen.getByRole("button", { name: "Save report" }));
    await screen.findByText(/Saved on this device/);

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(onExit).toHaveBeenCalledOnce();
  });

  it("contains no Chinese text in its own labels — the font-subset invariant can't be broken here", async () => {
    render(<IssueReportScreen onExit={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save report" })).toBeInTheDocument());
    expect(/[一-鿿]/.test(document.body.textContent ?? "")).toBe(false);
  });
});
