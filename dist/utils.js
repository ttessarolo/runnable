import Runnable from "./index.js";
export const sleep = (ms = 1000) => new Promise((resolve) => setTimeout(resolve, ms));
export const isFunc = (obj) => obj instanceof Function || obj instanceof Runnable;
export const random = (min = 100, max = 10000000) => Math.floor(Math.random() * (max - min + 1)) + min;
