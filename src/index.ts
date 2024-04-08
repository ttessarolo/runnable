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
  ExponentialBackoff,
  retry,
  handleAll,
  circuitBreaker,
  wrap
} from "cockatiel";
import { isFunc } from "./utils.js";
import {
  StepType,
  SwitchCase,
  StepOptions,
  Roote,
  Step,
  StepEvent,
  Iteration,
  IteratorFunction,
  StreamTransformer,
  EventType,
  RunnableParams
} from "./types.js";

export default class Runnable {
  private name?: string;
  private state: object;
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

  private constructor(state: object, params: RunnableParams = {}) {
    this.name = params.name;
    this.state = state;
    this.emitter = params.emitter ?? new EventEmitter();
    this.maxIterations = params.maxIterations ?? 25;
    this.nodes = params.nodes ?? new Map();
    this.steps = params.steps ?? [];
    this.subEvents = params.subEvents ?? [];
    this.context = params.context ?? this;
    this.runId = params.runId ?? uuidv4();
    this.subEvents.forEach((event: EventType) =>
      this.emitter.on(event.name, event.listener)
    );

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

  private checkEnd(): void {
    if (this.steps.at(-1)?.type !== StepType.END) {
      this.setStep({ type: StepType.END });
    }
  }

  on(event: string | symbol, fnc: Function): Runnable {
    this.subEvents.push({ name: event, listener: fnc });
    return this;
  }

  emit(event: string | symbol, ...args: any[]): boolean {
    return this.emitter.emit(event, ...args);
  }

  private wrapFnc(step: Step) {
    // Skip wrapping loop chain
    if (step.type === StepType.LOOP) return;

    for (const key of ["step", "fnc"]) {
      if ((step as any)[key] instanceof Function) {
        const retryPolicy = retry(handleAll, {
          maxAttempts: 3,
          backoff: new ExponentialBackoff()
        });
        const circuitBreakerPolicy = circuitBreaker(handleAll, {
          halfOpenAfter: 10 * 1000,
          breaker: new ConsecutiveBreaker(5)
        });
        const wrapper = wrap(...[retryPolicy, circuitBreakerPolicy]);
        const fnc = (step as any)[key];
        (step as any)[key] = async function (...args: unknown[]) {
          return await wrapper.execute(() => fnc.call(this, ...args));
        };
      }
    }
  }

  private setStep(step: Step) {
    this.wrapFnc(step);
    const length = this.steps.push(step);
    if (step.options?.name) this.nodes.set(step.options?.name, length - 1);
  }

  milestone(name: string): Runnable {
    this.setStep({ type: StepType.MILESTONE, options: { name } });
    return this;
  }
  pipe(fnc: Function | Runnable, options?: StepOptions): Runnable {
    this.setStep({
      step: fnc,
      type: StepType.PIPE,
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
      step: rootes,
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
  ): Promise<object> {
    let stato: object = {};

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
          `${this.name}:func:exec${fnc.name ? `:${fnc.name}` : ""}`,
          async (span: Span) => {
            this.setSpanAttr(span);
            try {
              if (span.isRecording()) {
                span.addEvent(JSON.stringify(stato));
              }
              const response = await fnc.call(this.context, stato, {
                emit: this.emitter.emit.bind(this.emitter)
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
    await fnc(structuredClone(this.state), this.emitter);
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
        if (isFunc(objFnc)) execs.push(this._exec(objFnc, options));
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

    const update = (await Promise.all(execs)).reduce(
      (acc: object, val: object) => {
        if (val) return merge(acc, val);
        return acc;
      },
      {}
    );

    this.state = merge(this.state, update);

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
    this.state = merge(this.state, update);

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
    rootes: Roote[] | Roote,
    options: StepOptions = {}
  ): Promise<Runnable> {
    const roots = Array.isArray(rootes) ? rootes : [rootes];
    for (const root of roots) {
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

  async iterate(iteration?: Iteration) {
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
            throw ex;
          } finally {
            span.end();
          }
        }
      );
    }
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
      context: this.context
    };

    const runnable = new Runnable(stato, options);
    runnable.checkEnd();

    return runnable;
  }

  async run(state?: object, params: RunnableParams = {}) {
    const startTime = new Date().getTime();
    const rnb = this.clone(state, params);

    return rnb
      .getTracer()
      .startActiveSpan(this.name ?? "runnable", async (span: Span) => {
        rnb.setSpanAttr(span);
        try {
          await rnb.iterate();
          return rnb.getState();
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
    runnable.setStep({ type: StepType.START });
    return runnable;
  }
}
