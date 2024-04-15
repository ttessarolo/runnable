/// <reference types="node" resolution-mode="require"/>
/**
 * @module Cache
 * @description Cache class for Runnify
 */
import EventEmitter from "node:events";
import Keyv from "keyv";
import { WrapOptions, RunCache, RunState } from "./types.js";
export declare class CacheFactory {
    private cache;
    constructor();
    getCache(config?: RunCache): Keyv | undefined;
    clear(name: string): void;
    clearAll(): void;
    disconnect(name: string): void;
    disconnectAll(): void;
}
/** @ignore */
export declare const cacheFactory: CacheFactory;
/** @ignore */
export default class Cache {
    private sig?;
    private id?;
    private active?;
    private cache?;
    private config?;
    private key?;
    private ttl?;
    private timeout?;
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
    set(value: object, emitter: EventEmitter): Promise<boolean | undefined>;
}
