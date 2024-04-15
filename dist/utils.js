import get from "lodash.get";
import Runnable from "./index.js";
export const sleep = (ms = 1000) => new Promise((resolve) => setTimeout(resolve, ms));
export const isFunc = (obj) => obj instanceof Function || obj instanceof Promise;
export const isExecutable = (obj) => obj instanceof Function || obj instanceof Promise || obj instanceof Runnable;
export const random = (min = 100, max = 10000000) => Math.floor(Math.random() * (max - min + 1)) + min;
export const stringifyState = (obj) => {
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
export const stringifyKeys = (obj, keys) => {
    const chiavi = [];
    for (const key of keys) {
        if (get(obj, key) !== undefined) {
            chiavi.push(`${key}:${obj[key]}`);
        }
    }
    return chiavi.join(":");
};
