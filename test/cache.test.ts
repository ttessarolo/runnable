import { expect, test } from "@jest/globals";
import Runnable from "../dist/index.js";
import { RunCache } from "../dist/types.js";
import "./utils/instrumentation.js";

function getEvent(events: string[], prefix: string): number {
  return events.filter((e) => e.startsWith(`cache:${prefix}`)).length;
}

const getChain = (
  name: string = "main-chain",
  cacheParms: RunCache = {
    active: true,
    store: "memory",
    cacheKeyStrategy: ["a", "b", "c"],
    ttlStrategy: 10000
  }
): [Runnable, Map<string, string>, string[]] => {
  const store: Map<string, string> = new Map();
  const events: string[] = [];
  const runnable = Runnable.init({
    name,
    circuit: {
      cache: {
        store,
        active: cacheParms.active,
        cacheKeyStrategy: cacheParms.cacheKeyStrategy,
        ttlStrategy: cacheParms.ttlStrategy
      }
    }
  })
    .push(() => ({ b: 1 }))
    .push(() => ({ c: 2 }))
    .on("cache:hit", (key: string) => events.push(`cache:hit:${key}`))
    .on("cache:miss", (key: string) => events.push(`cache:miss:${key}`))
    .on("cache:set", (key: string) => events.push(`cache:set:${key}`));

  return [runnable, store, events];
};

test("cache:throw:noname", () => {
  const [chain] = getChain("");
  expect(async () => {
    await chain.run({ a: 0 });
  }).rejects.toThrow();
});

test("cache:set", async () => {
  const [chain, store, events] = getChain("hit:seq");
  await chain.run({ a: 0 });
  const chached = store.get("runnify:hit:seq:iterate:a:b:c") ?? "";
  expect(getEvent(events, "hit")).toEqual(0);
  expect(getEvent(events, "miss")).toEqual(1);
  expect(getEvent(events, "set")).toEqual(1);
  expect(JSON.parse(chached).value).toEqual({
    a: 0,
    b: 1,
    c: 2
  });
});

test("cache:get", async () => {
  const [chain, store, events] = getChain("hit:seq");
  await chain.run({ a: 0 });
  await chain.run({ a: 0 });
  const chached = store.get("runnify:hit:seq:iterate:a:b:c") ?? "";
  expect(getEvent(events, "hit")).toEqual(1);
  expect(getEvent(events, "miss")).toEqual(1);
  expect(getEvent(events, "set")).toEqual(2);
  expect(JSON.parse(chached).value).toEqual({
    a: 0,
    b: 1,
    c: 2
  });
});
