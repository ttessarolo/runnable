import Keyv from "keyv";
import { z } from "zod";
import { WrapOptions, RunChache, RunState } from "./types.js";
import { stringifyState, stringifyKeys } from "./utils.js";

export default class Cache {
  private cache?: Keyv;
  private config?: RunChache | undefined;

  cnostructor(config: WrapOptions) {
    if (config.cache) {
      if (typeof config.cache.cacheKeyStrategy === "string") {
        config.cache.cacheKeyStrategy = [config.cache.cacheKeyStrategy];
      }
      this.config = config.cache;
      this.cache = new Keyv({
        uri:
          typeof config.cache.store === "string"
            ? config.cache.store
            : undefined,
        store:
          typeof config.cache.store !== "string"
            ? config.cache.store
            : undefined,
        namespace: "runnify:cache"
      });
    }
  }

  private async isActive(state: object): Promise<boolean> {
    if (!this.cache) return false;
    if (typeof this.config?.active === "boolean") return this.config.active;
    return await this.config?.active(state);
  }

  private async getCacheKey(state: RunState): Promise<string> {
    if (Array.isArray(this.config?.cacheKeyStrategy)) {
      return stringifyKeys(state, this.config.cacheKeyStrategy);
    }
    if (typeof this.config?.cacheKeyStrategy === "function") {
      return await this.config.cacheKeyStrategy(state);
    }

    if (this.config?.cacheKeyStrategy instanceof z.ZodType) {
      return stringifyState(this.config.cacheKeyStrategy.parse(state));
    }
    return stringifyState(state);
  }

  private async getTtl(state: RunState): Promise<number> {
    if (typeof this.config?.ttlStrategy === "number") {
      return this.config.ttlStrategy;
    }
    if (this.config?.ttlStrategy instanceof Promise) {
      return await this.config.ttlStrategy(state);
    }
    return 0;
  }

  async get(state: RunState): Promise<object | null> {
    if (await this.isActive(state)) {
      const key = await this.getCacheKey(state);
      return this.cache?.get(key);
    }
    return null;
  }

  async set(state: RunState, value: object): Promise<void> {
    if (await this.isActive(state)) {
      const key = await this.getCacheKey(state);
      const ttl = await this.getTtl(state);
      this.cache?.set(key, value, ttl);
    }
  }
}
