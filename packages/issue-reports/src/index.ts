export const PACKAGE_NAME = "@shizi/issue-reports";

export type { IssueKind, IssueReport, IssueReportContext } from "./types.js";
export {
  ISSUE_KINDS,
  MAX_CONTEXT_FIELD_LENGTH,
  MAX_MESSAGE_LENGTH,
  REQUIRED_CONTEXT_FIELDS,
  REQUIRED_REPORT_FIELDS,
} from "./types.js";

export type { ValidationResult } from "./validation.js";
export { validateIssueReport } from "./validation.js";
