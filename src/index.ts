/**
 * @module Runnable
 * @description Runnable is a library for building and running complex pipelines of functions and runnables.
 */
import EventEmitter, { on } from "node:events";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { mapper } from "hwp";
import merge from "lodash.merge";
import get from "lodash.get";
import set from "lodash.set";
import {
  Tracer,
  Meter,
  Histogram,
  metrics,
  trace,
  Span,
  SpanStatusCode
} from "@opentelemetry/api";
import {
  ConsecutiveBreaker,
  SamplingBreaker,
  ExponentialBackoff,
  TimeoutStrategy,
  circuitBreaker,
  retry,
  timeout,
  bulkhead,
  fallback,
  handleAll,
  wrap
} from "cockatiel";
//https://github.com/App-vNext/Polly/wiki/PolicyWrap
// Others
// https://github.com/genesys/mollitia
// https://github.com/Diplomatiq/resily
import { isExecutable, isFunc } from "./utils.js";
import Cache, { cacheFactory } from "./cache.js";
import {
  RunState,
  StepType,
  SwitchCase,
  StepOptions,
  Roote,
  Step,
  StepEvent,
  Iteration,
  IteratorFunction,
  StreamTransformer,
  CacheFactoryType,
  EventType,
  RunnableParams,
  WrapOptions,
  IteratorError
} from "./types.js";

/**
 * @class Runnable
 * @description Runnable class for building and running complex pipelines of functions and runnables.
 * @example const r = new Runnable({ a: 1 });
 * await r.run();
 * @example const r = new Runnable({ a: 1 }, { name: "myRunnable" });
 * await r.run();
 **/
export default class Runnable {
  private name?: string;
  private state: RunState;
  private emitter: EventEmitter;
  private steps: Step[] = [];
  private iterator: IteratorFunction | undefined;
  private maxIterations: number;
  private nextStep: number = 0;
  private nodes: Map<string, number>;
  private iteractionCount: number = 0;
  private subEvents: EventType[];
  private context: any;
  private tracer: Tracer;
  private meter: Meter;
  private runDuration: Histogram;
  private runId: string;
  private aborted: boolean = false;
  private wrappedFncs: number = 0;
  private circuit?: WrapOptions;

  private constructor(state: RunState, params: RunnableParams = {}) {
    this.name = params.name;
    this.state = state;
    this.emitter = params.emitter ?? new EventEmitter();
    this.maxIterations = params.maxIterations ?? 25;
    this.nodes = params.nodes ?? new Map();
    this.steps = params.steps ?? [];
    this.subEvents = params.subEvents ?? [];
    this.context = params.context;
    this.runId = params.runId ?? uuidv4();
    this.subEvents.forEach((event: EventType) =>
      this.emitter.on(event.name, event.listener)
    );
    this.circuit = params.circuit;

    this.iterator = this.stepsIterator();
    this.tracer = trace.getTracer("runnable:tracer");
    this.meter = metrics.getMeter("runnable:meter");
    this.runDuration = this.meter.createHistogram("runnable.run.duration");

    return this;
  }

  getState(): object {
    return this.state;
  }

  getEmitter(): EventEmitter {
    return this.emitter;
  }

  getTracer(): Tracer {
    return this.tracer;
  }

  getMeter(): Meter {
    return this.meter;
  }

  getWrappedCount(): number {
    return this.wrappedFncs;
  }

  private checkEnd(): void {
    if (this.steps.at(-1)?.type !== StepType.END) {
      this.setStep({ type: StepType.END, options: { name: "end" } });
    }
  }

  on(event: string | symbol, fnc: Function): Runnable {
    this.subEvents.push({ name: event, listener: fnc });
    return this;
  }

  emit(event: string | symbol, ...args: any[]): boolean {
    return this.emitter.emit(event, ...args);
  }

  private wrapFnc(fnc: Function, options?: WrapOptions): Function {
    if (!options) return fnc;
    const _this = this;
    const policies: any[] = [];
    const cache = new Cache(
      { prefix: this.name, stepName: options.name, name: fnc.name },
      options
    );

    if (options?.fallback) {
      policies.push(
        fallback(handleAll, async () => _this._exec(options.fallback!))
      );
    }
    if (options?.timeout) {
      policies.push(timeout(options.timeout, TimeoutStrategy.Cooperative));
    }
    if (options?.retry) {
      let maxAttempts;
      let maxDelay;
      let initialDelay;

      if (typeof options.retry === "number") {
        maxAttempts = options.retry;
      } else {
        maxAttempts = options.retry.maxAttempts;
        maxDelay = options.retry.maxDelay;
        initialDelay = options.retry.initialDelay;
      }
      const riprova = retry(handleAll, {
        maxAttempts,
        backoff: new ExponentialBackoff({ initialDelay, maxDelay })
      });

      // TODO: Close Listeners
      const listener = riprova.onFailure(({ reason }: any) => {
        // Step Back if the error is in the iterator
        if (reason.error instanceof IteratorError) {
          this.nextStep = this.nextStep - 1;
        }
      });
      policies.push(riprova);

      policies.push(
        circuitBreaker(handleAll, {
          halfOpenAfter: options.circuitBreaker?.halfOpenAfter ?? 10 * 1000,
          breaker: options.circuitBreaker?.consecutiveFaillures
            ? new ConsecutiveBreaker(
                options.circuitBreaker?.consecutiveFaillures
              )
            : new SamplingBreaker({
                threshold: options.circuitBreaker?.threshold ?? 0.2,
                duration: options.circuitBreaker?.duration ?? 15 * 1000
              })
        })
      );
    }
    if (options?.bulkhead) policies.push(bulkhead(options.bulkhead));

    if (policies.length > 0) {
      return async function (this: any) {
        const _that = this;
        const R =
          (await cache.get(_that.state, _that.emitter)) ??
          ((await wrap(...policies).execute(() => {
            return options?.avoidExec
              ? fnc.call(_this, ...arguments)
              : _this._exec(fnc);
          })) as object);
        await cache.set(R, _that.emitter);
        return R;
      };
    } else
      return async function (this: any) {
        const R =
          (await cache.get(this.state, this.emitter)) ??
          (await fnc.call(_this, ...arguments));
        await cache.set(R, this.emitter);
        return R;
      };
  }

  private wrapStepFncs(step: Step) {
    // Skip wrapping loop chain functions
    if (
      [
        StepType.START,
        StepType.END,
        StepType.MILESTONE,
        StepType.LOOP
      ].includes(step.type)
    )
      return;

    if (step.type === StepType.ASSIGN) {
      Object.entries(step.step).forEach(([key, fnc]) => {
        if (isFunc(fnc)) {
          (step.step as any)[key] = this.wrapFnc(fnc, {
            name: step.options?.name,
            ...step.options?.circuit
          });
          this.wrappedFncs += 1;
        }
      });
    } else if (step.type === StepType.PARALLEL) {
      for (const fnc of step.step) {
        if (isFunc(fnc)) {
          const index = step.step.indexOf(fnc);
          step.step[index] = this.wrapFnc(fnc, {
            name: step.options?.name,
            ...step.options?.circuit
          });
          this.wrappedFncs += 1;
        }
      }
    } else if ([StepType.BRANCH, StepType.GOTO].includes(step.type)) {
      for (const roads of step.step) {
        if (isFunc(roads.then)) {
          roads.then = this.wrapFnc(roads.then, {
            name: step.options?.name,
            ...step.options?.circuit
          });
          this.wrappedFncs += 1;
        }
        if (isFunc(roads.if)) {
          roads.if = this.wrapFnc(roads.if, {
            name: step.options?.name,
            ...step.options?.circuit
          });
          this.wrappedFncs += 1;
        }
      }
    } else {
      for (const key of ["step", "fnc"]) {
        if (isFunc((step as any)[key])) {
          const fnc = (step as any)[key];
          (step as any)[key] = this.wrapFnc(fnc, {
            name: step.options?.name,
            ...step.options?.circuit
          });
          this.wrappedFncs += 1;
        }
      }
    }
  }

  private setStep(step: Step) {
    this.wrapStepFncs(step);
    const length = this.steps.push(step);
    if (step.options?.name) this.nodes.set(step.options?.name, length - 1);
  }

  milestone(name: string): Runnable {
    this.setStep({ type: StepType.MILESTONE, options: { name } });
    return this;
  }
  /**
   * Adds a step to the runnable pipeline using the provided function or runnable.
   * @param fnc - The function or runnable to be added as a step.
   * @param options: - Optional options for the step.
   * @returns The updated Runnable instance.
   */
  pipe(fnc: Function | Runnable, options?: StepOptions): Runnable {
    this.setStep({
      step: fnc,
      type: StepType.PIPE,
      options
    });
    return this;
  }
  push(fnc: Function | Runnable, options?: StepOptions): Runnable {
    this.setStep({
      step: fnc,
      type: StepType.PUSH,
      options
    });
    return this;
  }

  assign(
    key: string | object,
    fnc?: Function | StepOptions,
    options?: StepOptions
  ): Runnable {
    this.setStep({
      step: key,
      type: StepType.ASSIGN,
      fnc: typeof fnc === "function" ? fnc : undefined,
      options: typeof fnc === "object" ? fnc : options
    });

    return this;
  }

  passThrough(fnc: Function, options?: StepOptions): Runnable {
    this.setStep({
      step: fnc,
      type: StepType.PASSTHROUGH,
      options
    });
    return this;
  }

  pick(keys: string | string[] | z.ZodType, options?: StepOptions): Runnable {
    this.setStep({
      step: keys,
      type: StepType.PICK,
      options
    });
    return this;
  }

  branch(fnc: SwitchCase[], options?: StepOptions): Runnable {
    this.setStep({
      step: fnc,
      type: StepType.BRANCH,
      options
    });
    return this;
  }

  branchAll(fnc: SwitchCase[], options?: StepOptions): Runnable {
    this.setStep({
      step: fnc,
      type: StepType.BRANCH,
      options: { ...options, processAll: true }
    });
    return this;
  }

  parallel(fncs: (Function | Runnable)[], options?: StepOptions): Runnable {
    this.setStep({
      step: fncs,
      type: StepType.PARALLEL,
      options
    });
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
      options
    });
    return this;
  }

  go(rootes: Roote[] | Roote, options?: StepOptions): Runnable {
    this.setStep({
      step: Array.isArray(rootes) ? rootes : [rootes],
      type: StepType.GOTO,
      options
    });
    return this;
  }

  private getNow(): number {
    return parseInt(performance.now().toString().replace(".", ""));
  }

  private setSpanAttr(span: Span) {
    span.setAttributes({
      "runnable.runId": this.runId,
      "runnable.ts": this.getNow(),
      "runnable.step": this.nextStep,
      "runable.origin": this.name
    });
  }

  private async _exec(
    fnc: Function | Runnable,
    options: StepOptions = {}
  ): Promise<RunState> {
    if (isFunc(fnc)) fnc = fnc.bind(this);
    let stato: RunState = {};

    if (options.schema) {
      stato = options.schema.parse(this.state);
    } else stato = structuredClone(this.state);

    return fnc instanceof Runnable
      ? await fnc.run(stato, {
          emitter: this.emitter,
          context: this.context,
          runId: this.runId
        })
      : await this.tracer.startActiveSpan(
          `${this.name}:func:exec${
            fnc.name ? `:${fnc.name.replace("bound ", "")}` : ""
          }`,
          async (span: Span) => {
            this.setSpanAttr(span);
            try {
              if (span.isRecording()) {
                span.addEvent(JSON.stringify(stato));
              }
              const response = await fnc.call(this, stato, {
                emit: this.emitter.emit.bind(this.emitter),
                _this: this.context
              });
              if (span.isRecording()) {
                if (span.isRecording()) {
                  span.addEvent(JSON.stringify(response));
                }
              }
              return response;
            } catch (ex) {
              if (ex instanceof Error) {
                span.recordException(ex);
              }
              span.setStatus({ code: SpanStatusCode.ERROR });
              throw ex;
            } finally {
              span.end();
            }
          }
        );
  }

  private async _pipe(
    fnc: Function | Runnable,
    options: StepOptions = {}
  ): Promise<Runnable> {
    this.state = await this._exec(fnc, options);

    return this;
  }

  private async _push(
    fnc: Function | Runnable,
    options: StepOptions = {}
  ): Promise<Runnable> {
    const result = await this._exec(fnc, options);
    this.state = options.schema ? result : merge(this.state, result);

    return this;
  }

  private _pick(keys: string | string[] | z.ZodType): Runnable {
    if (keys instanceof z.ZodType) {
      this.state = keys.parse(this.state);
      return this;
    }

    if (!Array.isArray(keys)) keys = [keys];
    const obj: { [key: string]: any } = {};
    keys.forEach((key) => {
      obj[key] = get(this.state, key);
    });
    this.state = obj;

    return this;
  }

  private async _passThrough(
    fnc: Function,
    options: StepOptions = {}
  ): Promise<Runnable> {
    await this._exec(fnc, options); //fnc(structuredClone(this.state), this.emitter);
    return this;
  }

  private async _assign(
    key: string | object,
    fnc?: Function,
    options: StepOptions = {}
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
        if (isExecutable(objFnc)) execs.push(this._exec(objFnc, options));
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
      if (await this._exec(caso.if, options)) {
        execs.push(this._exec(caso.then, options));
        if (!options.processAll) break;
      }
    }

    const update: RunState = (await Promise.all(execs)).reduce(
      (acc: RunState, val: object) => {
        if (val) return merge(acc, val);
        return acc;
      },
      {}
    );

    this.state = options.mode !== "pipe" ? merge(this.state, update) : update;

    return this;
  }

  private async _parallel(
    fncs: (Function | Runnable)[],
    options: StepOptions = {}
  ): Promise<Runnable> {
    const execs = fncs.map((fnc) => this._exec(fnc, options));
    const results = await Promise.all(execs);
    const update = results.reduce((acc: object, val: object) => {
      if (val) return merge(acc, val);
      return acc;
    }, {});
    this.state = options.mode !== "pipe" ? merge(this.state, update) : update;

    return this;
  }

  private async _loop(
    chain: Function,
    key: string,
    options: StepOptions = {}
  ): Promise<Runnable> {
    const innerLoop = Object.keys(this.state).every((k) =>
      ["element", "index"].includes(k)
    );
    if (innerLoop && !key.startsWith("element.")) key = `element.${key}`;

    const _loop = get(this.state, key);
    if (!Array.isArray(_loop)) throw new Error("Loop key must be an array");
    for (let i = 0, length = _loop.length; i < length; i++) {
      const element = _loop[i];
      const runnable = Runnable.init({
        emitter: this.emitter,
        context: this.context,
        runId: this.runId,
        name: `${this.name}:loop:${key}:${i}`
      });

      const result = await chain(runnable).run({ element, index: i });
      _loop[i] = { ...element, ...result.element };
    }
    return this;
  }

  private async _go(
    rootes: Roote[],
    options: StepOptions = {}
  ): Promise<Runnable> {
    for (const root of rootes) {
      const { to, if: condition } = root;

      if (!this.nodes.has(to)) throw new Error(`GoTo: Node ${to} not found`);
      if (this.iteractionCount >= this.maxIterations)
        throw new Error(`Max iterations reached`);

      const goto = condition ? await this._exec(condition, options) : true;

      if (goto) {
        this.nextStep = this.nodes.get(to) ?? 0;
        this.iteractionCount += 1;
        break;
      }
    }

    return this;
  }

  private stepsIterator(): IteratorFunction {
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

  private emitStep(type: string, options?: StepOptions): void {
    const event: StepEvent = {
      id: uuidv4(),
      runId: this.runId,
      ts: this.getNow(),
      step: this.nextStep,
      name: options?.name,
      type,
      tags: options?.tags,
      origin: this.name,
      state: this.state
    };

    this.emit("step", event);
  }

  private async iterate(iteration?: Iteration): Promise<RunState> {
    if (!iteration) iteration = this.iterator!.next();
    if (!iteration.done) {
      const { step, type, fnc, key, options } = iteration.value ?? {};

      await this.tracer.startActiveSpan(
        `${this.name}:${type}${options?.name ? `:${options?.name}` : ""}`,
        async (span: Span) => {
          this.setSpanAttr(span);
          span.setAttributes({
            "rubbable.type": type,
            "runnable.name": options?.name ?? step?.name,
            "runnable.tags": options?.tags
          });

          try {
            switch (type) {
              case StepType.START:
              case StepType.MILESTONE:
              case StepType.END:
                break;
              case StepType.PIPE:
                await this._pipe(step, options);
                break;
              case StepType.PUSH:
                await this._push(step, options);
                break;
              case StepType.ASSIGN:
                await this._assign(step, fnc, options);
                break;
              case StepType.PASSTHROUGH:
                await this._passThrough(step, options);
                break;
              case StepType.BRANCH:
                await this._branch(step, options);
                break;
              case StepType.PARALLEL:
                await this._parallel(step, options);
                break;
              case StepType.LOOP:
                if (!key) throw new Error("Loop key is required");
                await this._loop(step, key, options);
                break;
              case StepType.PICK:
                await this._pick(step);
                break;
              case StepType.GOTO:
                await this._go(step, options);
                break;
              default:
                throw new Error("Invalid step type");
                break;
            }

            if (span.isRecording()) {
              span.addEvent(JSON.stringify(this.state));
            }
            this.emitStep(type, options);

            await this.iterate(this.iterator!.next());
          } catch (ex) {
            if (ex instanceof Error) {
              span.recordException(ex);
            }
            span.setStatus({ code: SpanStatusCode.ERROR });
            throw new IteratorError(
              ex instanceof Error ? ex.message : "Iterator Error"
            );
          } finally {
            span.end();
          }
        }
      );
    }
    return this.state;
  }

  private clone(state: object = {}, params: RunnableParams = {}): Runnable {
    const stato = structuredClone(merge(this.state, state));
    const options: RunnableParams = {
      runId: params.runId,
      name: params.name ?? this.name,
      emitter: params.emitter ?? new EventEmitter(),
      maxIterations: this.maxIterations,
      nodes: params.nodes ?? this.nodes,
      steps: params.steps ?? this.steps,
      subEvents: params.subEvents ?? this.subEvents,
      context: this.context,
      circuit: params.circuit ?? this.circuit
    };

    const runnable = new Runnable(stato, options);
    runnable.checkEnd();

    return runnable;
  }

  static isRunnable(): boolean {
    return true;
  }

  async invoke(state?: RunState, params: RunnableParams = {}) {
    return this.run(state, params);
  }

  async run(state?: RunState, params: RunnableParams = {}) {
    const startTime = new Date().getTime();
    const rnb = this.clone(state, params);

    return rnb
      .getTracer()
      .startActiveSpan(this.name ?? "runnable", async (span: Span) => {
        rnb.setSpanAttr(span);
        try {
          const wrappedIterate = await rnb.wrapFnc(rnb.iterate, {
            ...(params.circuit ?? rnb.circuit),
            name: "start",
            avoidExec: true
          });
          const fallback = await wrappedIterate.call(rnb);
          return fallback ?? rnb.getState();
        } catch (ex) {
          if (ex instanceof Error) {
            span.recordException(ex);
          }
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw ex;
        } finally {
          const endTime = new Date().getTime();
          const executionTime = endTime - startTime;
          rnb.runDuration.record(executionTime);
          span.end();
        }
      });
  }

  stream(params: RunnableParams = {}): StreamTransformer {
    return mapper(
      (state?: RunState) => this.run(state, params),
      params.highWaterMark ?? 16
    );
  }

  async *streamLog(
    state?: RunState,
    params: RunnableParams = {}
  ): AsyncGenerator<StepEvent> {
    const rnb = this.clone(state, params);
    const emitter = rnb.getEmitter();
    rnb.iterate();

    for await (const [iteration] of on(emitter, "step")) {
      yield iteration;
    }
  }

  static getCacheFactory(): CacheFactoryType {
    return cacheFactory;
  }

  static from(steps: any[], params: RunnableParams = {}) {
    const r = new Runnable({}, params);
    for (const step of steps) {
      if (isExecutable(step)) r.pipe(step);
      if (typeof step === "object") r.assign(step);
    }
    return r;
  }

  static init(params: RunnableParams = {}) {
    const runnable = new Runnable({}, params);
    runnable.setStep({ type: StepType.START, options: { name: "start" } });
    return runnable;
  }
}
