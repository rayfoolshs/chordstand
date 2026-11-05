# AGENTS.md

Project-wide instructions for OpenCode and other AI coding agents
working in this repository.

## 1. Start by understanding the project

-   Before changing code, inspect the relevant files and understand how
    the existing implementation works.
-   Read `README.md` and any relevant documentation before substantial
    work.
-   Identify the app's framework, language, package manager, build
    commands, test commands, and existing conventions.
-   Follow the current architecture unless the task explicitly calls for
    changing it.
-   Do not assume a feature, dependency, script, or configuration
    exists; verify it in the repository.

## 2. Plan changes at the right level

-   For small, local changes, make the change directly and keep the
    scope narrow.
-   For multi-file features, architectural changes, or risky work, first
    outline a short implementation plan.
-   If requirements are ambiguous in a way that could materially change
    the result, ask a focused question before proceeding.
-   Avoid unrelated refactoring and avoid changing public interfaces
    unless required.
-   Reuse existing components, utilities, and patterns before creating
    new ones.

## 3. Code quality

-   Write clear, maintainable code that matches the style already used
    in the project.
-   Prefer simple solutions over unnecessary abstractions or cleverness.
-   Use meaningful names and keep functions and components focused.
-   Avoid duplicated logic; extract shared code when it genuinely
    improves maintainability.
-   Handle errors deliberately. Do not silently swallow errors.
-   Add comments when they explain intent or non-obvious reasoning, not
    when they merely repeat the code.
-   Do not add dependencies unless they provide clear value. Check
    whether an existing dependency already solves the problem.

## 4. Project structure and dependencies

-   Respect the existing folder structure and module boundaries.
-   Put new files in the location that best matches the existing project
    conventions.
-   Use the package manager and lockfile already present in the
    repository.
-   Do not manually edit generated files or lockfiles unless the task
    requires it.
-   Do not change framework versions or major dependencies without
    explaining why and obtaining approval.

## 5. Security and privacy

-   Never hard-code passwords, API keys, access tokens, or other
    secrets.
-   Read secrets from environment variables or the project's established
    secret-management system.
-   Keep real `.env` files and credentials out of version control.
    Update `.env.example` with placeholder names when configuration
    changes.
-   Validate and safely handle untrusted input at application
    boundaries.
-   Use parameterized database queries and safe output handling.
-   Apply authentication and authorization checks on protected
    operations.
-   Do not weaken security controls to make tests pass.
-   Do not expose private user data in logs, errors, screenshots, or
    test fixtures.

## 6. Data and database changes

-   Inspect the existing schema and data-access patterns before changing
    database code.
-   Use the project's migration system for schema changes.
-   Make migrations safe and reversible where practical.
-   Never drop, truncate, overwrite, or bulk-modify important or
    production data without explicit approval.
-   Consider existing records and backward compatibility when changing
    schemas or API contracts.

## 7. Testing and verification

-   Find and use the repository's existing test, lint, type-check, and
    build commands.
-   Add or update tests for new behaviour and bug fixes where
    appropriate.
-   Run the most relevant checks after making a change; run the full
    available suite when practical.
-   For UI changes, verify loading, empty, error, and success states
    where relevant.
-   Do not claim that a check passed unless you actually ran it and
    observed a successful result.
-   If a check cannot be run, state why and identify what remains
    unverified.
-   Fix regressions introduced by your changes.

## 8. Documentation and project notes

-   Update `README.md` when setup, usage, configuration, or major
    functionality changes.
-   Update architecture or API documentation when those contracts
    change.
-   Update `.env.example` when new environment variables are introduced;
    never put real secrets in it.
-   Keep existing documentation accurate. Do not create documentation
    files that merely duplicate other files.
-   Update `CHANGELOG.md` or `TODO.md` only if the project uses them or
    the task calls for it.

## 9. Working with Git

-   Do not discard, reset, or overwrite the user's existing uncommitted
    changes.
-   Do not run destructive Git commands unless explicitly authorised.
-   Do not create a commit, push, publish, or open a pull request unless
    asked.
-   Keep changes focused and review the diff for accidental edits before
    finishing.

## 10. Communication and completion

-   Briefly explain the approach before substantial or risky changes.
-   When finished, summarise:
    -   what changed;
    -   the important files affected;
    -   tests and checks actually run, including any failures;
    -   anything the user still needs to configure or decide.
-   Be direct about uncertainty and limitations.
-   Do not say a task is complete if important work remains.

## 11. Priority of instructions

-   Follow the user's explicit task requirements.
-   Follow repository-specific instructions in relevant `AGENTS.md`
    files.
-   Preserve established project conventions unless the task requires a
    change.
-   If instructions conflict, explain the conflict and ask for
    clarification when it affects correctness or safety.
