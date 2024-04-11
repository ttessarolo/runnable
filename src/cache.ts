import EventEmitter from "node:events";
import Keyv from "keyv";
import QuickLRU from "quick-lru";
import { z } from "zod";
import { WrapOptions, RunCache, RunState } from "./types.js";
import { stringifyState, stringifyKeys, isFunc } from "./utils.js";

class CacheFactory {
  private cache: QuickLRU<string, Keyv>;

  constructor() {
    this.cache = new QuickLRU({ maxSize: 100 });
  }

  getCache(config?: RunCache): Keyv | undefined {
    if (config) {
      const name = config.name;

      if (this.cache.has(name)) {
        return this.cache.get(name);
      }

      const opts = {
        uri: typeof config.store === "string" ? config.store : undefined,
        store:
          typeof config.store !== "string"
            ? config.store
            : new QuickLRU({ maxSize: 1000 }),
        namespace: "runnify"
      };
      const cache = new Keyv(opts);
      this.cache.set(name, cache);
      return cache;
    }
  }
}

const cacheFactory = new CacheFactory();
export default class Cache {
  private sig?: { prefix?: string; stepName?: string; name?: string };
  private id?: string;
  private active?: boolean;
  private cache?: Keyv;
  private config?: RunCache | undefined;
  private key?: string;
  private ttl?: number;

  constructor(
    sig: { prefix?: string; stepName?: string; name?: string },
    config?: WrapOptions
  ) {
    this.sig = sig;
    this.config = config?.cache;

    if (typeof this.config?.cacheKeyStrategy === "string") {
      this.config.cacheKeyStrategy = [this.config.cacheKeyStrategy];
    }

    return this;
  }

  private async refresh(state: RunState): Promise<void> {
    await this.checkActive(state);
    if (this.active) {
      if (!this.cache) this.cache = cacheFactory.getCache(this.config);
      await Promise.all([this.getCacheKey(state), this.getTtl(state)]);
    }
  }

  private async checkActive(state: object): Promise<void> {
    let active = false;

    if (this.config?.active === undefined && this.config?.store) active = true;
    if (typeof this.config?.active === "boolean") active = this.config?.active;
    if (isFunc(this.config?.active)) active = await this.config?.active(state);

    if (active) {
      if (!this.sig?.name || !this.sig?.prefix) {
        throw new Error(
          "To enable cache you must specifiy runnable sequence name and function name (no anonymous or arrow functions allowed)."
        );
      }

      if (!this.id) {
        this.id = `${this.sig?.prefix}:${
          this.sig?.stepName ? `${this.sig?.stepName}:` : ""
        }${this.sig?.name}`;
      }
    }

    this.active = active;
  }

  private async getCacheKey(state: RunState): Promise<void> {
    let key: string = "";

    if (Array.isArray(this.config?.cacheKeyStrategy)) {
      key = stringifyKeys(state, this.config.cacheKeyStrategy);
    } else if (isFunc(this.config?.cacheKeyStrategy)) {
      key = await this.config?.cacheKeyStrategy?.(state);
    } else if (this.config?.cacheKeyStrategy instanceof z.ZodType) {
      key = stringifyState(this.config.cacheKeyStrategy.parse(state));
    }

    this.key = `${this.id}${key ? `:${key}` : ""}`;
  }

  private async getTtl(state: RunState): Promise<void> {
    let ttl: number | undefined = undefined;
    if (typeof this.config?.ttlStrategy === "number") {
      ttl = this.config.ttlStrategy;
    }
    if (isFunc(this.config?.ttlStrategy)) {
      ttl = await this.config?.ttlStrategy?.(state);
    }
    this.ttl = ttl;
  }

  async get(state: RunState, emitter: EventEmitter): Promise<object | null> {
    await this.refresh(state);

    if (this.active && this.key) {
      const R = await this.cache?.get(this.key);
      if (emitter) {
        if (R) emitter.emit("cache:hit", this.key);
        else emitter.emit("cache:miss", this.key);
      }
      return R;
    }
    return null;
  }

  async set(value: object, emitter: EventEmitter): Promise<void> {
    if (this.active && this.key && value) {
      await this.cache?.set(this.key, value, this.ttl);
      if (emitter) {
        emitter.emit("cache:set", this.key);
      }
    }
  }
}
