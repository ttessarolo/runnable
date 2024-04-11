import EventEmitter from "node:events";
import { z } from "zod";
import Runnable from "./index.js";

export { Runnable };

export type RunState = Record<string, unknown>;
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
  state: { [key: string]: any };
};

export type Iteration = {
  value: Step | null;
  done: boolean;
};

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
  context?: any;
  runId?: string;
  circuit?: WrapOptions;
};

export type StreamTransformer = (
  iterator: any
) => AsyncGenerator<any, void, unknown>;

export interface RunFncInterface {
  (
    state: object,
    params: { emit: (arg1: string | symbol, arg2: any) => void }
  ): Promise<object>;
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

export class IteratorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IterateError";
  }
}
