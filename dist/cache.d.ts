import { WrapOptions } from "./types.js";
export declare class Cache {
    private cache?;
    private config?;
    cnostructor(config: WrapOptions): void;
    private isActive;
    private getCacheKey;
    get(state: Record<string, unknown>): Promise<object | null>;
}
