import EventEmitter, { on } from "node:events";
import { v4 as uuidv4 } from "uuid";
import { mapper } from "hwp";
import merge from "lodash.merge";
import get from "lodash.get";
import set from "lodash.set";
import { metrics, trace, SpanStatusCode } from "@opentelemetry/api";
import { isFunc } from "./utils.js";
import { StepType } from "./types.js";
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
    constructor(state, params = {}) {
        this.name = params.name;
        this.state = state;
        this.emitter = params.emitter ?? new EventEmitter();
        this.maxIterations = params.maxIterations ?? 25;
        this.nodes = params.nodes ?? new Map();
        this.steps = params.steps ?? [];
        this.subEvents = params.subEvents ?? [];
        this.context = params.context ?? this;
        this.subEvents.forEach((event) => this.emitter.on(event.name, event.listener));
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
    setStep(step) {
        const length = this.steps.push(step);
        if (step.options?.name)
            this.nodes.set(step.options?.name, length - 1);
    }
    milestone(name) {
        this.setStep({ type: StepType.MILESTONE, options: { name } });
        return this;
    }
    pipe(fnc, options) {
        this.setStep({
            step: fnc,
            type: StepType.PIPE,
            options
        });
        return this;
    }
    assign(key, fnc, options) {
        this.setStep({
            step: key,
            type: StepType.ASSIGN,
            fnc: fnc,
            options
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
            step: rootes,
            type: StepType.GOTO,
            options
        });
        return this;
    }
    async _exec(fnc) {
        const stato = structuredClone(this.state);
        return fnc instanceof Runnable
            ? await fnc.run(stato, {
                emitter: this.emitter,
                context: this.context
            })
            : await this.tracer.startActiveSpan(`${this.name}:func:exec`, async (span) => {
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
                    span.recordException(ex);
                    span.setStatus({ code: SpanStatusCode.ERROR });
                    throw ex;
                }
                finally {
                    span.end();
                }
            });
    }
    async _pipe(fnc) {
        this.state = { ...this.state, ...(await this._exec(fnc)) };
        return this;
    }
    _pick(keys) {
        if (!Array.isArray(keys))
            keys = [keys];
        const obj = {};
        keys.forEach((key) => {
            obj[key] = get(this.state, key);
        });
        this.state = obj;
        return this;
    }
    async _passThrough(fnc) {
        await fnc(structuredClone(this.state), this.emitter);
        return this;
    }
    async _assign(key, fnc) {
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
                if (isFunc(objFnc))
                    execs.push(this._exec(objFnc));
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
            if (await this._exec(caso.if)) {
                execs.push(this._exec(caso.then));
                if (!options.processAll)
                    break;
            }
        }
        const update = (await Promise.all(execs)).reduce((acc, val) => {
            if (val)
                return merge(acc, val);
            return acc;
        }, {});
        this.state = { ...this.state, ...update };
        return this;
    }
    async _parallel(fncs, options) {
        const execs = fncs.map((fnc) => this._exec(fnc));
        const results = await Promise.all(execs);
        const update = results.reduce((acc, val) => {
            if (val)
                return merge(acc, val);
            return acc;
        }, {});
        this.state = { ...this.state, ...update };
        return this;
    }
    async _loop(chain, key) {
        const innerLoop = Object.keys(this.state).every((k) => ["element", "index"].includes(k));
        if (innerLoop && !key.startsWith("element."))
            key = `element.${key}`;
        const _loop = get(this.state, key);
        if (!Array.isArray(_loop))
            throw new Error("Loop key must be an array");
        for (let i = 0, length = _loop.length; i < length; i++) {
            const element = _loop[i];
            const runnable = new Runnable({ element, index: i }, {
                emitter: this.emitter,
                context: this.context,
                name: `${this.name}:loop:${key}:${i}`
            });
            const result = await chain(runnable).run();
            _loop[i] = { ...element, ...result.element };
        }
        return this;
    }
    async _go(rootes) {
        const roots = Array.isArray(rootes) ? rootes : [rootes];
        for (const root of roots) {
            const { to, if: condition } = root;
            if (!this.nodes.has(to))
                throw new Error(`GoTo: Node ${to} not found`);
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
            const { step, type, fnc, key, options } = iteration.value;
            await this.tracer.startActiveSpan(`${this.name}:${type}${options?.name ? `:${options?.name}` : ""}`, async (span) => {
                span.setAttributes({
                    "runable.origin": this.name,
                    "rubbable.type": type,
                    "runnable.name": options?.name,
                    "runnable.tags": options?.tags
                });
                try {
                    switch (type) {
                        case StepType.START:
                        case StepType.MILESTONE:
                        case StepType.END:
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
                    if (span.isRecording()) {
                        span.addEvent(JSON.stringify(this.state));
                    }
                    this.emitStep(type, options);
                    await this.iterate(this.iterator.next());
                }
                catch (ex) {
                    span.recordException(ex);
                    span.setStatus({ code: SpanStatusCode.ERROR });
                    throw ex;
                }
                finally {
                    span.end();
                }
            });
        }
    }
    clone(state = {}, params = {}) {
        const stato = structuredClone({ ...this.state, ...state });
        const options = {
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
    async run(state, params = {}) {
        const startTime = new Date().getTime();
        const rnb = this.clone(state, params);
        return rnb.getTracer().startActiveSpan(this.name, async (span) => {
            try {
                await rnb.iterate();
                return rnb.getState();
            }
            catch (ex) {
                span.recordException(ex);
                span.setStatus({ code: SpanStatusCode.ERROR });
                throw ex;
            }
            finally {
                const endTime = new Date().getTime();
                const executionTime = endTime - startTime;
                this.runDuration.record(executionTime);
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
            if (isFunc(step))
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
