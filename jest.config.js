/** @type {import('ts-jest').JestConfigWithTsJest} */

const config = {
  preset: "ts-jest/presets/default-esm", //"ts-jest/presets/js-with-ts-esm", //"ts-jest", //"ts-jest/presets/js-with-ts",
  testEnvironment: "node",
  transform: { ".js": "jest-esm-transformer-2" },
  globals: {
    "ts-jest": {
      useESM: true
    }
  },
  extensionsToTreatAsEsm: [".ts"]
  //transformIgnorePatterns: ["node_modules/(?!(@jest/globals)/)"]
  //roots: ["<rootDir>"]
};

export default config;
