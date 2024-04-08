import { expect, test } from "@jest/globals";
import Runnable from "../dist/index.js";
import { z } from "zod";
import "./instrumentation.js";

const schema: z.ZodType = z.object({ name: z.string(), age: z.number() });
const pickSeq = Runnable.init({ name: "zod:pick:seq" }).pick(schema);

test("zod:pick", async () => {
  const state = await pickSeq.run({ name: "John", age: 30, extra: "extra" });
  expect(state).toEqual({ name: "John", age: 30 });
});

const pipeSeq = Runnable.init({ name: "zod:pipe:seq" }).pipe(
  (state: any) => {
    state.extra = state.extra;
    return state;
  },
  { schema, name: "pipe:pick" }
);

test("zod:pipe", async () => {
  const state = await pipeSeq.run({ name: "John", age: 30, extra: "extra" });
  expect(state).toEqual({ name: "John", age: 30 });
});

const pipeAndPickSeq = Runnable.init({ name: "zod:pipe:pick:seq" })
  .pipe((state: any) => state, { schema })
  .pick(schema);

test("zod:pipe:pick", async () => {
  const state = await pipeAndPickSeq.run({
    name: "John",
    age: 30,
    extra: "extra"
  });
  expect(state).toEqual({ name: "John", age: 30 });
});
