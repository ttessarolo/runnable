import { expect, test } from "@jest/globals";
import Runnable from "../dist/index.js";
import { RunFncParams } from "../dist/types.js";
import "./utils/instrumentation.js";

const ctx = {
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

const main = Runnable.init({ name: "context:main:seq", ctx }).assign({
  conf: async function (state: any, params: RunFncParams) {
    return await params.ctx.config.get("key");
  },
  remote: async function (state: any, params: RunFncParams) {
    return await params.ctx.gRPC.ingress.get("key");
  }
});

test("context", async () => {
  const state = await main.run({});
  expect(state).toEqual(result);
});
