var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = {}, verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function () { return this; }, i;
    function awaitReturn(f) { return function (v) { return Promise.resolve(v).then(f, reject); }; }
    function verb(n, f) { if (g[n]) { i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; if (f) i[n] = f(i[n]); } }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
};
var _a, e_1, _b, _c;
import EventEmitter, { on } from "node:events";
import { v4 as uuidv4 } from "uuid";
import merge from "lodash.merge";
const isFunc = (obj) => typeof obj === "function" || obj instanceof Runnable;
var StepType;
(function (StepType) {
    StepType["INIT"] = "init";
    StepType["PIPE"] = "pipe";
    StepType["ASSIGN"] = "assign";
    StepType["PASSTHROUGH"] = "passThrough";
    StepType["PICK"] = "pick";
    StepType["SWITCH"] = "switch";
    StepType["PARALLEL"] = "parallel";
    StepType["LOOP"] = "loop";
})(StepType || (StepType = {}));
const sleep = (ms = 1000) => new Promise((resolve) => setTimeout(resolve, ms));
function getDeep(obj, path) {
    return path.split(".").reduce((acc, key) => acc[key], obj);
}
function setDeep(obj, path, value) {
    const keys = path.split(".");
    const last = keys.pop();
    const lastObj = keys.reduce((acc, key) => {
        if (!acc[key])
            acc[key] = {};
        return acc[key];
    }, obj);
    lastObj[last] = value;
}
class Runnable {
    constructor(state, params = {}) {
        var _a;
        this.steps = [];
        this.nextStep = 0;
        this.name = params.name;
        this.state = state;
        this.emitter = (_a = params.emitter) !== null && _a !== void 0 ? _a : new EventEmitter();
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
    }
    pipe(fnc) {
        this.setStep({ step: fnc, type: StepType.PIPE });
        return this;
    }
    assign(key, fnc) {
        this.setStep({ step: key, type: StepType.ASSIGN, fnc: fnc });
        return this;
    }
    passThrough(fnc) {
        this.setStep({ step: fnc, type: StepType.PASSTHROUGH });
        return this;
    }
    pick(keys) {
        this.setStep({ step: keys, type: StepType.PICK });
        return this;
    }
    switch(fnc, options = {}) {
        this.setStep({ step: fnc, type: StepType.SWITCH, options });
        return this;
    }
    switchAll(fnc, options = {}) {
        this.setStep({
            step: fnc,
            type: StepType.SWITCH,
            options: Object.assign(Object.assign({}, options), { processAll: true })
        });
        return this;
    }
    parallel(fncs) {
        this.setStep({ step: fncs, type: StepType.PARALLEL });
        return this;
    }
    loop(options) {
        this.setStep({
            step: options.chain,
            type: StepType.LOOP,
            key: options.key
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
        this.state = Object.assign(Object.assign({}, this.state), (await this._exec(fnc)));
        return this;
    }
    _pick(keys) {
        if (!Array.isArray(keys))
            keys = [keys];
        const obj = {};
        keys.forEach((key) => {
            obj[key] = getDeep(this.state, key);
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
            setDeep(this.state, key, await this._exec(fnc));
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
                setDeep(this.state, keys[i], values[i]);
            }
        }
        return this;
    }
    async _switch(cases, options = {}) {
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
        this.state = Object.assign(Object.assign({}, this.state), update);
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
        this.state = Object.assign(Object.assign({}, this.state), update);
        return this;
    }
    async _loop(chain, key) {
        const innerLoop = Object.keys(this.state).every((k) => ["element", "index"].includes(k));
        if (innerLoop && !key.startsWith("element."))
            key = `element.${key}`;
        const _loop = getDeep(this.state, key);
        if (!Array.isArray(_loop))
            throw new Error("Koop key must be an array");
        for (let i = 0, length = _loop.length; i < length; i++) {
            const element = _loop[i];
            const runnable = new Runnable({ element, index: i }, { emitter: this.emitter, name: `${this.name}:loop:${key}:${i}` });
            const result = await chain(runnable).run();
            _loop[i] = Object.assign(Object.assign({}, element), result.element);
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
    emitStep(type) {
        const event = {
            id: uuidv4(),
            type,
            origin: this.name,
            state: this.state
        };
        this.emit("step", event);
    }
    async iterate(iteration) {
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
    _warm(state, params = {}) {
        if (state)
            this.state = Object.assign(Object.assign({}, this.state), state);
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
    stream(state_1) {
        return __asyncGenerator(this, arguments, function* stream_2(state, params = {}) {
            var _a, e_2, _b, _c;
            this._warm(state, params);
            this.iterate(this.iterator.next());
            try {
                for (var _d = true, _e = __asyncValues(on(this.emitter, "step")), _f; _f = yield __await(_e.next()), _a = _f.done, !_a; _d = true) {
                    _c = _f.value;
                    _d = false;
                    const [iteration] = _c;
                    yield yield __await(iteration);
                }
            }
            catch (e_2_1) { e_2 = { error: e_2_1 }; }
            finally {
                try {
                    if (!_d && !_a && (_b = _e.return)) yield __await(_b.call(_e));
                }
                finally { if (e_2) throw e_2.error; }
            }
        });
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
const main = Runnable.init({ a: 1 }, { name: "main:seq" })
    .assign({ b: async () => await 2 })
    .passThrough((state, emitter) => {
    if (state.a === 1)
        emitter.emit("check", "a is ok");
})
    .pipe(async (state) => {
    state.c = 3;
    return state;
})
    .pipe(subSequence)
    .switchAll([
    {
        if: async (state) => state.a === 1,
        then: async (state) => {
            state.d = 4;
            return state;
        }
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
// const res = await main.run();
// console.log(JSON.stringify(res, null, 2));
const stream = main.stream();
try {
    for (var _d = true, stream_1 = __asyncValues(stream), stream_1_1; stream_1_1 = await stream_1.next(), _a = stream_1_1.done, !_a; _d = true) {
        _c = stream_1_1.value;
        _d = false;
        const state = _c;
        console.log(state.origin, state.type);
    }
}
catch (e_1_1) { e_1 = { error: e_1_1 }; }
finally {
    try {
        if (!_d && !_a && (_b = stream_1.return)) await _b.call(stream_1);
    }
    finally { if (e_1) throw e_1.error; }
}
