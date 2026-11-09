# Agent instructions

## Commits and PRs

- Always run `pre-commit` before committing and pushing changes.
- Always link PRs to issues when possible.
- PR titles should be human-readable and in the past tense. They should NOT use conventional commit style.
- Every commit must include a `Co-Authored-By` trailer identifying your tool name and version and your underlying model and version. Format (replace all `<…>` placeholders with actual values): `Co-Authored-By: <Tool> <tool-version> / <Model> <model-version> <noreply@vendor-domain>`

## Versioning and changelog

- Bump the version once per PR, following semantic versioning, when any file under `src/` or `package.json` itself changes. Follow-up commits on the same unmerged PR do not bump it again. Do NOT bump for changes that are purely CI/workflow, documentation, or configuration (e.g., GitHub Actions workflows, `AGENTS.md`, `README.md`).
- The version lives in two places that must match. One is `version` in `package.json` (`npm version <x.y.z> --no-git-tag-version` also updates `package-lock.json`). The other is `APP_VERSION` at the top of `src/app.js`, which the page's footer shows.
- The changelog follows the version. If the PR does not bump the version, it does not need a `CHANGELOG.md` entry either.
- Otherwise, add an entry to the `## Upcoming` section of `CHANGELOG.md` under the appropriate subsection (`### 🚀 Enhancement`, `### 🐛 Bug Fix`, `### 📝 Documentation`, `### 🔩 Dependency Updates`, `### 🏠 Internal`). End each entry with the PR link in the format `([#N](https://github.com/dandi-compute/dandi-compute-page/pull/N))`. Create the section or subsection if it does not yet exist.
- Keep changelog entries concise and in the past tense: one sentence each, two at the very most. Say what changed and, where it is not obvious, why. Leave implementation details, reasoning, and exhaustive lists of options or labels to the PR description.

## Writing and code style

- Use American English spelling everywhere (code, comments, page text, changelog entries, and PR descriptions): "normalize" not "normalise", "color" not "colour", "behavior" not "behaviour".
- Avoid excessive em-dashes, colons, and semicolons in written text such as documentation. Prefer breaking into separate, shorter sentences instead.
- Keep inline comments sparse. Only explain non-obvious "why", not "what" the code does. Prefer self-documenting code and clear names over narration, and do not annotate routine logic.
- Prefer assigning return values to named locals before `return` when this improves readability and debugger breakpoint placement.
- Do not add compatibility aliases when renaming functions. Update all call sites to the canonical name instead.

## Tests

- To the best of your ability, ensure the tests pass (`npm run test:run`) before pushing.
- Follow assertion style: actual on the left, expected on the right (`expect(actual).toBe(expected)`).
- Use `it.each` or `describe.each` wherever appropriate to reduce duplication in test cases.
