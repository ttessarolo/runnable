/** @type {import('ts-jest').JestConfigWithTsJest} */

const config = {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  transform: {
    ".js": "jest-esm-transformer-2",
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true
      }
    ]
  },
  extensionsToTreatAsEsm: [".ts"]
  //globalSetup: "./test/instrumentation.js"
};

export default config;
