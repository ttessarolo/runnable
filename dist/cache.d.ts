/// <reference types="node" resolution-mode="require"/>
import EventEmitter from "node:events";
import { WrapOptions, RunState } from "./types.js";
export default class Cache {
    private id?;
    private active?;
    private cache?;
    private config?;
    private key?;
    private ttl?;
    constructor(id: {
        prefix?: string;
        stepName?: string;
        name?: string;
    }, state?: RunState, config?: WrapOptions);
    private checkActive;
    private getCacheKey;
    private getTtl;
    get(emitter: EventEmitter): Promise<object | null>;
    set(value: object, emitter: EventEmitter): Promise<void>;
}
