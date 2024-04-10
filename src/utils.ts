import { RunState } from "./types.js";
import Runnable from "./index.js";

export const sleep = (ms: number = 1000) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const isFunc = (obj: any) =>
  obj instanceof Function || obj instanceof Runnable;

export const random = (min: number = 100, max: number = 10000000) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

export const stringifyState = (obj: RunState) => {
  const keys = [];
  for (const key in obj) {
    keys.push(`${key}:${obj[key]}`);
  }
  return keys.join(":");
};

export const stringifyKeys = (obj: RunState, keys: Array<string>) => {
  const chiavi = [];
  for (const key of keys) {
    if (obj[key]) {
      chiavi.push(`${key}:${obj[key]}`);
    }
  }
  return keys.join(":");
};
