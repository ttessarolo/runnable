import { RunState } from "./types.js";
import Runnable from "./index.js";
export declare const sleep: (ms?: number) => Promise<unknown>;
export declare const isFunc: (obj: any) => obj is Function;
export declare const isExecutable: (obj: any) => obj is Function | Runnable;
export declare const random: (min?: number, max?: number) => number;
export declare const stringifyState: (obj: RunState) => string;
export declare const stringifyKeys: (obj: RunState, keys: Array<string>) => string;
