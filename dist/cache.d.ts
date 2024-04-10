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
    private emitter?;
    constructor(id: {
        prefix?: string;
        name?: string;
    }, state?: RunState, config?: WrapOptions, emitter?: EventEmitter);
    private checkActive;
    private getCacheKey;
    private getTtl;
    get(): Promise<object | null>;
    set(value: object): Promise<void>;
}
