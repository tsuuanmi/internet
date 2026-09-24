# Engineering

Engineering documentation owns the software-development and delivery system for this repository.

Current executable entry points are repository-native:

- `npm run check` — vendor verification, Biome, and TypeScript checks.
- `npm test` — Vitest test suite.
- `npm run build` — production/type/client builds.
- `npm run verify-package` — package-content verification.
- `.github/workflows/verify.yml` — CI gate running install, checks, tests, build, generated-dist verification, and package verification.

Keep detailed commands in `package.json` and CI rather than duplicating them across feature documentation.
