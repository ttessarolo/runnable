import EventEmitter, { on } from "node:events";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { mapper } from "hwp";
import merge from "lodash.merge";
import get from "lodash.get";
import set from "lodash.set";
import { metrics, trace, SpanStatusCode } from "@opentelemetry/api";
import { ConsecutiveBreaker, SamplingBreaker, ExponentialBackoff, TimeoutStrategy, circuitBreaker, retry, timeout, bulkhead, fallback, handleAll, wrap } from "cockatiel";
//https://github.com/App-vNext/Polly/wiki/PolicyWrap
// Others
// https://github.com/genesys/mollitia
// https://github.com/Diplomatiq/resily
import { isExecutable, isFunc } from "./utils.js";
import Cache from "./cache.js";
import { StepType, IteratorError } from "./types.js";
export default class Runnable {
    name;
    state;
    emitter;
    steps = [];
    iterator;
    maxIterations;
    nextStep = 0;
    nodes;
    iteractionCount = 0;
    subEvents;
    context;
    tracer;
    meter;
    runDuration;
    runId;
    aborted = false;
    wrappedFncs = 0;
    circuit;
    constructor(state, params = {}) {
        this.name = params.name;
        this.state = state;
        this.emitter = params.emitter ?? new EventEmitter();
        this.maxIterations = params.maxIterations ?? 25;
        this.nodes = params.nodes ?? new Map();
        this.steps = params.steps ?? [];
        this.subEvents = params.subEvents ?? [];
        this.context = params.context ?? this;
        this.runId = params.runId ?? uuidv4();
        this.subEvents.forEach((event) => this.emitter.on(event.name, event.listener));
        this.circuit = params.circuit;
        this.iterator = this.stepsIterator();
        this.tracer = trace.getTracer("runnable:tracer");
        this.meter = metrics.getMeter("runnable:meter");
        this.runDuration = this.meter.createHistogram("runnable.run.duration");
        return this;
    }
    getState() {
        return this.state;
    }
    getEmitter() {
        return this.emitter;
    }
    getTracer() {
        return this.tracer;
    }
    getMeter() {
        return this.meter;
    }
    getWrappedCount() {
        return this.wrappedFncs;
    }
    checkEnd() {
        if (this.steps.at(-1)?.type !== StepType.END) {
            this.setStep({ type: StepType.END });
        }
    }
    on(event, fnc) {
        this.subEvents.push({ name: event, listener: fnc });
        return this;
    }
    emit(event, ...args) {
        return this.emitter.emit(event, ...args);
    }
    wrapFnc(fnc, options) {
        if (!options)
            return fnc;
        const _this = this;
        const policies = [];
        const cache = new Cache({ prefix: this.name, name: fnc.name }, this.state, options, this.emitter);
        if (options?.fallback) {
            policies.push(fallback(handleAll, async () => _this._exec(options.fallback)));
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
            }
            else {
                maxAttempts = options.retry.maxAttempts;
                maxDelay = options.retry.maxDelay;
                initialDelay = options.retry.initialDelay;
            }
            const riprova = retry(handleAll, {
                maxAttempts,
                backoff: new ExponentialBackoff({ initialDelay, maxDelay })
            });
            // TODO: Close Listeners
            const listener = riprova.onFailure(({ reason }) => {
                // Step Back if the error is in the iterator
                if (reason.error instanceof IteratorError) {
                    this.nextStep = this.nextStep - 1;
                }
            });
            policies.push(riprova);
            policies.push(circuitBreaker(handleAll, {
                halfOpenAfter: options.circuitBreaker?.halfOpenAfter ?? 10 * 1000,
                breaker: options.circuitBreaker?.consecutiveFaillures
                    ? new ConsecutiveBreaker(options.circuitBreaker?.consecutiveFaillures)
                    : new SamplingBreaker({
                        threshold: options.circuitBreaker?.threshold ?? 0.2,
                        duration: options.circuitBreaker?.duration ?? 15 * 1000
                    })
            }));
        }
        if (options?.bulkhead)
            policies.push(bulkhead(options.bulkhead));
        if (policies.length > 0) {
            return async function () {
                const R = (await cache.get()) ??
                    (await wrap(...policies).execute(() => {
                        return options?.avoidExec
                            ? fnc.call(_this, ...arguments)
                            : _this._exec(fnc);
                    }));
                await cache.set(R);
                return R;
            };
        }
        else
            return async function () {
                const R = (await cache.get()) ?? (await fnc.call(_this, ...arguments));
                await cache.set(R);
                return R;
            };
    }
    wrapStepFncs(step) {
        // Skip wrapping loop chain functions
        if ([
            StepType.START,
            StepType.END,
            StepType.MILESTONE,
            StepType.LOOP
        ].includes(step.type))
            return;
        if (step.type === StepType.ASSIGN) {
            Object.entries(step.step).forEach(([key, fnc]) => {
                if (isFunc(fnc)) {
                    step.step[key] = this.wrapFnc(fnc, step.options?.circuit);
                    this.wrappedFncs += 1;
                }
            });
        }
        else if (step.type === StepType.PARALLEL) {
            for (const fnc of step.step) {
                if (isFunc(fnc)) {
                    const index = step.step.indexOf(fnc);
                    step.step[index] = this.wrapFnc(fnc, step.options?.circuit);
                    this.wrappedFncs += 1;
                }
            }
        }
        else if ([StepType.BRANCH, StepType.GOTO].includes(step.type)) {
            for (const roads of step.step) {
                if (isFunc(roads.then)) {
                    roads.then = this.wrapFnc(roads.then, step.options?.circuit);
                    this.wrappedFncs += 1;
                }
                if (isFunc(roads.if)) {
                    roads.if = this.wrapFnc(roads.if, step.options?.circuit);
                    this.wrappedFncs += 1;
                }
            }
        }
        else {
            for (const key of ["step", "fnc"]) {
                if (isFunc(step[key])) {
                    const fnc = step[key];
                    step[key] = this.wrapFnc(fnc, step.options?.circuit);
                    this.wrappedFncs += 1;
                }
            }
        }
    }
    setStep(step) {
        this.wrapStepFncs(step);
        const length = this.steps.push(step);
        if (step.options?.name)
            this.nodes.set(step.options?.name, length - 1);
    }
    milestone(name) {
        this.setStep({ type: StepType.MILESTONE, options: { name } });
        return this;
    }
    /**
     * Adds a step to the runnable pipeline using the provided function or runnable.
     * @param fnc - The function or runnable to be added as a step.
     * @param options: - Optional options for the step.
     * @returns The updated Runnable instance.
     */
    pipe(fnc, options) {
        this.setStep({
            step: fnc,
            type: StepType.PIPE,
            options
        });
        return this;
    }
    push(fnc, options) {
        this.setStep({
            step: fnc,
            type: StepType.PUSH,
            options
        });
        return this;
    }
    assign(key, fnc, options) {
        this.setStep({
            step: key,
            type: StepType.ASSIGN,
            fnc: typeof fnc === "function" ? fnc : undefined,
            options: typeof fnc === "object" ? fnc : options
        });
        return this;
    }
    passThrough(fnc, options) {
        this.setStep({
            step: fnc,
            type: StepType.PASSTHROUGH,
            options
        });
        return this;
    }
    pick(keys, options) {
        this.setStep({
            step: keys,
            type: StepType.PICK,
            options
        });
        return this;
    }
    branch(fnc, options) {
        this.setStep({
            step: fnc,
            type: StepType.BRANCH,
            options
        });
        return this;
    }
    branchAll(fnc, options) {
        this.setStep({
            step: fnc,
            type: StepType.BRANCH,
            options: { ...options, processAll: true }
        });
        return this;
    }
    parallel(fncs, options) {
        this.setStep({
            step: fncs,
            type: StepType.PARALLEL,
            options
        });
        return this;
    }
    loop(params, options) {
        this.setStep({
            step: params.chain,
            type: StepType.LOOP,
            key: params.key,
            options
        });
        return this;
    }
    go(rootes, options) {
        this.setStep({
            step: Array.isArray(rootes) ? rootes : [rootes],
            type: StepType.GOTO,
            options
        });
        return this;
    }
    getNow() {
        return parseInt(performance.now().toString().replace(".", ""));
    }
    setSpanAttr(span) {
        span.setAttributes({
            "runnable.runId": this.runId,
            "runnable.ts": this.getNow(),
            "runnable.step": this.nextStep,
            "runable.origin": this.name
        });
    }
    async _exec(fnc, options = {}) {
        let stato = {};
        if (options.schema) {
            stato = options.schema.parse(this.state);
        }
        else
            stato = structuredClone(this.state);
        return fnc instanceof Runnable
            ? await fnc.run(stato, {
                emitter: this.emitter,
                context: this.context,
                runId: this.runId
            })
            : await this.tracer.startActiveSpan(`${this.name}:func:exec${fnc.name ? `:${fnc.name.replace("bound ", "")}` : ""}`, async (span) => {
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
                }
                catch (ex) {
                    if (ex instanceof Error) {
                        span.recordException(ex);
                    }
                    span.setStatus({ code: SpanStatusCode.ERROR });
                    throw ex;
                }
                finally {
                    span.end();
                }
            });
    }
    async _pipe(fnc, options = {}) {
        this.state = await this._exec(fnc, options);
        return this;
    }
    async _push(fnc, options = {}) {
        const result = await this._exec(fnc, options);
        this.state = options.schema ? result : merge(this.state, result);
        return this;
    }
    _pick(keys) {
        if (keys instanceof z.ZodType) {
            this.state = keys.parse(this.state);
            return this;
        }
        if (!Array.isArray(keys))
            keys = [keys];
        const obj = {};
        keys.forEach((key) => {
            obj[key] = get(this.state, key);
        });
        this.state = obj;
        return this;
    }
    async _passThrough(fnc, options = {}) {
        await fnc(structuredClone(this.state), this.emitter);
        return this;
    }
    async _assign(key, fnc, options = {}) {
        if (typeof key === "string" && !fnc) {
            throw new Error("Function is required");
        }
        if (typeof key === "string" && fnc) {
            set(this.state, key, await this._exec(fnc));
        }
        else {
            const execs = [];
            const keys = [];
            for (const [k, objFnc] of Object.entries(key)) {
                keys.push(k);
                if (isExecutable(objFnc))
                    execs.push(this._exec(objFnc, options));
                else
                    execs.push(Promise.resolve(objFnc));
            }
            const values = await Promise.all(execs);
            for (let i = 0, length = keys.length; i < length; i++) {
                set(this.state, keys[i], values[i]);
            }
        }
        return this;
    }
    async _branch(cases, options = {}) {
        const execs = [];
        for (const caso of cases) {
            if (await this._exec(caso.if, options)) {
                execs.push(this._exec(caso.then, options));
                if (!options.processAll)
                    break;
            }
        }
        const update = (await Promise.all(execs)).reduce((acc, val) => {
            if (val)
                return merge(acc, val);
            return acc;
        }, {});
        this.state = options.mode !== "pipe" ? merge(this.state, update) : update;
        return this;
    }
    async _parallel(fncs, options = {}) {
        const execs = fncs.map((fnc) => this._exec(fnc, options));
        const results = await Promise.all(execs);
        const update = results.reduce((acc, val) => {
            if (val)
                return merge(acc, val);
            return acc;
        }, {});
        this.state = options.mode !== "pipe" ? merge(this.state, update) : update;
        return this;
    }
    async _loop(chain, key, options = {}) {
        const innerLoop = Object.keys(this.state).every((k) => ["element", "index"].includes(k));
        if (innerLoop && !key.startsWith("element."))
            key = `element.${key}`;
        const _loop = get(this.state, key);
        if (!Array.isArray(_loop))
            throw new Error("Loop key must be an array");
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
    async _go(rootes, options = {}) {
        for (const root of rootes) {
            const { to, if: condition } = root;
            if (!this.nodes.has(to))
                throw new Error(`GoTo: Node ${to} not found`);
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
    stepsIterator() {
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
    emitStep(type, options) {
        const event = {
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
    async iterate(iteration) {
        if (!iteration)
            iteration = this.iterator.next();
        if (!iteration.done) {
            const { step, type, fnc, key, options } = iteration.value ?? {};
            await this.tracer.startActiveSpan(`${this.name}:${type}${options?.name ? `:${options?.name}` : ""}`, async (span) => {
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
                            if (!key)
                                throw new Error("Loop key is required");
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
                    await this.iterate(this.iterator.next());
                }
                catch (ex) {
                    if (ex instanceof Error) {
                        span.recordException(ex);
                    }
                    span.setStatus({ code: SpanStatusCode.ERROR });
                    throw new IteratorError(ex instanceof Error ? ex.message : "Iterator Error");
                }
                finally {
                    span.end();
                }
            });
        }
        return this.state;
    }
    clone(state = {}, params = {}) {
        const stato = structuredClone(merge(this.state, state));
        const options = {
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
    static isRunnable() {
        return true;
    }
    async invoke(state, params = {}) {
        return this.run(state, params);
    }
    async run(state, params = {}) {
        const startTime = new Date().getTime();
        const rnb = this.clone(state, params);
        return rnb
            .getTracer()
            .startActiveSpan(this.name ?? "runnable", async (span) => {
            rnb.setSpanAttr(span);
            try {
                const wrappedIterate = await rnb.wrapFnc(rnb.iterate, //.bind(rnb),
                { ...(params.circuit ?? rnb.circuit), avoidExec: true });
                const fallback = await wrappedIterate();
                return fallback ?? rnb.getState();
            }
            catch (ex) {
                if (ex instanceof Error) {
                    span.recordException(ex);
                }
                span.setStatus({ code: SpanStatusCode.ERROR });
                throw ex;
            }
            finally {
                const endTime = new Date().getTime();
                const executionTime = endTime - startTime;
                rnb.runDuration.record(executionTime);
                span.end();
            }
        });
    }
    stream(params = {}) {
        return mapper((state) => this.run(state, params), params.highWaterMark ?? 16);
    }
    async *streamLog(state, params = {}) {
        const rnb = this.clone(state, params);
        const emitter = rnb.getEmitter();
        rnb.iterate();
        for await (const [iteration] of on(emitter, "step")) {
            yield iteration;
        }
    }
    static from(steps, params = {}) {
        const r = new Runnable({}, params);
        for (const step of steps) {
            if (isExecutable(step))
                r.pipe(step);
            if (typeof step === "object")
                r.assign(step);
        }
        return r;
    }
    static init(params = {}) {
        const runnable = new Runnable({}, params);
        runnable.setStep({ type: StepType.START });
        return runnable;
    }
}
