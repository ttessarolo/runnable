import Runnable from "./index.js";

export const sleep = (ms: number = 1000) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const isFunc = (obj: any) =>
  obj instanceof Function || obj instanceof Runnable;
