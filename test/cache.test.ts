import KeyvRedis from "@keyv/redis";
import { expect, test } from "@jest/globals";
import { Runnable } from "../dist/index.js";
import { RunCache, RunnableParams } from "../dist/types.js";
import "./utils/instrumentation.js";

function getEvent(events: string[], prefix: string): number {
  return events.filter((e) => e.startsWith(`cache:${prefix}`)).length;
}

const getChain = (
  name: string = "main-chain",
  cacheParms: RunCache = {
    name: "cache" + Math.random(),
    active: true,
    store: undefined,
    cacheKeyStrategy: ["a", "b", "c"],
    ttlStrategy: 10000,
    timeout: undefined
  },
  cacheChilds = false,
  nameChilds = false
): [Runnable, Map<string, string> | KeyvRedis, string[]] => {
  const store = !["string", "undefined"].includes(typeof cacheParms.store)
    ? cacheParms.store
    : new Map();
  const events: string[] = [];
  const runParams: RunnableParams = { name };
  const cache: RunCache = {
    name: cacheParms.name,
    store,
    active: cacheParms.active,
    cacheKeyStrategy: cacheParms.cacheKeyStrategy,
    ttlStrategy: cacheParms.ttlStrategy,
    timeout: cacheParms.timeout
  };
  if (!cacheChilds) runParams.circuit = { cache };
  const runnable = Runnable.init(runParams)
    .on("cache:hit", function onChacheHit(key: string) {
      events.push(`cache:hit:${key}`);
    })
    .on("cache:miss", function onChacheMiss(key: string) {
      events.push(`cache:miss:${key}`);
    })
    .on("chache:get:timeout", function onStep(step: any) {
      events.push(`step:${step.name}`);
    })
    .on("cache:set", function onChacheSet(key: string) {
      events.push(`cache:set:${key}`);
    })
    .on("chache:set:timeout", function onStep(step: any) {
      events.push(`step:${step.name}`);
    });

  if (nameChilds) {
    runnable
      .push(
        function pusha() {
          return { b: 1 };
        },
        {
          name: "push:b",
          circuit: cacheChilds ? { cache } : undefined
        }
      )
      .push(
        function pushb() {
          return { c: 2 };
        },
        {
          name: "push:c",
          circuit: cacheChilds ? { cache } : undefined
        }
      );
  } else {
    runnable
      .push(() => ({ b: 1 }), {
        name: "push:b",
        circuit: cacheChilds ? { cache } : undefined
      })
      .push(() => ({ c: 2 }), {
        name: "push:c",
        circuit: cacheChilds ? { cache } : undefined
      });
  }

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
  await store.clear();
  await chain.run({ a: 0 });
  const chached = store.get("runnify:hit:seq:start:iterate:a:0") ?? "";
  expect(getEvent(events, "hit")).toEqual(0);
  expect(getEvent(events, "miss")).toEqual(1);
  expect(getEvent(events, "set")).toEqual(1);
  expect(JSON.parse(chached as string).value).toEqual({
    a: 0,
    b: 1,
    c: 2
  });
});

test("cache:get", async () => {
  const [chain, store, events] = getChain("hit:seq");
  await store.clear();
  await chain.run({ a: 0 });
  await chain.run({ a: 0 });
  const chached = store.get("runnify:hit:seq:start:iterate:a:0") ?? "";
  expect(getEvent(events, "hit")).toEqual(1);
  expect(getEvent(events, "miss")).toEqual(1);
  expect(getEvent(events, "set")).toEqual(2);
  expect(JSON.parse(chached as string).value).toEqual({
    a: 0,
    b: 1,
    c: 2
  });
});

test("cache:get:redis", async () => {
  const keyvRedis = new KeyvRedis("redis://localhost:6379");
  const [chain, store, events] = getChain("hit:seq", {
    name: "redis-cache",
    active: true,
    store: keyvRedis,
    cacheKeyStrategy: ["a", "b", "c"],
    ttlStrategy: 10000
  });
  await store.clear();
  await chain.run({ a: 0 });
  await chain.run({ a: 0 });
  const chached = (await store.get("runnify:hit:seq:start:iterate:a:0")) ?? "";
  await (store as KeyvRedis).disconnect();

  expect(getEvent(events, "hit")).toEqual(1);
  expect(getEvent(events, "miss")).toEqual(1);
  expect(getEvent(events, "set")).toEqual(2);
  expect(JSON.parse(chached).value).toEqual({
    a: 0,
    b: 1,
    c: 2
  });
});

test("cache:get:childs:throw", async () => {
  expect(async () => {
    const [chain] = getChain("hit:seq", undefined, true);
    await chain.run({ a: 0 });
  }).rejects.toThrow();
});

test("cache:get:childs", async () => {
  const [chain, store, events] = getChain("hit:seq", undefined, true, true);
  await store.clear();
  await chain.run({ a: 0 });
  await chain.run({ a: 0 });
  const chached1 = store.get("runnify:hit:seq:push:b:pusha:a:0") ?? "";
  const chached2 = store.get("runnify:hit:seq:push:c:pushb:a:0:b:1") ?? "";

  expect(getEvent(events, "hit")).toEqual(2);
  expect(getEvent(events, "miss")).toEqual(2);
  expect(getEvent(events, "set")).toEqual(4);
  expect(JSON.parse(chached1 as string).value).toEqual({
    b: 1
  });
  expect(JSON.parse(chached2 as string).value).toEqual({
    c: 2
  });
});
