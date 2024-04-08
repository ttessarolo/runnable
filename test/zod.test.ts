import { expect, test } from "@jest/globals";
import Runnable from "../dist/index.js";
import { z } from "zod";
import "./instrumentation.js";

const input = { name: "John", age: 30, extra: "extra" };
const output = { name: "John", age: 30 };
const schema: z.ZodType = z.object({ name: z.string(), age: z.number() });

// *********************************
// * Zod Pick
// *********************************
const pickSeq = Runnable.init({ name: "zod:pick:seq" }).pick(schema);

test("zod:pick", async () => {
  const state = await pickSeq.run(input);
  expect(state).toEqual(output);
});

// *********************************
// * Zod Pipe
// *********************************
const pipeSeq = Runnable.init({ name: "zod:pipe:seq" }).pipe(
  (state: any) => {
    state.extra = state.extra;
    return state;
  },
  { schema, name: "pipe:pick" }
);

test("zod:pipe", async () => {
  const state = await pipeSeq.run(input);
  expect(state).toEqual(output);
});

// *********************************
// * Zod Pipe Pick
// *********************************
const pipeAndPickSeq = Runnable.init({ name: "zod:pipe:pick:seq" })
  .pipe((state: any) => state, { schema })
  .pick(schema, { name: "filter:egress" });

test("zod:pipe:pick", async () => {
  const state = await pipeAndPickSeq.run(input);
  expect(state).toEqual(output);
});

// *********************************
// * Zod Pick Pipe
// *********************************
const pickAndPipeSeq = Runnable.init({ name: "zod:pick:pipe:seq" })
  .pick(schema, { name: "filter:ingress" })
  .pipe((state: any) => state);

test("zod:pick:pipe", async () => {
  const state = await pickAndPipeSeq.run(input);
  expect(state).toEqual(output);
});
