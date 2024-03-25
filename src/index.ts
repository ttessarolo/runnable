// import * as EventEmitter from "node:events";
// import { on } from "node:events";
import EventEmitter, { on } from "node:events";

const isFunc = (obj: any) =>
  typeof obj === "function" || obj instanceof Runnable;

type Step = {
  step: any;
  type: string;
  fnc?: Function;
};

type IteratorFunction = {
  next: () => { value: Step; done: boolean } | { value: null; done: true };
};

type RunnableParams = {
  emitter?: EventEmitter;
  emitEnd?: boolean;
};

class Runnable {
  name?: string;
  state: object;
  emitter: EventEmitter;
  steps: Step[] = [];
  iterator: IteratorFunction;
  emitEnd: boolean = true;

  constructor(state: object, name?: string, params: RunnableParams = {}) {
    this.name = name;
    this.state = state;
    this.emitter = params.emitter ?? new EventEmitter();
    this.emitEnd = params.emitEnd ?? true;

    return this;
  }

  on(event: string | symbol, fnc: any): Runnable {
    this.emitter.on(event, fnc);
    return this;
  }

  emit(event: string | symbol, ...args: any[]): boolean {
    return this.emitter.emit(event, ...args);
  }

  pipe(fnc: Function | Runnable): Runnable {
    this.steps.push({ step: fnc, type: "pipe" });
    return this;
  }

  assign(key: string | object, fnc?: Function): Runnable {
    this.steps.push({ step: key, type: "assign", fnc: fnc });
    return this;
  }

  passThrough(fnc: Function): Runnable {
    this.steps.push({ step: fnc, type: "passThrough" });
    return this;
  }

  pick(keys: string | string[]): Runnable {
    this.steps.push({ step: keys, type: "pick" });
    return this;
  }

  rooter(fnc: Function): Runnable {
    this.steps.push({ step: fnc, type: "rooter" });
    return this;
  }

  private async _exec(fnc: any) {
    const stato = structuredClone(this.state);
    return fnc instanceof Runnable
      ? await fnc.run(stato, { emitter: this.emitter, emitEnd: false })
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
      obj[key] = this.state[key];
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
      this.state[key] = await this._exec(fnc);
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
        this.state[keys[i]] = values[i];
      }
    }

    return this;
  }

  stepsIterator(): IteratorFunction {
    let nextIndex = 0;
    let end = this.steps.length;
    const step = 1;
    return {
      next: () => {
        const type = this.steps[nextIndex]?.type;
        this.emit("step", {
          id: nextIndex + 1,
          step: type ? "step" : "end",
          type,
          total: end,
          name: this.name,
          state: this.state
        });

        if (nextIndex < end) {
          const result = { value: this.steps[nextIndex], done: false };
          nextIndex += step;
          return result;
        }
        return { value: null, done: true };
      }
    };
  }

  async iterate(iteration: any) {
    if (!iteration.done) {
      const { step, type, fnc } = iteration.value;
      switch (type) {
        case "pipe":
          await this._pipe(step);
          break;
        case "assign":
          await this._assign(step, fnc);
          break;
        case "passThrough":
          await this._passThrough(step);
          break;
        case "pick":
          await this._pick(step);
          break;
      }
      this.emit("step", this.state);

      await this.iterate(this.iterator.next());
    }
  }

  private _warm(state?: object, params: RunnableParams = {}) {
    if (state) this.state = { ...this.state, ...state };
    if (params.emitter) this.emitter = params.emitter;
    if (params.emitEnd !== undefined) this.emitEnd = params.emitEnd;

    this.iterator = this.stepsIterator();
  }

  async run(state?: object, params: RunnableParams = {}) {
    this._warm(state, params);
    await this.iterate(this.iterator.next());

    return this.state;
  }

  async *stream(state?: object, params: RunnableParams = {}) {
    this._warm(state, params);
    this.iterate(this.iterator.next());

    for await (const [iteration] of on(this.emitter, "step")) {
      console.log("*", iteration);
      yield iteration;
      if (iteration.step === "end") break;
    }

    return this.state;
  }

  static from(steps: any[], name?: string) {
    const r = new Runnable({}, name);
    for (const step of steps) {
      if (isFunc(step)) r.pipe(step);
      if (typeof step === "object") r.assign(step);
    }
    return r;
  }

  static init(
    state: object = {},
    name?: string,
    params: { emitter?: EventEmitter } = {}
  ) {
    return new Runnable(state, name, params);
  }
}

const sub = Runnable.from(
  [
    { k: async () => "O", j: 1 },
    async (state: any) => {
      state.y = "ciao";
      return state;
    }
  ],
  "sub:seq"
);

const main = Runnable.init({ a: 1 }, "main:seq")
  .assign({ b: async () => await 2 })
  .passThrough((state: any, emitter: EventEmitter) => {
    if (state.a === 1) emitter.emit("check", "a is ok");
  })
  .pipe(async (state: any) => {
    state.c = 3;
    return state;
  })
  .pipe(sub)
  .pick("j");
// .on("passThrough", (state: any) => console.log("check", state))
// .on("step", (step: object) => console.log(step))
// .on("end", (state: object, name: string) => console.log("end", state, name));

//const res = await main.run();

const stream = main.stream();
for await (const { state } of stream) {
  console.log(state);
}

export {};
