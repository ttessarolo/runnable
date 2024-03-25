import EventEmitter from "node:events";

export enum StepType {
  INIT = "init",
  PIPE = "pipe",
  ASSIGN = "assign",
  PASSTHROUGH = "passThrough",
  PICK = "pick",
  ROOTER = "rooter"
}

export type Step = {
  step?: any;
  type: StepType;
  fnc?: Function;
};

export type IteratorFunction = {
  next: () => { value: Step; done: boolean } | { value: null; done: true };
};

export type RunnableParams = {
  name?: string;
  emitter?: EventEmitter;
};
