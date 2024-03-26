import Runnable from "../dist/index.js";

const subSequence = Runnable.from(
  [
    { k: async () => "O", j: 1 },
    async (state) => {
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
      y: async (state) => "Y"
    }
  ],
  { name: "sub:sub:seq" }
);
const main = Runnable.init({}, { name: "main:seq" })
  .assign({ b: async () => await 2 })
  .pipe(
    async (state) => {
      state.a = state.a + 1;
      return state;
    },
    { name: "increment-a" }
  )
  .passThrough((state, emitter) => {
    if (state.a === 1) emitter.emit("check", "a is ok");
  })
  .pipe(async (state) => {
    state.c = 3;
    return state;
  })
  .milestone("STATE:UPDATED:ANALYZED")
  .pipe(subSequence)
  .branch([
    {
      if: async (state) => state.a === 1,
      then: subSubSequence
    },
    {
      if: async (state) => state.a === 1,
      then: async (state) => {
        state.e = 5;
        return state;
      }
    }
  ])
  .parallel([
    async (state) => {
      state.f = 6;
      return state;
    },
    async (state) => {
      state.g = 7;
      return state;
    }
  ])
  .go([
    { to: "increment-a", if: async (state) => state.a < 4 },
    { to: "STATE:UPDATED:ANALYZED", if: async (state) => state.a > 9 }
  ])
  .assign({
    blocks: [
      { id: 1, items: [{ id: 1 }, { id: 2 }, { id: 3 }] },
      { id: 2, items: [{ id: 1 }, { id: 2 }, { id: 3 }] }
    ]
  })
  .loop({
    key: "blocks",
    chain: (chain) =>
      chain.loop({
        key: "items",
        chain: (chain) =>
          chain.parallel([
            async (state) => {
              state.element.title = "title";
              return state;
            },
            async (state) => {
              state.element.description = "description";
              return state;
            }
          ])
      })
  })
  .pick("j")
  .on("check", (msg) => console.log(msg));

// const res = await main.run({ a: 0 });
// console.log(JSON.stringify(res, null, 2));

const stream = main.stream({ a: 0 });
for await (const state of stream) {
  console.log(state.origin, state.type, state.name ?? "");
}
