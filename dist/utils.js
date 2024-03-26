import Runnable from "./index.js";
export const sleep = (ms = 1000) => new Promise((resolve) => setTimeout(resolve, ms));
export const isFunc = (obj) => obj instanceof Function || obj instanceof Runnable;
