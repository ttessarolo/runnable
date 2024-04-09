import { expect, test } from "@jest/globals";
import Runnable from "../dist/index.js";
import "./utils/instrumentation.js";

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

const getYear = async () => 1973;
const getB = async () => 2;
const setIncA = async (state: any) => {
  state.a = state.a + 1;
  return state;
};
const doEmitCheck = async (state: any, params: any) => {
  if (state.a === 1) params.emit("check", "a is ok");
};
const setC = async (state: any) => {
  state.c = 3;
  return state;
};
const A_is_1 = async (state: any) => state.a === 1;
const A_is_5 = async (state: any) => state.a === 5;
const A_less_4 = async (state: any) => state.a < 4;
const A_more_9 = async (state: any) => state.a > 9;
const setE = async (state: any) => {
  state.e = 5;
  return state;
};
const setF = async (state: any) => {
  state.f = 6;
  return state;
};
const setG = async (state: any) => {
  state.g = 7;
  return state;
};
const setBlockIndex = async (state: any) => {
  state.element.index = state.index;
  return state;
};
const setBlockCheck = async (state: any) => {
  state.element.check = true;
  return state;
};
const setItemTitle = async (state: any) => {
  state.element.title = "title";
  return state;
};
const setItemDescription = async (state: any) => {
  state.element.description = "description";
  return state;
};

const processBlock = Runnable.init({ name: "block:chain" }).parallel(
  [setBlockIndex, setBlockCheck],
  { name: "set:index:and:check" }
);
const processItems = Runnable.init({ name: "items:chain" }).loop({
  key: "items",
  chain: (chain: Runnable) =>
    chain.parallel([setItemTitle, setItemDescription], {
      name: "set:title:and:description"
    })
});
const processBlocks = Runnable.init({ name: "blocks:chain" }).loop({
  key: "blocks",
  chain: (chain: Runnable) =>
    chain.parallel([processBlock, processItems], {
      name: "process:block:and:items"
    })
});

const main = Runnable.init({ name: "full:main:seq" })
  .assign("year", getYear, { name: "year" })
  .assign({ b: getB }, { name: "b" })
  .push(setIncA, { name: "increment:a" })
  .passThrough(doEmitCheck, { name: "emit:check" })
  .push(setC, { name: "set:c" })
  .milestone("state:analyzed")
  .push(subSequence)
  .branch(
    [
      { if: A_is_1, then: subSubSequence },
      { if: A_is_5, then: setE }
    ],
    { name: "on:a:1:or:5" }
  )
  .parallel([setF, setG], { name: "set:f:and:g" })
  .go(
    [
      { to: "increment:a", if: A_less_4 },
      { to: "state:analyzed", if: A_more_9 }
    ],
    { name: "go:checking:a" }
  )
  .assign({
    blocks: [
      { id: 1, items: [{ id: 1 }, { id: 2 }, { id: 3 }] },
      { id: 2, items: [{ id: 1 }, { id: 2 }, { id: 3 }] }
    ]
  })
  .push(processBlocks)
  .on("check", (msg: string) => true);

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
    year: 1973,
    y: "ciao",
    z: "Z",
    f: 6,
    g: 7,
    blocks: [
      {
        id: 1,
        index: 0,
        check: true,
        items: [
          { id: 1, title: "title", description: "description" },
          { id: 2, title: "title", description: "description" },
          { id: 3, title: "title", description: "description" }
        ]
      },
      {
        id: 2,
        index: 1,
        check: true,
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
