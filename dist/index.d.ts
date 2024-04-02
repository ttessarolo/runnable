/// <reference types="node" resolution-mode="require"/>
/// <reference types="node" resolution-mode="require"/>
import EventEmitter from "node:events";
import { Transform } from "node:stream";
import { SwitchCase, StepOptions, Roote, Step, StepEvent, Iteration, IteratorFunction, RunnableParams } from "./types.js";
export default class Runnable {
    name?: string;
    state: object;
    emitter: EventEmitter;
    steps: Step[];
    iterator: IteratorFunction | undefined;
    maxIterations: number;
    private nextStep;
    private nodes;
    private iteractionCount;
    private subEvents;
    private constructor();
    getState(): object;
    getEmitter(): EventEmitter;
    on(event: string | symbol, fnc: Function): Runnable;
    emit(event: string | symbol, ...args: any[]): boolean;
    private setStep;
    milestone(name: string): Runnable;
    pipe(fnc: Function | Runnable, options?: StepOptions): Runnable;
    assign(key: string | object, fnc?: Function, options?: StepOptions): Runnable;
    passThrough(fnc: Function, options?: StepOptions): Runnable;
    pick(keys: string | string[], options?: StepOptions): Runnable;
    branch(fnc: SwitchCase[], options?: StepOptions): Runnable;
    branchAll(fnc: SwitchCase[], options?: StepOptions): Runnable;
    parallel(fncs: (Function | Runnable)[], options?: StepOptions): Runnable;
    loop(params: {
        key: string;
        chain: Function;
    }, options?: StepOptions): Runnable;
    go(rootes: Roote[] | Roote, options?: StepOptions): Runnable;
    private _exec;
    private _pipe;
    private _pick;
    private _passThrough;
    private _assign;
    private _branch;
    private _parallel;
    private _loop;
    private _go;
    stepsIterator(): IteratorFunction;
    private emitStep;
    iterate(iteration?: Iteration): Promise<void>;
    private clone;
    run(state?: object, params?: RunnableParams): Promise<object>;
    stream(params?: RunnableParams): Transform;
    streamLog(state?: object, params?: RunnableParams): AsyncGenerator<StepEvent>;
    static from(steps: any[], params?: RunnableParams): Runnable;
    static init(params?: RunnableParams): Runnable;
}
