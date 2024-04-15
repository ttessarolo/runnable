/** @type {import('ts-jest').JestConfigWithTsJest} */

const config = {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  transformIgnorePatterns: [
    "node_modules/(?!(quick-lru|keyv|p-timeout|zod|jest-esm-transformer-2|@babel/runtime))"
  ],
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
