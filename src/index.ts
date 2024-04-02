import EventEmitter, { on } from "node:events";
import { Transform } from "node:stream";
import { v4 as uuidv4 } from "uuid";
import { mapper } from "hwp";
import merge from "lodash.merge";
import get from "lodash.get";
import set from "lodash.set";
import { isFunc, sleep } from "./utils.js";
import {
  StepType,
  SwitchCase,
  StepOptions,
  Roote,
  Step,
  StepEvent,
  Iteration,
  IteratorFunction,
  RunFncInterface,
  EventType,
  RunnableParams
} from "./types.js";

export default class Runnable {
  name?: string;
  state: object;
  emitter: EventEmitter;
  steps: Step[] = [];
  iterator: IteratorFunction | undefined;
  maxIterations: number;
  private nextStep: number = 0;
  private nodes: Map<string, number>;
  private iteractionCount: number = 0;
  private subEvents: EventType[];

  private constructor(state: object, params: RunnableParams = {}) {
    this.name = params.name;
    this.state = state;
    this.emitter = params.emitter ?? new EventEmitter();
    this.maxIterations = params.maxIterations ?? 25;
    this.nodes = params.nodes ?? new Map();
    this.steps = params.steps ?? [];
    this.subEvents = params.subEvents ?? [];

    this.subEvents.forEach((event: EventType) =>
      this.emitter.on(event.name, event.listener)
    );

    this.iterator = this.stepsIterator();
    return this;
  }

  getState(): object {
    return this.state;
  }

  getEmitter(): EventEmitter {
    return this.emitter;
  }

  on(event: string | symbol, fnc: Function): Runnable {
    this.subEvents.push({ name: event, listener: fnc });
    return this;
  }

  emit(event: string | symbol, ...args: any[]): boolean {
    return this.emitter.emit(event, ...args);
  }

  private setStep(step: Step) {
    const length = this.steps.push(step);
    if (step.name) this.nodes.set(step.name, length - 1);
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

  private async _exec(fnc: Function | Runnable): Promise<object> {
    const stato = structuredClone(this.state);
    return fnc instanceof Runnable
      ? await fnc.run(stato, { emitter: this.emitter })
      : await fnc(stato, { emit: this.emitter.emit.bind(this.emitter) });
  }

  private async _pipe(fnc: Function | Runnable): Promise<Runnable> {
    this.state = { ...this.state, ...(await this._exec(fnc)) };

    return this;
  }

  private _pick(keys: string | string[]): Runnable {
    if (!Array.isArray(keys)) keys = [keys];
    const obj = {};
    keys.forEach((key) => {
      obj[key] = get(this.state, key);
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
      set(this.state, key, await this._exec(fnc));
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
        set(this.state, keys[i], values[i]);
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

    const _loop = get(this.state, key);
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
        this.nextStep = this.nodes.get(to);
        this.iteractionCount += 1;
        break;
      }
    }

    return this;
  }

  stepsIterator(): IteratorFunction {
    return {
      next: (): Iteration => {
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

  async iterate(iteration?: Iteration) {
    if (!iteration) iteration = this.iterator.next();

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

  private clone(state: object = {}, params: RunnableParams = {}): Runnable {
    const stato = structuredClone({ ...this.state, ...state });
    const options: RunnableParams = {
      name: params.name ?? this.name,
      emitter: params.emitter ?? new EventEmitter(),
      maxIterations: this.maxIterations,
      nodes: params.nodes ?? this.nodes,
      steps: params.steps ?? this.steps,
      subEvents: params.subEvents ?? this.subEvents
    };

    const runnable = new Runnable(stato, options);

    return runnable;
  }

  async run(state?: object, params: RunnableParams = {}) {
    const rnb = this.clone(state, params);
    await rnb.iterate();

    return rnb.getState();
  }

  stream(params: RunnableParams = {}): Transform {
    return mapper(
      (state?: object) => this.run(state, params),
      params.highWaterMark ?? 16
    );
  }

  async *streamLog(
    state?: object,
    params: RunnableParams = {}
  ): AsyncGenerator<StepEvent> {
    const rnb = this.clone(state, params);
    const emitter = rnb.getEmitter();
    rnb.iterate();

    for await (const [iteration] of on(emitter, "step")) {
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

  static init(params: RunnableParams = {}) {
    const runnable = new Runnable({}, params);
    runnable.setStep({ type: StepType.INIT });
    return runnable;
  }
}
