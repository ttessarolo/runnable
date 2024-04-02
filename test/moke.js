import { expect, jest, test } from "@jest/globals";
import EventEmitter from "node:events";
import Runnable from "../dist/index.js";

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
      y: async (state: any) => "Y"
    }
  ],
  { name: "sub:sub:seq" }
);

const main = Runnable.init({ name: "main:seq" })
  .assign({ b: async () => await 2 })
  .pipe(
    async (state: any) => {
      state.a = state.a + 1;
      return state;
    },
    { name: "increment-a" }
  )
  .passThrough((state: any, emitter: EventEmitter) => {
    if (state.a === 1) emitter.emit("check", "a is ok");
  })
  .pipe(async (state: any) => {
    state.c = 3;

    return state;
  })
  .milestone("STATE:UPDATED:ANALYZED")
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
    { to: "STATE:UPDATED:ANALYZED", if: async (state: any) => state.a > 9 }
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
  .on("check", (msg: string) => console.log(msg));

// const res = await main.run({ a: 0 });
// console.log(JSON.stringify(res, null, 2));

// const stream = main.stream({ a: 0 });

// for await (const state of stream) {
//   console.log(state.origin, state.type, state.name ?? "");
// }

// test("main", async () => {
//   const res = await main.run({ a: 0 });

//   const k = {
//     a: 4,
//     b: 2,
//     c: 3,
//     k: "O",
//     j: 1,
//     y: "Y",
//     z: "Z",
//     f: 6,
//     g: 7,
//     blocks: [
//       {
//         id: 1,
//         items: [
//           { id: 1, title: "title", description: "description" },
//           { id: 2, title: "title", description: "description" },
//           { id: 3, title: "title", description: "description" }
//         ]
//       },
//       {
//         id: 2,
//         items: [
//           { id: 1, title: "title", description: "description" },
//           { id: 2, title: "title", description: "description" },
//           { id: 3, title: "title", description: "description" }
//         ]
//       }
//     ]
//   };
//   expect(res).toEqual(k);
// });
