import EventEmitter, { on } from "node:events";
import { expect, test } from "@jest/globals";
import { Runnable } from "../dist/index.js";
import { RunState, RunFncParams } from "../dist/types.js";
import "./utils/instrumentation.js";

interface State extends RunState {
  a: number;
  done?: boolean;
}
const main = Runnable.init({ name: "progressive:seq" })
  .passThrough((state: State, params: RunFncParams) => {
    params.emit("progress", { a: 1 });
  })
  .passThrough((state: State, params: RunFncParams) => {
    params.emit("progress", { a: 2 });
  })
  .passThrough((state: State, params: RunFncParams) => {
    params.emit("progress", { a: 3, done: true });
  });

async function* getProgress() {
  const emitter = new EventEmitter();
  main.run({}, { emitter });

  for await (const [state] of on(emitter, "progress")) {
    yield state;
    if (state.done) break;
  }
}

test("progressive", async () => {
  const states: number[] = [];

  for await (const state of getProgress()) {
    states.push(state.a);
    if (state.done) break;
  }

  expect(states).toEqual([1, 2, 3]);
});

test("progressive:step", async () => {
  const steps = ["start", "passThrough", "passThrough", "passThrough", "end"];
  const states: string[] = [];

  for await (const step of main.streamSteps()) {
    states.push(step.type);
    if (step.type === "end") break;
  }
  expect(states).toEqual(steps);
});
