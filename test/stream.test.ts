import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { expect, test } from "@jest/globals";
import Runnable from "../dist/index.js";

interface State {
  a: number;
  b?: number;
}

const read: Readable = Readable.from(
  Array.from({ length: 10 }, (_, a) => ({ a }))
);

const results: State[] = Array.from({ length: 10 }, (_, a) => ({
  a,
  b: a + 1
}));

const main = Runnable.init({ name: "main:seq" }).assign({
  b: async (state: State) => state.a + 1
});

const transform = main.stream();
const risultati: State[] = [];

const write = new Writable({
  objectMode: true,
  write: (state: State, _, next) => {
    risultati.push(state);
    next();
  }
});

test("stream", async () => {
  await pipeline(read, transform, write);
  for (let i = 0; i < 10; i++) {
    expect(risultati[i]).toEqual(results[i]);
  }
});
