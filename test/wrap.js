import Runnable from "../dist/index.js";
import { z } from "zod";
import { sleep } from "./utils/index.js";
import "./utils/instrumentation.js";

// let assignErrors = 0;
// const multiSeq = Runnable.init({ name: "wrap:multi:seq" }).assign(
//   {
//     a: function setA(state) {
//       assignErrors++;
//       if (assignErrors < 3) throw new Error("Error");
//       return 1;
//     },
//     b: 2
//   },
//   { name: "set:ab", circuit: { retry: 1 } }
// );

// const state = await multiSeq.run();
// console.log(state);
// console.log("errors", assignErrors);
// console.log(multiSeq.getWrappedCount());

let errors = 0;
const seq = Runnable.init({ name: "wrap:branch:seq" }).branch(
  [
    {
      if: (state) => {
        errors++;
        if (errors < 3) throw new Error("Error");
        return state.a === 1;
      },
      then: () => {
        errors++;
        if (errors < 3) throw new Error("Error");
        return { c: 3 };
      }
    }
  ],
  { name: "branch:ab", circuit: { retry: 1 } }
);
const wrapped = seq.getWrappedCount();
const state = await seq.run({ a: 1 });
console.log(state);
console.log("errors", errors);
console.log(wrapped);

const parallelSeq = Runnable.init({ name: "parallel:seq" }).parallel([
  (state) => {
    state.a = 1;
    return state;
  }
]);

// console.log(parallelSeq.getWrappedCount());

const goToSeq = Runnable.init({ name: "goto:seq" })
  .milestone("a")
  .milestone("b")
  .go([
    {
      to: "a",
      if: (state) => state.a === 1
    },
    {
      to: "b",
      if: (state) => state.a === 2
    }
  ]);

// console.log(goToSeq.getWrappedCount());
