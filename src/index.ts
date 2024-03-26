import EventEmitter, { on } from "node:events";
import { v4 as uuidv4 } from "uuid";
import merge from "lodash.merge";

const isFunc = (obj: any) =>
  typeof obj === "function" || obj instanceof Runnable;

enum StepType {
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

type SwitchCase = {
  if: Function;
  then: Function | Runnable;
};

type StepOptions = {
  name?: string;
  processAll?: boolean;
};

type Roote = { to: string; if?: Function };
type Step = {
  name?: string;
  step?: any;
  type: StepType;
  fnc?: Function;
  key?: string;
  options?: object;
};

type StepEvent = {
  id: string;
  name?: string;
  type: string;
  origin: string;
  state: object;
};

type IteratorFunction = {
  next: () => { value: Step; done: boolean } | { value: null; done: true };
};

type RunnableParams = {
  name?: string;
  emitter?: EventEmitter;
  maxIterations?: number;
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
  maxIterations: number;
  private nextStep: number = 0;
  private nodes: Set<string> = new Set();
  private iteractionCount: number = 0;

  constructor(state: object, params: RunnableParams = {}) {
    this.name = params.name;
    this.state = state;
    this.emitter = params.emitter ?? new EventEmitter();
    this.maxIterations = params.maxIterations ?? 25;

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
    if (step.name) this.nodes.add(step.name);
  }

  milestone(name: string): Runnable {
    this.setStep({ type: StepType.MILESTONE, name });
    return this;
  }
  pipe(fnc: Function | Runnable, options?: StepOptions): Runnable {
    this.setStep({ step: fnc, type: StepType.PIPE, name: options?.name });
    return this;
  }

  assign(
    key: string | object,
    fnc?: Function,
    options?: StepOptions
  ): Runnable {
    this.setStep({
      step: key,
      type: StepType.ASSIGN,
      fnc: fnc,
      name: options?.name
    });
    return this;
  }

  passThrough(fnc: Function, options?: StepOptions): Runnable {
    this.setStep({
      step: fnc,
      type: StepType.PASSTHROUGH,
      name: options?.name
    });
    return this;
  }

  pick(keys: string | string[], options?: StepOptions): Runnable {
    this.setStep({ step: keys, type: StepType.PICK, name: options?.name });
    return this;
  }

  branch(fnc: SwitchCase[], options?: StepOptions): Runnable {
    this.setStep({ step: fnc, type: StepType.BRANCH, name: options?.name });
    return this;
  }

  branchAll(fnc: SwitchCase[], options?: StepOptions): Runnable {
    this.setStep({
      step: fnc,
      type: StepType.BRANCH,
      options: { processAll: true },
      name: options?.name
    });
    return this;
  }

  parallel(fncs: (Function | Runnable)[], options?: StepOptions): Runnable {
    this.setStep({ step: fncs, type: StepType.PARALLEL, name: options?.name });
    return this;
  }

  loop(
    params: { key: string; chain: Function },
    options?: StepOptions
  ): Runnable {
    this.setStep({
      step: params.chain,
      type: StepType.LOOP,
      key: params.key,
      name: options?.name
    });
    return this;
  }

  go(rootes: Roote[] | Roote, options?: StepOptions): Runnable {
    this.setStep({
      step: rootes,
      type: StepType.GOTO,
      name: options?.name
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

  private async _branch(
    cases: SwitchCase[],
    options: StepOptions = {}
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
        if (val) return merge(acc, val);
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
      if (val) return merge(acc, val);
      return acc;
    }, {});
    this.state = { ...this.state, ...update };

    return this;
  }

  private async _loop(chain: Function, key: string): Promise<Runnable> {
    const innerLoop = Object.keys(this.state).every((k) =>
      ["element", "index"].includes(k)
    );
    if (innerLoop && !key.startsWith("element.")) key = `element.${key}`;

    const _loop = getDeep(this.state, key);
    if (!Array.isArray(_loop)) throw new Error("Loop key must be an array");
    for (let i = 0, length = _loop.length; i < length; i++) {
      const element = _loop[i];
      const runnable = new Runnable(
        { element, index: i },
        { emitter: this.emitter, name: `${this.name}:loop:${key}:${i}` }
      );
      const result = await chain(runnable).run();
      _loop[i] = { ...element, ...result.element };
    }
    return this;
  }

  private async _go(rootes: Roote[] | Roote): Promise<Runnable> {
    const roots = Array.isArray(rootes) ? rootes : [rootes];
    for (const root of roots) {
      const { to, if: condition } = root;

      if (!this.nodes.has(to)) throw new Error(`GoTo: Node ${to} not found`);
      if (this.iteractionCount >= this.maxIterations)
        throw new Error(`Max iterations reached`);

      const goto = condition ? await this._exec(condition) : true;

      if (goto) {
        const index = this.steps.findIndex((step) => step.name === to);
        this.nextStep = index;
        this.iteractionCount += 1;
        break;
      }
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

  private emitStep(type: string, name?: string): void {
    const event: StepEvent = {
      id: uuidv4(),
      name: name,
      type,
      origin: this.name,
      state: this.state
    };

    this.emit("step", event);
  }

  async iterate(iteration: any) {
    if (!iteration.done) {
      const { step, type, name, fnc, key, options } = iteration.value;
      switch (type) {
        case StepType.INIT:
        case StepType.MILESTONE:
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
        case StepType.BRANCH:
          await this._branch(step, options);
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
        case StepType.GOTO:
          await this._go(step);
          break;
        default:
          throw new Error("Invalid step type");
          break;
      }

      this.emitStep(type, name);

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

  async *stream(
    state?: object,
    params: RunnableParams = {}
  ): AsyncGenerator<StepEvent> {
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

const subSubSequence = Runnable.from(
  [
    { z: async () => "Z" },
    {
      y: async (state: any) => "Y"
    }
  ],
  { name: "sub:sub:seq" }
);

const main = Runnable.init({}, { name: "main:seq" })
  .assign({ b: async () => await 2 })
  .pipe(
    async (state: any) => {
      state.a = state.a + 1;
      return state;
    },
    { name: "increment-a" }
  )
  .passThrough((state: any, emitter: EventEmitter) => {
    if (state.a === 1) emitter.emit("check", "a is ok");
  })
  .pipe(async (state: any) => {
    state.c = 3;

    return state;
  })
  .milestone("STATE:UPDATED:ANALYZED")
  .pipe(subSequence)
  .branch([
    {
      if: async (state: any) => state.a === 1,
      then: subSubSequence
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
  .go([
    { to: "increment-a", if: async (state: any) => state.a < 4 },
    { to: "STATE:UPDATED:ANALYZED", if: async (state: any) => state.a > 9 }
  ])
  .assign({
    blocks: [
      { id: 1, items: [{ id: 1 }, { id: 2 }, { id: 3 }] },
      { id: 2, items: [{ id: 1 }, { id: 2 }, { id: 3 }] }
    ]
  })
  .loop({
    key: "blocks",
    chain: (chain: Runnable) =>
      chain.loop({
        key: "items",
        chain: (chain: Runnable) =>
          chain.parallel([
            async (state: any) => {
              state.element.title = "title";
              return state;
            },
            async (state: any) => {
              state.element.description = "description";
              return state;
            }
          ])
      })
  })
  .pick("j")
  .on("check", (msg: string) => console.log(msg));

// const res = await main.run({ a: 0 });
// console.log(JSON.stringify(res, null, 2));

const stream = main.stream({ a: 0 });

for await (const state of stream) {
  console.log(state.origin, state.type, state.name ?? "");
}

export {};
