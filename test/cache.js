import Runnable from "../dist/index.js";
import "./utils/instrumentation.js";

function getEvent(events, prefix) {
  return events.filter((e) => e.startsWith(`cache:${prefix}`)).length;
}

const getChain = (
  name = "main-chain",
  cacheParms = {
    active: true,
    store: "memory",
    cacheKeyStrategy: ["a", "b", "c"],
    ttlStrategy: 10000
  },
  cacheChilds = false,
  nameChilds = false
) => {
  const store =
    typeof cacheParms.store !== "string" ? cacheParms.store : new Map();
  const events = [];
  const runParams = { name };
  const cache = {
    store,
    active: cacheParms.active,
    cacheKeyStrategy: cacheParms.cacheKeyStrategy,
    ttlStrategy: cacheParms.ttlStrategy
  };
  if (!cacheChilds) runParams.circuit = { cache };
  const runnable = Runnable.init(runParams)
    .on("cache:hit", function onChacheHit(key) {
      events.push(`cache:hit:${key}`);
    })
    .on("cache:miss", function onChacheMiss(key) {
      events.push(`cache:miss:${key}`);
    })
    .on("cache:set", function onChacheSet(key) {
      events.push(`cache:set:${key}`);
    })
    .on("step", function onStep(step) {
      events.push(`step:${step.name}`);
    });

  if (nameChilds) {
    runnable.push(
      function pusha() {
        return { b: 1 };
      },
      {
        name: "push:b",
        circuit: cacheChilds ? { cache, retry: 3 } : undefined
      }
    );
    //   .push(
    //     function pushb() {
    //       return { c: 2 };
    //     },
    //     {
    //       name: "push:c",
    //       circuit: cacheChilds ? { cache } : undefined
    //     }
    //   );
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
const [chain, store, events] = getChain("hit:seq", undefined, true, true);
await chain.run({ a: 0 });
console.log(events);
