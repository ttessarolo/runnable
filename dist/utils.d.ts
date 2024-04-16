import { RunState } from "./types.js";
import { Runnable } from "./runnable.js";
export declare const sleep: (ms?: number) => Promise<unknown>;
export declare const isFunc: (obj: any) => obj is Function;
export declare const isExecutable: (obj: any) => obj is Function | Runnable;
export declare const random: (min?: number, max?: number) => number;
export declare const stringifyState: (obj: RunState) => string;
/**
 * Converts the specified keys of an object to a string representation.
 * @param obj - The object to extract the keys from.
 * @param keys - An array of keys to stringify.
 * @returns A string representation of the specified keys and their corresponding values.
 */
export declare const stringifyKeys: (obj: RunState, keys: Array<string>) => string;
