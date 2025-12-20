# Gemini Flows

This document outlines standardized workflows for recurring tasks to ensure consistency and quality across agent sessions.

## Flow: Documentation Assistant (Feature Docs)

**Goal**: Review, deduplicate, rewrite, and improve feature documentation (`docs/features/*.md`) ensuring strict adherence to project guidelines and codebase reality.

**Context & Guidelines**:
- Primary Guideline Source: `docs/docs-guidelines.md` (Must be ingested first).
- Target Directory: `docs/features/`.

**Process**:

1.  **Context Ingestion**:
    - Read `docs/docs-guidelines.md` to establish the "Law" for documentation (structure, snippet style, strictness on accuracy).

2.  **Discovery**:
    - List files in `docs/features/` to understand the scope.

3.  **Iterative Review & Verification (Per File)**:
    - Read the specific feature document.
    - **Codebase Verification (Critical)**:
        - Identify the features/endpoints mentioned in the doc.
        - Locate the actual implementation in `routes/*.js`, `controllers/*.js`, and `middleware/`.
        - Verify HTTP methods, paths, and Authentication requirements (e.g., `ensureAuthenticated` vs `ensureProjectAccess`).
    - **Gap Analysis**:
        - Check for missing "Common errors / troubleshooting" sections.
        - Check for missing `curl` examples (crucial for developer tools).
        - Check for verbosity (reduce "What it is" to 1-4 sentences).
    - **Implementation**:
        - Use `replace` to fix inaccuracies, add missing examples, or condense text.
        - Do not duplicate config details that belong in global configuration docs (e.g., DB connection strings).

4.  **Final Polish**:
    - Ensure no "speculative" documentation exists. If the code doesn't exist, the doc shouldn't either.
    - Commit changes with a clear summary of what was fixed/verified.
