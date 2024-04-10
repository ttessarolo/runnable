import Keyv from "keyv";
export class Cache {
  cache;
  config;
  cnostructor(config) {
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
  async isActive(state) {
    if (!this.cache) return false;
    if (typeof this.config?.active === "boolean") return this.config.active;
    return await this.config?.active(state);
  }
  async getCacheKey(state) {
    if (Array.isArray(this.config?.cacheKeyStrategy)) {
      const keys = [];
      for (const key of this.config.cacheKeyStrategy) {
        if (state[key]) {
          keys.push(`${key}:${state[key]}`);
        }
      }
      return keys.join(":");
    } else if (typeof this.config?.cacheKeyStrategy === "function") {
      return this.config.cacheKeyStrategy(state);
    } else if (this.config?.cacheKeyStrategy instanceof z.ZodType) {
      const keys = [];
      const obj = JSON.stringify(this.config.cacheKeyStrategy.parse(state));
      for (const key in obj) {
        keys.push(`${key}:${obj[key]}`);
      }
      return keys.join(":");
    }
    return JSON.stringify(state);
  }
  async get(state) {
    if (await this.isActive(state)) {
      return this.cache?.get(JSON.stringify(state));
    }
    return null;
  }
}
