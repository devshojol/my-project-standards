/** @type {import('jest').Config} */
export default {
  testEnvironment: "node",
  transform: {}, // native ES modules: run with `node --experimental-vm-modules node_modules/.bin/jest`
  testMatch: ["**/tests/**/*.test.js"],
  // Timing tests run alone (`npm run test:perf`): beside other suites they fail at random.
  testPathIgnorePatterns: ["/node_modules/", "\\.perf\\.test\\.js$"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup.js"],
  testTimeout: 30000, // real hangs fail fast; the in-memory database start has its own hook timeout
  collectCoverageFrom: ["src/**/*.js", "!src/docs/**", "!src/index.js"],
  coverageReporters: ["text-summary", "lcov"],
  // Coverage ratchet: set to the measured baseline; a change may not lower it, raise it once coverage stays above.
  // coverageThreshold: { global: { lines: 70, branches: 70 } },
};
