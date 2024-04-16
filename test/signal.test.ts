import { expect, jest, test } from "@jest/globals";
import { Runnable, RunnableAbortError, RunFncParams } from "../dist/index.js";
//import {  } from "../dist/types.js";
import "./utils/instrumentation.js";

jest.useFakeTimers();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const chain = Runnable.init({ name: "signal:chain" }).pipe(
  async (state: any) => {
    await sleep(100);
    return { ...state, a: 1 };
  }
);

test("signal", async () => {
  const signal = AbortSignal.abort();

  expect(async () => await chain.run({}, { signal })).rejects.toThrow(
    RunnableAbortError
  );
});

test("signal:timeout", async () => {
  const signal = AbortSignal.timeout(50);

  expect(async () => await chain.run({}, { signal })).rejects.toThrow(
    RunnableAbortError
  );
});

test("signal:timeout", async () => {
  const signal = AbortSignal.timeout(500);

  const chain = Runnable.init({ name: "signal:chain" }).pipe(
    (state: any, params: RunFncParams) => {
      return new Promise((resolve, reject) => {
        params.signal.addEventListener("abort", reject);
        setTimeout(() => resolve({ ...state, a: 1 }), 1000);
      });
    }
  );

  expect(async () => await chain.run({}, { signal })).rejects.toThrow(
    RunnableAbortError
  );
});
