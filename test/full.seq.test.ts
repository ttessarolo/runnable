import { expect, test } from "@jest/globals";
import Runnable from "../dist/index.js";
import "./instrumentation.js";

const subSequence = Runnable.from(
  [
    { k: async () => "O", j: 1 },
    async (state: any) => {
      state.y = "ciao";
      return state;
    }
  ],
  { name: "sub:seq" }
);

const subSubSequence = Runnable.from(
  [
    { z: async () => "Z" },
    {
      y: async (state: any) => {
        return "Y";
      }
    }
  ],
  { name: "sub:sub:seq" }
);

const main = Runnable.init({ name: "full:main:seq" })
  .assign({ b: async () => await 2 })
  .pipe(
    async (state: any) => {
      state.a = state.a + 1;
      return state;
    },
    { name: "increment-a" }
  )
  .passThrough((state: any, params: any) => {
    if (state.a === 1) params.emit("check", "a is ok");
  })
  .pipe(async (state: any) => {
    state.c = 3;

    return state;
  })
  .milestone("state:analyzed")
  .pipe(subSequence)
  .branch([
    {
      if: async (state: any) => state.a === 1,
      then: subSubSequence
    },
    {
      if: async (state: any) => state.a === 1,
      then: async (state: any) => {
        state.e = 5;
        return state;
      }
    }
  ])
  .parallel([
    async (state: any) => {
      state.f = 6;
      return state;
    },
    async (state: any) => {
      state.g = 7;
      return state;
    }
  ])
  .go([
    { to: "increment-a", if: async (state: any) => state.a < 4 },
    { to: "state:analyzed", if: async (state: any) => state.a > 9 }
  ])
  .assign({
    blocks: [
      { id: 1, items: [{ id: 1 }, { id: 2 }, { id: 3 }] },
      { id: 2, items: [{ id: 1 }, { id: 2 }, { id: 3 }] }
    ]
  })
  .loop({
    key: "blocks",
    chain: (chain: Runnable) =>
      chain.loop({
        key: "items",
        chain: (chain: Runnable) =>
          chain.parallel([
            async (state: any) => {
              state.element.title = "title";
              return state;
            },
            async (state: any) => {
              state.element.description = "description";
              return state;
            }
          ])
      })
  })
  //.pick("j")
  .on("check", (msg: string) => true);

// const res = await main.run({ a: 0 });
// console.log(JSON.stringify(res, null, 2));

// const all = await Promise.all([
//   main.run({ a: 5, _sig: "1" }),
//   main.run({ a: 1, _sig: "2" }),
//   main.run({ a: 2, _sig: "3" })
// ]);

// console.log(all);

// const stream = main.streamLog({ a: 0 });

// for await (const state of stream) {
//   console.log(state.origin, state.type, state.name ?? "");
// }

test("main", async () => {
  let res;

  res = await main.run({ a: 0 }).catch((e) => {
    {
      console.log(e);
    }
  });

  const k = {
    a: 4,
    b: 2,
    c: 3,
    k: "O",
    j: 1,
    y: "ciao",
    z: "Z",
    f: 6,
    g: 7,
    blocks: [
      {
        id: 1,
        items: [
          { id: 1, title: "title", description: "description" },
          { id: 2, title: "title", description: "description" },
          { id: 3, title: "title", description: "description" }
        ]
      },
      {
        id: 2,
        items: [
          { id: 1, title: "title", description: "description" },
          { id: 2, title: "title", description: "description" },
          { id: 3, title: "title", description: "description" }
        ]
      }
    ]
  };
  expect(res).toEqual(k);
});
