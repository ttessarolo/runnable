import EventEmitter, { on } from "node:events";
import { v4 as uuidv4 } from "uuid";
import merge from "lodash.merge";
import get from "lodash.get";
import set from "lodash.set";
import { isFunc, sleep } from "./utils.js";
import { StepType } from "./types.js";
export default class Runnable {
    constructor(state, params = {}) {
        this.steps = [];
        this.nextStep = 0;
        this.nodes = new Set();
        this.iteractionCount = 0;
        this.name = params.name;
        this.state = state;
        this.emitter = params.emitter ?? new EventEmitter();
        this.maxIterations = params.maxIterations ?? 25;
        return this;
    }
    on(event, fnc) {
        this.emitter.on(event, fnc);
        return this;
    }
    emit(event, ...args) {
        return this.emitter.emit(event, ...args);
    }
    setStep(step) {
        this.steps.push(step);
        if (step.name)
            this.nodes.add(step.name);
    }
    milestone(name) {
        this.setStep({ type: StepType.MILESTONE, name });
        return this;
    }
    pipe(fnc, options) {
        this.setStep({ step: fnc, type: StepType.PIPE, name: options?.name });
        return this;
    }
    assign(key, fnc, options) {
        this.setStep({
            step: key,
            type: StepType.ASSIGN,
            fnc: fnc,
            name: options?.name
        });
        return this;
    }
    passThrough(fnc, options) {
        this.setStep({
            step: fnc,
            type: StepType.PASSTHROUGH,
            name: options?.name
        });
        return this;
    }
    pick(keys, options) {
        this.setStep({ step: keys, type: StepType.PICK, name: options?.name });
        return this;
    }
    branch(fnc, options) {
        this.setStep({ step: fnc, type: StepType.BRANCH, name: options?.name });
        return this;
    }
    branchAll(fnc, options) {
        this.setStep({
            step: fnc,
            type: StepType.BRANCH,
            options: { processAll: true },
            name: options?.name
        });
        return this;
    }
    parallel(fncs, options) {
        this.setStep({ step: fncs, type: StepType.PARALLEL, name: options?.name });
        return this;
    }
    loop(params, options) {
        this.setStep({
            step: params.chain,
            type: StepType.LOOP,
            key: params.key,
            name: options?.name
        });
        return this;
    }
    go(rootes, options) {
        this.setStep({
            step: rootes,
            type: StepType.GOTO,
            name: options?.name
        });
        return this;
    }
    async _exec(fnc) {
        const stato = structuredClone(this.state);
        return fnc instanceof Runnable
            ? await fnc.run(stato, { emitter: this.emitter })
            : await fnc(stato, this.emitter);
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
            const runnable = new Runnable({ element, index: i }, { emitter: this.emitter, name: `${this.name}:loop:${key}:${i}` });
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
                const index = this.steps.findIndex((step) => step.name === to);
                this.nextStep = index;
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
    emitStep(type, name) {
        const event = {
            id: uuidv4(),
            name: name,
            type,
            origin: this.name,
            state: this.state
        };
        this.emit("step", event);
    }
    async iterate(iteration) {
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
    _warm(state, params = {}) {
        if (state)
            this.state = { ...this.state, ...state };
        if (params.emitter)
            this.emitter = params.emitter;
        if (params.name)
            this.name = params.name;
        this.iterator = this.stepsIterator();
    }
    async run(state, params = {}) {
        this._warm(state, params);
        await this.iterate(this.iterator.next());
        return this.state;
    }
    async *stream(state, params = {}) {
        this._warm(state, params);
        this.iterate(this.iterator.next());
        for await (const [iteration] of on(this.emitter, "step")) {
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
    static init(state = {}, params = {}) {
        const runnable = new Runnable(state, params);
        runnable.setStep({ type: StepType.INIT });
        return runnable;
    }
}
const subSequence = Runnable.from([
    { k: async () => "O", j: 1 },
    async (state) => {
        state.y = "ciao";
        return state;
    }
], { name: "sub:seq" });
const subSubSequence = Runnable.from([
    { z: async () => "Z" },
    {
        y: async (state) => "Y"
    }
], { name: "sub:sub:seq" });
const main = Runnable.init({}, { name: "main:seq" })
    .assign({ b: async () => await 2 })
    .pipe(async (state) => {
    state.a = state.a + 1;
    return state;
}, { name: "increment-a" })
    .passThrough((state, emitter) => {
    if (state.a === 1)
        emitter.emit("check", "a is ok");
})
    .pipe(async (state) => {
    state.c = 3;
    return state;
})
    .milestone("STATE:UPDATED:ANALYZED")
    .pipe(subSequence)
    .branch([
    {
        if: async (state) => state.a === 1,
        then: subSubSequence
    },
    {
        if: async (state) => state.a === 1,
        then: async (state) => {
            state.e = 5;
            return state;
        }
    }
])
    .parallel([
    async (state) => {
        state.f = 6;
        return state;
    },
    async (state) => {
        state.g = 7;
        return state;
    }
])
    .go([
    { to: "increment-a", if: async (state) => state.a < 4 },
    { to: "STATE:UPDATED:ANALYZED", if: async (state) => state.a > 9 }
])
    .assign({
    blocks: [
        { id: 1, items: [{ id: 1 }, { id: 2 }, { id: 3 }] },
        { id: 2, items: [{ id: 1 }, { id: 2 }, { id: 3 }] }
    ]
})
    .loop({
    key: "blocks",
    chain: (chain) => chain.loop({
        key: "items",
        chain: (chain) => chain.parallel([
            async (state) => {
                state.element.title = "title";
                return state;
            },
            async (state) => {
                state.element.description = "description";
                return state;
            }
        ])
    })
})
    .pick("j")
    .on("check", (msg) => console.log(msg));
// const res = await main.run({ a: 0 });
// console.log(JSON.stringify(res, null, 2));
const stream = main.stream({ a: 0 });
for await (const state of stream) {
    console.log(state.origin, state.type, state.name ?? "");
}
