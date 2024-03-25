import { exec } from "node:child_process";
import EventEmitter, { on } from "node:events";
import { v4 as uuidv4 } from "uuid";

// import "./types.ts";

const isFunc = (obj: any) =>
  typeof obj === "function" || obj instanceof Runnable;

enum StepType {
  INIT = "init",
  PIPE = "pipe",
  ASSIGN = "assign",
  PASSTHROUGH = "passThrough",
  PICK = "pick",
  SWITCH = "switch",
  PARALLEL = "parallel",
  LOOP = "loop"
}

type SwitchCase = {
  if: Function;
  then: Function | Runnable;
};

type SwitchOptions = {
  processAll?: boolean;
};

type Step = {
  step?: any;
  type: StepType;
  fnc?: Function;
  key?: string;
  options?: object;
};

type IteratorFunction = {
  next: () => { value: Step; done: boolean } | { value: null; done: true };
};

type RunnableParams = {
  name?: string;
  emitter?: EventEmitter;
};

const sleep = (ms: number = 1000) =>
  new Promise((resolve) => setTimeout(resolve, ms));

function getDeep(obj: object, path: string) {
  return path.split(".").reduce((acc, key) => acc[key], obj);
}

function setDeep(obj: object, path: string, value: any) {
  const keys = path.split(".");
  const last = keys.pop();
  const lastObj = keys.reduce((acc, key) => {
    if (!acc[key]) acc[key] = {};
    return acc[key];
  }, obj);
  lastObj[last] = value;
}
class Runnable {
  name?: string;
  state: object;
  emitter: EventEmitter;
  steps: Step[] = [];
  iterator: IteratorFunction;
  private nextStep: number = 0;

  constructor(state: object, params: RunnableParams = {}) {
    this.name = params.name;
    this.state = state;
    this.emitter = params.emitter ?? new EventEmitter();

    return this;
  }

  on(event: string | symbol, fnc: any): Runnable {
    this.emitter.on(event, fnc);
    return this;
  }

  emit(event: string | symbol, ...args: any[]): boolean {
    return this.emitter.emit(event, ...args);
  }

  setStep(step: Step) {
    this.steps.push(step);
  }

  pipe(fnc: Function | Runnable): Runnable {
    this.setStep({ step: fnc, type: StepType.PIPE });
    return this;
  }

  assign(key: string | object, fnc?: Function): Runnable {
    this.setStep({ step: key, type: StepType.ASSIGN, fnc: fnc });
    return this;
  }

  passThrough(fnc: Function): Runnable {
    this.setStep({ step: fnc, type: StepType.PASSTHROUGH });
    return this;
  }

  pick(keys: string | string[]): Runnable {
    this.setStep({ step: keys, type: StepType.PICK });
    return this;
  }

  switch(fnc: SwitchCase[], options: any = {}): Runnable {
    this.setStep({ step: fnc, type: StepType.SWITCH, options });
    return this;
  }

  switchAll(fnc: SwitchCase[], options: any = {}): Runnable {
    this.setStep({
      step: fnc,
      type: StepType.SWITCH,
      options: { ...options, processAll: true }
    });
    return this;
  }

  parallel(fncs: (Function | Runnable)[]): Runnable {
    this.setStep({ step: fncs, type: StepType.PARALLEL });
    return this;
  }

  loop(options: { key: string; execute: (Function | Runnable)[] }): Runnable {
    this.setStep({
      step: options.execute,
      type: StepType.LOOP,
      key: options.key
    });
    return this;
  }

  private async _exec(fnc: any) {
    const stato = structuredClone(this.state);
    return fnc instanceof Runnable
      ? await fnc.run(stato, { emitter: this.emitter })
      : await fnc(stato, this.emitter);
  }

  private async _pipe(fnc: any): Promise<Runnable> {
    this.state = { ...this.state, ...(await this._exec(fnc)) };

    return this;
  }

  private _pick(keys: string | string[]): Runnable {
    if (!Array.isArray(keys)) keys = [keys];
    const obj = {};
    keys.forEach((key) => {
      obj[key] = getDeep(this.state, key);
    });
    this.state = obj;

    return this;
  }

  private async _passThrough(fnc: Function): Promise<Runnable> {
    await fnc(structuredClone(this.state), this.emitter);
    return this;
  }

  private async _assign(
    key: string | object,
    fnc?: Function
  ): Promise<Runnable> {
    if (typeof key === "string" && !fnc) {
      throw new Error("Function is required");
    }

    if (typeof key === "string" && fnc) {
      setDeep(this.state, key, await this._exec(fnc));
    } else {
      const execs: Promise<any>[] = [];
      const keys: any[] = [];
      for (const [k, objFnc] of Object.entries(key)) {
        keys.push(k);
        if (isFunc(objFnc)) execs.push(this._exec(objFnc));
        else execs.push(Promise.resolve(objFnc));
      }
      const values = await Promise.all(execs);

      for (let i = 0, length = keys.length; i < length; i++) {
        setDeep(this.state, keys[i], values[i]);
      }
    }

    return this;
  }

  private async _switch(
    cases: SwitchCase[],
    options: SwitchOptions = {}
  ): Promise<Runnable> {
    const execs: Promise<object>[] = [];

    for (const caso of cases) {
      if (await this._exec(caso.if)) {
        execs.push(this._exec(caso.then));
        if (!options.processAll) break;
      }
    }

    const update = (await Promise.all(execs)).reduce(
      (acc: object, val: object) => {
        if (val) return { ...acc, ...val };
        return acc;
      },
      {}
    );

    this.state = { ...this.state, ...update };

    return this;
  }

  private async _parallel(
    fncs: (Function | Runnable)[],
    options: object
  ): Promise<Runnable> {
    const execs = fncs.map((fnc) => this._exec(fnc));
    const results = await Promise.all(execs);
    const update = results.reduce((acc: object, val: object) => {
      if (val) return { ...acc, ...val };
      return acc;
    }, {});
    this.state = { ...this.state, ...update };

    return this;
  }

  private async _loop(execute: (Function | Runnable)[], key: string) {
    const items = getDeep(this.state, key);
    if (!Array.isArray(items)) throw new Error("Loop key must be an array");
    for (let i = 0, length = items.length; i < length; i++) {
      const execs = [];
      const item = items[i];
      for (const fnc of execute) {
        if (fnc instanceof Runnable)
          execs.push(
            fnc.run(
              {
                _loopItem: item,
                _loopIndex: i,
                ...structuredClone(this.state)
              },
              { emitter: this.emitter }
            )
          );
        else execs.push(fnc(item, structuredClone(this.state), i));
      }
      await Promise.all(execs);
    }

    return this;
  }

  stepsIterator(): IteratorFunction {
    return {
      next: () => {
        if (this.nextStep < this.steps.length) {
          const result = { value: this.steps[this.nextStep], done: false };
          this.nextStep += 1;
          return result;
        }
        return { value: null, done: true };
      }
    };
  }

  private emitStep(type: string) {
    this.emit("step", {
      id: uuidv4(),
      type,
      origin: this.name,
      state: this.state
    });
  }

  async iterate(iteration: any) {
    if (!iteration.done) {
      const { step, type, fnc, key, options } = iteration.value;
      switch (type) {
        case StepType.INIT:
          await sleep(1);
          break;
        case StepType.PIPE:
          await this._pipe(step);
          break;
        case StepType.ASSIGN:
          await this._assign(step, fnc);
          break;
        case StepType.PASSTHROUGH:
          await this._passThrough(step);
          break;
        case StepType.SWITCH:
          await this._switch(step, options);
          break;
        case StepType.PARALLEL:
          await this._parallel(step, options);
          break;
        case StepType.LOOP:
          await this._loop(step, key);
          break;
        case StepType.PICK:
          await this._pick(step);
          break;
      }

      this.emitStep(type);

      await this.iterate(this.iterator.next());
    }
  }

  private _warm(state?: object, params: RunnableParams = {}) {
    if (state) this.state = { ...this.state, ...state };
    if (params.emitter) this.emitter = params.emitter;
    if (params.name) this.name = params.name;

    this.iterator = this.stepsIterator();
  }

  async run(state?: object, params: RunnableParams = {}) {
    this._warm(state, params);
    await this.iterate(this.iterator.next());

    return this.state;
  }

  async *stream(state?: object, params: RunnableParams = {}): AsyncGenerator {
    this._warm(state, params);
    this.iterate(this.iterator.next());

    for await (const [iteration] of on(this.emitter, "step")) {
      yield iteration;
    }
  }

  static from(steps: any[], params: RunnableParams = {}) {
    const r = new Runnable({}, params);
    for (const step of steps) {
      if (isFunc(step)) r.pipe(step);
      if (typeof step === "object") r.assign(step);
    }
    return r;
  }

  static init(state: object = {}, params: RunnableParams = {}) {
    const runnable = new Runnable(state, params);
    runnable.setStep({ type: StepType.INIT });
    return runnable;
  }
}

const subSequence = Runnable.from(
  [
    { k: async () => "O", j: 1 },
    async (state: any) => {
      state.y = "ciao";
      return state;
    }
  ],
  { name: "sub:seq" }
);

const main = Runnable.init({ a: 1 }, { name: "main:seq" })
  .assign({ b: async () => await 2 })
  .passThrough((state: any, emitter: EventEmitter) => {
    if (state.a === 1) emitter.emit("check", "a is ok");
  })
  .pipe(async (state: any) => {
    state.c = 3;
    return state;
  })
  .pipe(subSequence)
  .switchAll([
    {
      if: async (state: any) => state.a === 1,
      then: async (state: any) => {
        state.d = 4;
        return state;
      }
    },
    {
      if: async (state: any) => state.a === 1,
      then: async (state: any) => {
        state.e = 5;
        return state;
      }
    }
  ])
  .parallel([
    async (state: any) => {
      state.f = 6;
      return state;
    },
    async (state: any) => {
      state.g = 7;
      return state;
    }
  ])
  .assign({ "block.items": [{ id: 1 }, { id: 2 }, { id: 3 }] })
  .loop({
    key: "block.items",
    execute: [
      async (element: any, state: any, index: number) => {
        element.title = `title ${index}`;
      },
      async (element: any, state: any, index: number) => {
        element.description = `description ${index}`;
      }
    ]
  })
  //.pick("j")
  .on("check", (msg: string) => console.log(msg));

const res = await main.run();
console.log(JSON.stringify(res, null, 2));

// const stream = main.stream();

// for await (const state of stream) {
//   console.log(state);
// }

export {};
