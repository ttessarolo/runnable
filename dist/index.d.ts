/// <reference types="node" resolution-mode="require"/>
/**
 * @module Runnable
 * @description Runnable is a library for building and running complex pipelines of functions and runnables.
 */
import EventEmitter from "node:events";
import { z } from "zod";
import { Tracer, Meter } from "@opentelemetry/api";
import { RunState, SwitchCase, StepOptions, Roote, StepEvent, StreamTransformer, CacheFactoryType, RunnableParams } from "./types.js";
/**
 * @class Runnable
 * @description Runnable class for building and running complex pipelines of functions and runnables.
 * @example const r = new Runnable({ a: 1 });
 * await r.run();
 * @example const r = new Runnable({ a: 1 }, { name: "myRunnable" });
 * await r.run();
 **/
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
    private ctx;
    private tracer;
    private meter;
    private runDuration;
    private runId;
    private signal?;
    private wrappedFncs;
    private circuit?;
    private constructor();
    getState(): object;
    getEmitter(): EventEmitter;
    getTracer(): Tracer;
    getMeter(): Meter;
    getWrappedCount(): number;
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
    private iterate;
    private getBasicParams;
    private clone;
    static isRunnable(): boolean;
    /**
     * Invokes/Run the runnable with the given state and parameters.
     *
     * @param state - The state to be passed to the runnable.
     * @param params - The parameters to be passed to the runnable. Default is an empty object.
     * @returns A promise that resolves with the result of the runnable.
     */
    invoke(state?: RunState, params?: RunnableParams): Promise<unknown>;
    run(state?: RunState, params?: RunnableParams): Promise<unknown>;
    /**
     * Creates a StreamTransformer for running the code.
     * @param params - Optional parameters for the runnable.
     * @returns A StreamTransformer instance.
     */
    stream(params?: RunnableParams): StreamTransformer;
    streamSteps(state?: RunState, params?: RunnableParams): AsyncGenerator<StepEvent>;
    static getCacheFactory(): CacheFactoryType;
    static from(steps: any[], params?: RunnableParams): Runnable;
    static init(params?: RunnableParams): Runnable;
}
