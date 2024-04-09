import { expect, test } from "@jest/globals";
import Runnable from "../dist/index.js";
import { z } from "zod";
import { sleep } from "./utils/index.js";
import "./utils/instrumentation.js";

let r0 = 0;
const m0 = Runnable.init({
  name: "wrap:main:seq",
  circuit: { retry: 3 }
}).push(function throwError() {
  throw new Error(`Error ${++r0}`);
});

test("wrap:retry:runnable", async () => {
  const result = await m0.run().catch((e) => {
    expect(e.message).toBe("Error 4");
  });
  expect(r0).toEqual(4);
});

let r1 = 0;
const m1 = Runnable.init({
  name: "wrap:main:seq"
}).push(
  function throwError() {
    throw new Error(`Error ${++r1}`);
  },
  { circuit: { retry: 3 } }
);

test("wrap:retry:pipe", async () => {
  const result = await m1.run().catch((e) => {
    expect(e.message).toBe("Error 4");
  });
  expect(r1).toEqual(4);
});

let r2 = 0;
const m2 = Runnable.init({
  name: "wrap:main:seq"
}).push(
  function throwError() {
    throw new Error(`Error ${++r2}`);
  },
  { circuit: { retry: 3, circuitBreaker: { consecutiveFaillures: 4 } } }
);

test("wrap:retry:pipe:breaker:ok", async () => {
  const result = await m2.run().catch((e) => {
    expect(e.message).toBe("Error 4");
  });
  expect(r2).toEqual(4);
});

let r3 = 0;
const m3 = Runnable.init({
  name: "wrap:main:seq"
}).push(
  function throwError() {
    throw new Error(`Error ${++r3}`);
  },
  { circuit: { retry: 3, circuitBreaker: { consecutiveFaillures: 2 } } }
);

test("wrap:retry:pipe:breaker:ko", async () => {
  const result = await m3.run().catch((e) => {
    expect(e.message).toBe(
      "Execution prevented because the circuit breaker is open"
    );
  });
  expect(r3).toEqual(2);
});

let r4 = 0;
const m4 = Runnable.init({
  name: "wrap:main:seq"
}).push(
  function throwError() {
    throw new Error(`Error ${++r4}`);
  },
  { circuit: { retry: 3, timeout: 100000 } }
);

test("wrap:retry:pipe:timeout:ok", async () => {
  const result = await m4.run().catch((e) => {
    expect(e.message).toBe("Error 4");
  });
  expect(r4).toEqual(4);
});

let r5 = 0;
const m5 = Runnable.init({
  name: "wrap:main:seq",
  circuit: { retry: 3, timeout: 10 }
}).push(async function throwError() {
  await sleep(50);
  throw new Error(`Error ${++r5}`);
});

test("wrap:retry:pipe:timeout:ko", async () => {
  const result = await m5.run().catch((e) => {
    expect(e.message).toBe("Error 1");
  });
  expect(r5).toEqual(1);
});

let r6 = 0;
const m6 = Runnable.init({
  name: "wrap:main:seq"
}).push(
  function throwError() {
    throw new Error(`Error ${++r6}`);
  },
  {
    circuit: {
      retry: 3,
      circuitBreaker: { consecutiveFaillures: 2 },
      fallback: async (params: any) => {
        await sleep(10);
        return { fallback: "hallo" };
      }
    }
  }
);

test("wrap:retry:pipe:breaker:ko:fallback", async () => {
  const result = await m6.run({ a: 1 }).catch((e) => {
    expect(e.message).toBe(
      "Execution prevented because the circuit breaker is open"
    );
  });
  expect(result).toEqual({ a: 1, fallback: "hallo" });
  expect(r6).toEqual(2);
});

let r7 = 0;
const fallbackSeq = Runnable.init({ name: "fallback:seq" })
  .push(async function fallback(state: any) {
    return { fallback: "hallo" };
  })
  .pick(z.object({ fallback: z.string() }));

const m7 = Runnable.init({
  name: "wrap:main:seq"
}).push(
  function throwError() {
    throw new Error(`Error ${++r7}`);
  },
  {
    circuit: {
      retry: 3,
      circuitBreaker: { consecutiveFaillures: 2 },
      fallback: fallbackSeq
    }
  }
);

test("wrap:retry:pipe:breaker:ko:fallback:runnable", async () => {
  const result = await m7.run({ a: 1 }).catch((e) => {
    expect(e.message).toBe(
      "Execution prevented because the circuit breaker is open"
    );
  });
  expect(result).toEqual({ a: 1, fallback: "hallo" });
  expect(r7).toEqual(2);
});

let r8 = 0;
const fallbackSeq2 = Runnable.init({ name: "fallback:seq" })
  .push(async function fallback(state: any) {
    return { fallback: "hallo" };
  })
  .pick(z.object({ fallback: z.string() }));

const m8 = Runnable.init({
  name: "wrap:main:seq",
  circuit: {
    retry: 3,
    circuitBreaker: { consecutiveFaillures: 2 },
    fallback: fallbackSeq2
  }
}).pipe(function throwError() {
  throw new Error(`Error ${++r8}`);
});

test("wrap:retry:pipe:breaker:ko:fallback:runnable:onseq", async () => {
  const result = await m8.run({ a: 1 }).catch((e) => {
    expect(e.message).toBe(
      "Execution prevented because the circuit breaker is open"
    );
  });
  console.log(result);
  expect(result).toEqual({ fallback: "hallo" });
  expect(r8).toEqual(2);
});
