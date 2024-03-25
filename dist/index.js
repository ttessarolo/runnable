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
import EventEmitter, { on } from "node:events";
import { v4 as uuidv4 } from "uuid";
const isFunc = (obj) => typeof obj === "function" || obj instanceof Runnable;
var StepType;
(function (StepType) {
    StepType["INIT"] = "init";
    StepType["PIPE"] = "pipe";
    StepType["ASSIGN"] = "assign";
    StepType["PASSTHROUGH"] = "passThrough";
    StepType["PICK"] = "pick";
    StepType["ROOTER"] = "rooter";
})(StepType || (StepType = {}));
const sleep = (ms = 1000) => new Promise((resolve) => setTimeout(resolve, ms));
class Runnable {
    constructor(state, params = {}) {
        var _a;
        this.steps = [];
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
    rooter(fnc) {
        this.setStep({ step: fnc, type: StepType.ROOTER });
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
            obj[key] = this.state[key];
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
            this.state[key] = await this._exec(fnc);
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
                this.state[keys[i]] = values[i];
            }
        }
        return this;
    }
    stepsIterator() {
        let nextIndex = 0;
        let end = this.steps.length;
        const step = 1;
        return {
            next: () => {
                if (nextIndex < end) {
                    const result = { value: this.steps[nextIndex], done: false };
                    nextIndex += step;
                    return result;
                }
                return { value: null, done: true };
            }
        };
    }
    emitStep(type) {
        this.emit("step", {
            id: uuidv4(),
            type,
            origin: this.name,
            state: this.state
        });
    }
    async iterate(iteration) {
        if (!iteration.done) {
            const { step, type, fnc } = iteration.value;
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
        return __asyncGenerator(this, arguments, function* stream_1(state, params = {}) {
            var _a, e_1, _b, _c;
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
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (!_d && !_a && (_b = _e.return)) yield __await(_b.call(_e));
                }
                finally { if (e_1) throw e_1.error; }
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
    .pick("j")
    .on("check", (msg) => console.log(msg));
const res = await main.run();
console.log(res);
