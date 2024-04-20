/**
 * @module Types
 * @description Types for Runnify
 */
import EventEmitter from "node:events";
import { z } from "zod";
import { Runnable } from "./runnable.js";
import { CacheFactory } from "./cache.js";
export type { Tracer, Meter } from "@opentelemetry/api";

export type CacheFactoryType = CacheFactory;
export type RunState = Record<string, unknown>;
/** @internal */
export enum StepType {
  START = "start",
  PIPE = "pipe",
  PUSH = "push",
  ASSIGN = "assign",
  PASSTHROUGH = "passThrough",
  PICK = "pick",
  BRANCH = "branch",
  PARALLEL = "parallel",
  LOOP = "loop",
  GOTO = "goto",
  MILESTONE = "milestone",
  END = "end"
}

export type SwitchCase = {
  if: Function;
  then: Function | Runnable;
};

export type StepOptions = {
  name?: string;
  tags?: string[];
  /** @internal */
  processAll?: boolean;
  mode?: "pipe" | "push";
  schema?: z.ZodType;
  circuit?: WrapOptions;
};

export type Roote = { to: string; if?: Function };
export type Step = {
  name?: string;
  step?: any;
  type: StepType;
  fnc?: Function;
  key?: string;
  options?: StepOptions;
};

export type StepEvent = {
  id: string;
  runId: string;
  ts: number;
  step: number;
  name?: string;
  type: string;
  origin?: string;
  tags?: string[];
  state: RunState;
};

/** @internal */
export type Iteration = {
  value: Step | null;
  done: boolean;
};

/** @internal */
export type IteratorFunction = {
  next: () => Iteration;
};

export type EventType = {
  name: string | symbol;
  listener: any;
};

export type RunnableParams = {
  name?: string;
  emitter?: EventEmitter;
  maxIterations?: number;
  nodes?: Map<string, number>;
  steps?: Step[];
  subEvents?: EventType[];
  highWaterMark?: number;
  ctx?: any;
  runId?: string;
  signal?: AbortSignal;
  circuit?: WrapOptions;
};

export type StreamTransformer = (
  iterator: any
) => AsyncGenerator<any, void, unknown>;

export interface RunFncParams {
  emit: (arg1: string | symbol, arg2: any) => void;
  ctx: any;
  signal: AbortSignal;
}

export interface RunCache {
  name: string;
  store?: string | any;
  active?: boolean | Function;
  cacheKeyStrategy?: string[] | Function | z.ZodType;
  ttlStrategy?: number | Function;
  timeout?: number;
  maxSize?: number;
}
export interface WrapOptions {
  name?: string;
  /** @internal */
  avoidExec?: boolean;
  fallback?: Function | Runnable;
  cache?: RunCache;
  retry?:
    | {
        maxAttempts: number;
        maxDelay?: number;
        initialDelay?: number;
      }
    | number;
  circuitBreaker?: {
    halfOpenAfter?: number;
    consecutiveFaillures?: number;
    threshold?: number;
    duration?: number;
    minimumRps?: number;
  };
  bulkhead?: number;
  timeout?: number;
}
