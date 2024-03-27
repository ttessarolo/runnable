/// <reference types="node" resolution-mode="require"/>
import EventEmitter from "node:events";
import Runnable from "./index.js";
export { Runnable };
export declare enum StepType {
    INIT = "init",
    PIPE = "pipe",
    ASSIGN = "assign",
    PASSTHROUGH = "passThrough",
    PICK = "pick",
    BRANCH = "branch",
    PARALLEL = "parallel",
    LOOP = "loop",
    GOTO = "goto",
    MILESTONE = "milestone"
}
export type SwitchCase = {
    if: Function;
    then: Function | Runnable;
};
export type StepOptions = {
    name?: string;
    processAll?: boolean;
};
export type Roote = {
    to: string;
    if?: Function;
};
export type Step = {
    name?: string;
    step?: any;
    type: StepType;
    fnc?: Function;
    key?: string;
    options?: object;
};
export type StepEvent = {
    id: string;
    name?: string;
    type: string;
    origin?: string;
    state: {
        [key: string]: any;
    };
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
};