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
// import * as EventEmitter from "node:events";
// import { on } from "node:events";
import EventEmitter, { on } from "node:events";
const isFunc = (obj) => typeof obj === "function" || obj instanceof Runnable;
class Runnable {
    constructor(state, name, params = {}) {
        var _a, _b;
        this.steps = [];
        this.emitEnd = true;
        this.name = name;
        this.state = state;
        this.emitter = (_a = params.emitter) !== null && _a !== void 0 ? _a : new EventEmitter();
        this.emitEnd = (_b = params.emitEnd) !== null && _b !== void 0 ? _b : true;
        return this;
    }
    on(event, fnc) {
        this.emitter.on(event, fnc);
        return this;
    }
    emit(event, ...args) {
        return this.emitter.emit(event, ...args);
    }
    pipe(fnc) {
        this.steps.push({ step: fnc, type: "pipe" });
        return this;
    }
    assign(key, fnc) {
        this.steps.push({ step: key, type: "assign", fnc: fnc });
        return this;
    }
    passThrough(fnc) {
        this.steps.push({ step: fnc, type: "passThrough" });
        return this;
    }
    pick(keys) {
        this.steps.push({ step: keys, type: "pick" });
        return this;
    }
    rooter(fnc) {
        this.steps.push({ step: fnc, type: "rooter" });
        return this;
    }
    async _exec(fnc) {
        const stato = structuredClone(this.state);
        return fnc instanceof Runnable
            ? await fnc.run(stato, { emitter: this.emitter, emitEnd: false })
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
                var _a;
                const type = (_a = this.steps[nextIndex]) === null || _a === void 0 ? void 0 : _a.type;
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
    async iterate(iteration) {
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
    _warm(state, params = {}) {
        if (state)
            this.state = Object.assign(Object.assign({}, this.state), state);
        if (params.emitter)
            this.emitter = params.emitter;
        if (params.emitEnd !== undefined)
            this.emitEnd = params.emitEnd;
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
                    console.log("*", iteration);
                    yield yield __await(iteration);
                    if (iteration.step === "end")
                        break;
                }
            }
            catch (e_2_1) { e_2 = { error: e_2_1 }; }
            finally {
                try {
                    if (!_d && !_a && (_b = _e.return)) yield __await(_b.call(_e));
                }
                finally { if (e_2) throw e_2.error; }
            }
            return yield __await(this.state);
        });
    }
    static from(steps, name) {
        const r = new Runnable({}, name);
        for (const step of steps) {
            if (isFunc(step))
                r.pipe(step);
            if (typeof step === "object")
                r.assign(step);
        }
        return r;
    }
    static init(state = {}, name, params = {}) {
        return new Runnable(state, name, params);
    }
}
const sub = Runnable.from([
    { k: async () => "O", j: 1 },
    async (state) => {
        state.y = "ciao";
        return state;
    }
], "sub:seq");
const main = Runnable.init({ a: 1 }, "main:seq")
    .assign({ b: async () => await 2 })
    .passThrough((state, emitter) => {
    if (state.a === 1)
        emitter.emit("check", "a is ok");
})
    .pipe(async (state) => {
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
try {
    for (var _d = true, stream_1 = __asyncValues(stream), stream_1_1; stream_1_1 = await stream_1.next(), _a = stream_1_1.done, !_a; _d = true) {
        _c = stream_1_1.value;
        _d = false;
        const { state } = _c;
        console.log(state);
    }
}
catch (e_1_1) { e_1 = { error: e_1_1 }; }
finally {
    try {
        if (!_d && !_a && (_b = stream_1.return)) await _b.call(stream_1);
    }
    finally { if (e_1) throw e_1.error; }
}
