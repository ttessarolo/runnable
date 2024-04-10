/// <reference types="node" resolution-mode="require"/>
import EventEmitter from "node:events";
import { z } from "zod";
import { Tracer, Meter } from "@opentelemetry/api";
import { SwitchCase, StepOptions, Roote, StepEvent, Iteration, StreamTransformer, RunnableParams } from "./types.js";
export default class Runnable {
    private name?;
    private state;
    private emitter;
    private steps;
    private iterator;
    private maxIterations;
    private nextStep;
    private nodes;
    private iteractionCount;
    private subEvents;
    private context;
    private tracer;
    private meter;
    private runDuration;
    private runId;
    private aborted;
    private circuit?;
    private constructor();
    getState(): object;
    getEmitter(): EventEmitter;
    getTracer(): Tracer;
    getMeter(): Meter;
    private checkEnd;
    on(event: string | symbol, fnc: Function): Runnable;
    emit(event: string | symbol, ...args: any[]): boolean;
    private wrapFnc;
    private wrapStepFncs;
    private setStep;
    milestone(name: string): Runnable;
    /**
     * Adds a step to the runnable pipeline using the provided function or runnable.
     * @param fnc - The function or runnable to be added as a step.
     * @param options: - Optional options for the step.
     * @returns The updated Runnable instance.
     */
    pipe(fnc: Function | Runnable, options?: StepOptions): Runnable;
    push(fnc: Function | Runnable, options?: StepOptions): Runnable;
    assign(key: string | object, fnc?: Function | StepOptions, options?: StepOptions): Runnable;
    passThrough(fnc: Function, options?: StepOptions): Runnable;
    pick(keys: string | string[] | z.ZodType, options?: StepOptions): Runnable;
    branch(fnc: SwitchCase[], options?: StepOptions): Runnable;
    branchAll(fnc: SwitchCase[], options?: StepOptions): Runnable;
    parallel(fncs: (Function | Runnable)[], options?: StepOptions): Runnable;
    loop(params: {
        key: string;
        chain: Function;
    }, options?: StepOptions): Runnable;
    go(rootes: Roote[] | Roote, options?: StepOptions): Runnable;
    private getNow;
    private setSpanAttr;
    private _exec;
    private _pipe;
    private _push;
    private _pick;
    private _passThrough;
    private _assign;
    private _branch;
    private _parallel;
    private _loop;
    private _go;
    private stepsIterator;
    private emitStep;
    iterate(iteration?: Iteration): Promise<void>;
    private clone;
    static isRunnable(): boolean;
    invoke(state?: Record<string, unknown>, params?: RunnableParams): Promise<any>;
    run(state?: Record<string, unknown>, params?: RunnableParams): Promise<any>;
    stream(params?: RunnableParams): StreamTransformer;
    streamLog(state?: Record<string, unknown>, params?: RunnableParams): AsyncGenerator<StepEvent>;
    static from(steps: any[], params?: RunnableParams): Runnable;
    static init(params?: RunnableParams): Runnable;
}
