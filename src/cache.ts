import EventEmitter from "node:events";
import Keyv from "keyv";
import { z } from "zod";
import { WrapOptions, RunCache, RunState } from "./types.js";
import { stringifyState, stringifyKeys, isFunc } from "./utils.js";

export default class Cache {
  private id?: string;
  private active?: boolean;
  private cache?: Keyv;
  private config?: RunCache | undefined;
  private key?: string;
  private ttl?: number;

  constructor(
    id: { prefix?: string; stepName?: string; name?: string },
    state: RunState = {},
    config?: WrapOptions
  ) {
    this.active = this.checkActive(state, config);
    if (this.active) {
      if (!id.name || !id.prefix) {
        throw new Error(
          "To enable cache you must specifiy runnable sequence name and function name (no anonymous or arrow functions allowed)."
        );
      }

      if (typeof config?.cache?.cacheKeyStrategy === "string") {
        config.cache.cacheKeyStrategy = [config.cache.cacheKeyStrategy];
      }

      this.id = `${id.prefix}:${id.stepName ? `${id.stepName}:` : ""}${
        id.name
      }`;
      this.config = config?.cache;
      this.key = this.getCacheKey(state);
      this.ttl = this.getTtl(state);

      this.cache = new Keyv({
        uri:
          typeof config?.cache?.store === "string"
            ? config.cache.store
            : undefined,
        store:
          typeof config?.cache?.store !== "string"
            ? config?.cache?.store
            : undefined,
        namespace: "runnify"
      });
    }
    return this;
  }

  private checkActive(state: object, config?: WrapOptions): boolean {
    if (!config?.cache) return false;
    if (config?.cache.active === undefined && config?.cache.store) return true;
    if (typeof config?.cache.active === "boolean") return config?.cache.active;
    if (config?.cache.active instanceof Function) config?.cache.active(state);

    return false;
  }

  private getCacheKey(state: RunState): string {
    let key: string = "";

    if (Array.isArray(this.config?.cacheKeyStrategy)) {
      key = stringifyKeys(state, this.config.cacheKeyStrategy);
    } else if (isFunc(this.config?.cacheKeyStrategy)) {
      key = this.config?.cacheKeyStrategy?.(state);
    } else if (this.config?.cacheKeyStrategy instanceof z.ZodType) {
      key = stringifyState(this.config.cacheKeyStrategy.parse(state));
    }

    return `${this.id}${key ? `:${key}` : ""}`;
  }

  private getTtl(state: RunState): number | undefined {
    if (typeof this.config?.ttlStrategy === "number") {
      return this.config.ttlStrategy;
    }
    if (isFunc(this.config?.ttlStrategy)) {
      return this.config?.ttlStrategy?.(state);
    }
    return undefined;
  }

  async get(emitter: EventEmitter): Promise<object | null> {
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
