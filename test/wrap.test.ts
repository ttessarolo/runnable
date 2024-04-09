import { expect, test } from "@jest/globals";
import Runnable from "../dist/index.js";
import "./instrumentation.js";

let retries = 0;
const main = Runnable.init({
  name: "wrap:main:seq",
  circuit: { retry: 3 }
}).pipe(
  (state: any) => {
    throw new Error(`Error ${++retries}`);
  }
  // { circuit: { retry: 3 } }
);

test("wrap:retry", async () => {
  const result = await main.run({}).catch((e) => {
    expect(e.message).toBe("Error 4");
  });
  console.log(result);
  expect(retries).toEqual(4);
});
