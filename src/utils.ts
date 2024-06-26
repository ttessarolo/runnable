import get from "lodash.get";
import { RunState } from "./types.js";
import { Runnable } from "./runnable.js";

export const sleep = (ms: number = 1000) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const isFunc = (obj: any): obj is Function =>
  obj instanceof Function || obj instanceof Promise;

export const isExecutable = (obj: any): obj is Function | Runnable =>
  obj instanceof Function || obj instanceof Promise || obj instanceof Runnable;

export const random = (min: number = 100, max: number = 10000000) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

export const stringifyState = (obj: RunState) => {
  const keys = [];
  for (const key in obj) {
    keys.push(`${key}:${obj[key]}`);
  }
  return keys.join(":");
};

/**
 * Converts the specified keys of an object to a string representation.
 * @param obj - The object to extract the keys from.
 * @param keys - An array of keys to stringify.
 * @returns A string representation of the specified keys and their corresponding values.
 */
export const stringifyKeys = (obj: RunState, keys: Array<string>) => {
  const chiavi = [];
  for (const key of keys) {
    if (get(obj, key) !== undefined) {
      chiavi.push(`${key}:${obj[key]}`);
    }
  }
  return chiavi.join(":");
};
