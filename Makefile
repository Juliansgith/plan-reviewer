.PHONY: setup run test check e2e

# Install exact dependency versions from the lockfile.
setup:
	npm ci

# Build and serve the page and API at http://localhost:8000.
run:
	npm run build
	PORT=$${PORT:-8000} npm start

# Unit, property, component and API tests.
test:
	npm test

# Everything CI runs: format, lint, types, tests, build, contract checks.
check:
	npm run check

# Browser tests (installs Chromium on first run).
e2e:
	npx playwright install chromium
	npm run test:e2e
