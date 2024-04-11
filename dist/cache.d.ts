/// <reference types="node" resolution-mode="require"/>
import EventEmitter from "node:events";
import { WrapOptions, RunState } from "./types.js";
export default class Cache {
    private sig?;
    private id?;
    private active?;
    private cache?;
    private config?;
    private key?;
    private ttl?;
    constructor(sig: {
        prefix?: string;
        stepName?: string;
        name?: string;
    }, config?: WrapOptions);
    private refresh;
    private checkActive;
    private getCacheKey;
    private getTtl;
    get(state: RunState, emitter: EventEmitter): Promise<object | null>;
    set(value: object, emitter: EventEmitter): Promise<void>;
}
