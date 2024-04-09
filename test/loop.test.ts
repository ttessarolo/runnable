import { expect, test } from "@jest/globals";
import Runnable from "../dist/index.js";
import "./utils/instrumentation.js";

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

const main = Runnable.init({ name: "loop:seq" }).push(processBlocks);

test("loop", async () => {
  let res;

  res = await main
    .run({
      blocks: [
        { id: 1, items: [{ id: 1 }, { id: 2 }, { id: 3 }] },
        { id: 2, items: [{ id: 1 }, { id: 2 }, { id: 3 }] }
      ]
    })
    .catch((e) => {
      {
        console.log(e);
      }
    });

  const k = {
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
