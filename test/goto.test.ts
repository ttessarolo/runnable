import { expect, test } from "@jest/globals";
import { Runnable } from "../dist/index.js";
import "./utils/instrumentation.js";

test("op:pipe", async () => {
  const seq = Runnable.init({ name: "operators:pipe:seq" })
    .pipe(
      (state: any) => {
        state.a = (state.a || 0) + 1;
        return state;
      },
      { name: "increment:a" }
    )
    .go({
      to: "increment:a",
      if: (state: any) => state.a < 10
    })
    .pipe((state: any) => {
      state.c = state.a / 2;
      return state;
    });

  const state = await seq.run({ b: 0 });
  expect(state).toEqual({ a: 10, b: 0, c: 5 });
});
