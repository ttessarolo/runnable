import { expect, test } from "@jest/globals";
import { Runnable } from "../dist/index.js";
import { z } from "zod";
import { sleep } from "./utils/index.js";
import "./utils/instrumentation.js";

test("op:pipe", async () => {
  const seq = Runnable.init({ name: "operators:pipe:seq" }).pipe(
    (state: any) => ({ a: 1 })
  );
  const state = await seq.run({ b: 0 });
  expect(state).toEqual({ a: 1 });
});

test("op:push", async () => {
  const seq = Runnable.init({ name: "operators:push:seq" }).push(
    (state: any) => ({ a: 1 })
  );
  const state = await seq.run({ b: 0 });
  expect(state).toEqual({ a: 1, b: 0 });
});

test("op:asign", async () => {
  const dSeq = Runnable.init({ name: "operators:asign:seq:c" }).pipe(
    () => 1973
  );
  const seq = Runnable.init({ name: "operators:asign:seq" }).assign({
    b: 0,
    c: async () => {
      await sleep(10);
      return 1;
    },
    d: dSeq
  });
  const state = await seq.run({ a: 1 });
  expect(state).toEqual({ a: 1, b: 0, c: 1, d: 1973 });
});

test("op:passthrough", async () => {
  const seq = Runnable.init({ name: "operators:passthrough:seq" }).passThrough(
    (state: any) => ({ a: 1 })
  );
  const state = await seq.run({ b: 0 });
  expect(state).toEqual({ b: 0 });
});

test("op:pick:values", async () => {
  const seq = Runnable.init({ name: "operators:pick:values:seq" }).pick([
    "a",
    "b"
  ]);
  const state = await seq.run({ a: 0, b: 0, c: 0 });
  expect(state).toEqual({ a: 0, b: 0 });
});

test("op:pick:schema", async () => {
  const seq = Runnable.init({ name: "operators:pick:schema:seq" }).pick(
    z.object({ a: z.number(), b: z.number() })
  );
  const state = await seq.run({ a: 0, b: 0, c: 0 });
  expect(state).toEqual({ a: 0, b: 0 });
});

test("op:branch:a", async () => {
  const seq = Runnable.init({ name: "operators:branch:seq" }).branch([
    {
      if: (state: any) => state.a === 0,
      then: (state: any) => ({ a: 1 })
    }
  ]);
  const state = await seq.run({ a: 0, b: 0 });
  expect(state).toEqual({ a: 1, b: 0 });
});

test("op:branch:a:seq", async () => {
  const aSeq = Runnable.init({ name: "operators:branch:seq:a" }).push(
    (state: any) => ({ a: 1 })
  );
  const seq = Runnable.init({ name: "operators:branch:values:seq:seq" }).branch(
    [
      {
        if: (state: any) => state.a === 0,
        then: aSeq
      }
    ]
  );
  const state = await seq.run({ a: 0, b: 0 });
  expect(state).toEqual({ a: 1, b: 0 });
});

test("op:branch:pipe", async () => {
  const seq = Runnable.init({ name: "operators:branch:pipe:seq" }).branch(
    [
      {
        if: (state: any) => state.a === 0,
        then: (state: any) => ({ a: 1 })
      }
    ],
    { mode: "pipe" }
  );
  const state = await seq.run({ a: 0, b: 0 });
  expect(state).toEqual({ a: 1 });
});

test("op:branchall", async () => {
  const seq = Runnable.init({ name: "operators:branchall:seq" }).branchAll([
    {
      if: (state: any) => state.a === 0,
      then: (state: any) => ({ a: 1 })
    },
    {
      if: (state: any) => state.a === 0,
      then: (state: any) => ({ c: 1 })
    }
  ]);
  const state = await seq.run({ a: 0, b: 0 });
  expect(state).toEqual({ a: 1, c: 1, b: 0 });
});

test("op:branchall:pipe", async () => {
  const seq = Runnable.init({ name: "operators:branchall:pipe:seq" }).branchAll(
    [
      {
        if: (state: any) => state.a === 0,
        then: (state: any) => ({ a: 1 })
      },
      {
        if: (state: any) => state.a === 0,
        then: (state: any) => ({ c: 1 })
      }
    ],
    { mode: "pipe" }
  );
  const state = await seq.run({ a: 0, b: 0 });
  expect(state).toEqual({ a: 1, c: 1 });
});

test("op:parallel", async () => {
  const seq = Runnable.init({ name: "operators:parallel:seq" }).parallel([
    (state: any) => ({ a: 1 }),
    (state: any) => ({ c: 1 })
  ]);
  const state = await seq.run({ b: 0 });
  expect(state).toEqual({ a: 1, b: 0, c: 1 });
});

test("op:parallel:seq", async () => {
  const pSeq = Runnable.init({ name: "operators:parallel:seq:p" }).push(
    (state: any) => ({ a: 1 })
  );
  const seq = Runnable.init({ name: "operators:parallel:seq" }).parallel([
    pSeq,
    (state: any) => ({ c: 1 })
  ]);
  const state = await seq.run({ b: 0 });
  expect(state).toEqual({ a: 1, b: 0, c: 1 });
});

test("op:parallel:pipe", async () => {
  const seq = Runnable.init({ name: "operators:parallel:pipe:seq" }).parallel(
    [(state: any) => ({ a: 1 }), (state: any) => ({ c: 1 })],
    { mode: "pipe" }
  );
  const state = await seq.run({ b: 0 });
  expect(state).toEqual({ a: 1, c: 1 });
});

test("op:milestone", async () => {
  const seq = Runnable.init({ name: "operators:milestone:seq" }).milestone(
    "milestone"
  );
  const state = await seq.run({ b: 0 });
  expect(state).toEqual({ b: 0 });
});
