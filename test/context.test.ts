import { expect, test } from "@jest/globals";
import Runnable from "../dist/index.js";
import "./instrumentation.js";

const context = {
  config: {
    get: async (key: string) => "value"
  },
  gRPC: {
    ingress: {
      get: async (key: string) => "ingress"
    }
  }
};

const result = {
  conf: "value",
  remote: "ingress"
};

const main = Runnable.init({ name: "context:main:seq", context }).assign({
  conf: async function (state: any) {
    return await this.config.get("key");
  },
  remote: async function (state: any) {
    return await this.gRPC.ingress.get("key");
  }
});

test("context", async () => {
  const state = await main.run({});
  expect(state).toEqual(result);
});
