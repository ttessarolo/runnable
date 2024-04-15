import Keyv from "keyv";
import QuickLRU from "quick-lru";
import { z } from "zod";
import pTimeout from "p-timeout";
import { stringifyState, stringifyKeys, isFunc } from "./utils.js";
export class CacheFactory {
    cache;
    constructor() {
        this.cache = new QuickLRU({ maxSize: 100 });
    }
    getCache(config) {
        if (config) {
            const name = config.name;
            if (this.cache.has(name)) {
                return this.cache.get(name);
            }
            const opts = {
                uri: typeof config.store === "string" ? config.store : undefined,
                store: typeof config.store !== "string"
                    ? config.store
                    : new QuickLRU({ maxSize: config.maxSize ?? 1000 }),
                namespace: "runnify"
            };
            const cache = new Keyv(opts);
            this.cache.set(name, cache);
            return cache;
        }
    }
    clear(name) {
        const cache = this.cache.get(name);
        if (cache) {
            cache.clear();
        }
    }
    clearAll() {
        for (const cache of this.cache.values()) {
            cache.clear();
        }
    }
    disconnect(name) {
        const cache = this.cache.get(name);
        if (cache) {
            cache.disconnect();
        }
    }
    disconnectAll() {
        for (const cache of this.cache.values()) {
            cache.disconnect();
        }
    }
}
/** @ignore */
export const cacheFactory = new CacheFactory();
/** @ignore */
export default class Cache {
    sig;
    id;
    active;
    cache;
    config;
    key;
    ttl;
    timeout;
    constructor(sig, config) {
        this.sig = sig;
        this.config = config?.cache;
        if (typeof this.config?.cacheKeyStrategy === "string") {
            this.config.cacheKeyStrategy = [this.config.cacheKeyStrategy];
        }
        return this;
    }
    async refresh(state) {
        await this.checkActive(state);
        if (this.active) {
            if (!this.cache)
                this.cache = cacheFactory.getCache(this.config);
            this.timeout = this.config?.timeout;
            await Promise.all([this.getCacheKey(state), this.getTtl(state)]);
        }
    }
    async checkActive(state) {
        let active = false;
        if (this.config?.active === undefined && this.config?.store)
            active = true;
        if (typeof this.config?.active === "boolean")
            active = this.config?.active;
        if (isFunc(this.config?.active))
            active = await this.config?.active(state);
        if (active) {
            if (!this.sig?.name || !this.sig?.prefix) {
                throw new Error("To enable cache you must specifiy runnable sequence name and function name (no anonymous or arrow functions allowed).");
            }
            if (!this.id) {
                this.id = `${this.sig?.prefix}:${this.sig?.stepName ? `${this.sig?.stepName}:` : ""}${this.sig?.name}`;
            }
        }
        this.active = active;
    }
    async getCacheKey(state) {
        let key = "";
        if (Array.isArray(this.config?.cacheKeyStrategy)) {
            key = stringifyKeys(state, this.config.cacheKeyStrategy);
        }
        else if (isFunc(this.config?.cacheKeyStrategy)) {
            key = await this.config?.cacheKeyStrategy?.(state);
        }
        else if (this.config?.cacheKeyStrategy instanceof z.ZodType) {
            key = stringifyState(this.config.cacheKeyStrategy.parse(state));
        }
        this.key = `${this.id}${key ? `:${key}` : ""}`;
    }
    async getTtl(state) {
        let ttl = undefined;
        if (typeof this.config?.ttlStrategy === "number") {
            ttl = this.config.ttlStrategy;
        }
        if (isFunc(this.config?.ttlStrategy)) {
            ttl = await this.config?.ttlStrategy?.(state);
        }
        this.ttl = ttl;
    }
    async get(state, emitter) {
        await this.refresh(state);
        if (this.active && this.key) {
            const R = this.timeout
                ? await pTimeout(this.cache?.get(this.key), {
                    milliseconds: this.timeout
                }).catch(() => {
                    if (emitter) {
                        emitter.emit("cache:get:timeout", this.key);
                    }
                    return null;
                })
                : await this.cache?.get(this.key);
            if (emitter) {
                if (R)
                    emitter.emit("cache:hit", this.key);
                else
                    emitter.emit("cache:miss", this.key);
            }
            return R;
        }
        return null;
    }
    async set(value, emitter) {
        if (this.active && this.key && value) {
            const res = this.timeout
                ? await pTimeout(this.cache?.set(this.key, value, this.ttl), {
                    milliseconds: this.timeout
                }).catch(() => {
                    if (emitter) {
                        emitter.emit("cache:set:timeout", this.key);
                    }
                    return undefined;
                })
                : await this.cache?.set(this.key, value, this.ttl);
            if (emitter) {
                emitter.emit("cache:set", this.key);
            }
            return res;
        }
    }
}
