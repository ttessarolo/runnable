import { expect, jest, test } from "@jest/globals";
import EventEmitter from "node:events";
import Runnable from "../dist/index.js";

const em = new EventEmitter();
const rn = Runnable.init({ name: "main:seq" });

test("main", async () => {
  expect(true).toBe(true);
});
