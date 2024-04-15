# 🏃🏼‍♂️‍➡️🏃🏼‍➡️ Runnify 🏃🏽‍♀️‍➡️
Typescript library that allows you to create chains of executable code to manipulate an initial state.

It has the following features:
- The state is immutable
- Execution can be in parallel
- Every step can be async
- It can be used in **streaming** as a Transformer
- Implements an event emitter to let emit events during the execution. Emitted events can be listened to for telemetry purposes or to send progressive responses to clients
- For each chain or for each step in the chain it is possible to set:
	- Retry
	- Cache
	- Timeout
	- Fallback
	- Circuit Breaker
	- Bulk Head Limiter
- Natively implements **OpenTelemetry** to track each execution step
- Perform conditional jumps within the chain (eg. to do loops or to act as node graph)
- Execute loops for iterable state objects (eg. Arrays)
- Pass a context to the chain to make it available to all steps 
- Nest chains within chains
- Use Zod to manipulate the state

## Documentations
🚀 Read full docs [here](https://ttessarolo.github.io/runnable/)

## Install

```javascript
npm install runnify
```

## Examples

- [Chain with nested chains](#nested-chains)
- [Loops](#loops)
- [Streaming](#streaming)
- [Retry, Cache, Fallback and Timeout](#circuit)
- [Goto](#goto)
- [External Context](#context)
- [Zod State Manipulation](#zod)
- [Progressive Response (HTTP SSE)](#progressive)
- [Stream Steps](#steps)
- [OpenTelemetry](#opentelemetry)


### <a id="nested-chains"></a>Chain with nested chains

```javascript
const subSequence = Runnable.from(
  [
    { k: async () => "O", j: 1 },
    async (state: any) => {
      state.y = "ciao";
      return state;
    }
  ],
  { name: "sub:seq" }
);

const subSubSequence = Runnable.from(
  [
    { z: async () => "Z" },
    {
      y: async (state: any) => {
        return "Y";
      }
    }
  ],
  { name: "sub:sub:seq" }
);

const main = Runnable.init({ name: "full:main:seq" })
  .assign("year",() => new Date.getYear(), { name: "year" })
  .assign({ b: 2 }, { name: "b" })
  .pipe((state)=> {
	  state.joy = "high";
	  return state;
  })
  .push((state) =>{
	  return {a: state.a + 1}
  }, { name: "increment:a" })
  .passThrough((state,{emit}) =>{
	  if (state.a === 1) emit("check", "a is ok");
  }, { name: "emit:check" })
  .push(setC, { name: "set:c" }) // setC is a fnc
  .milestone("state:analyzed")
  .push(subSequence)
  .branch(
    [
      { if: A_is_1, then: subSubSequence },
      { if: A_is_5, then: setE }
    ],
    { name: "on:a:1:or:5" }
  )
  .parallel([setF, setG], { name: "set:f:and:g" })
  .go(
    [
      { to: "increment:a", if: A_less_4 },
      { to: "state:analyzed", if: A_more_9 }
    ],
    { name: "go:checking:a" }
  )
  .assign({
    blocks: [
      { id: 1, items: [{ id: 1 }, { id: 2 }, { id: 3 }] },
      { id: 2, items: [{ id: 1 }, { id: 2 }, { id: 3 }] }
    ]
  })
  .push(processBlocks) // processBlocks is a nested chain
  .on("check", (msg: string) => true);
  
  const res = await main.run({ a: 0 });
```

### <a id="loops"></a>Loops

```typescript
const setBlockIndex = async (state: any) => {
  state.element.index = state.index;
  return state;
};
const setBlockCheck = async (state: any) => {
  state.element.check = true;
  return state;
};
const setItemTitle = async (state: any) => {
  state.element.title = "title";
  return state;
};
const setItemDescription = async (state: any) => {
  state.element.description = "description";
  return state;
};

const processBlock = Runnable.init({ name: "block:chain" }).parallel(
  [setBlockIndex, setBlockCheck],
  { name: "set:index:and:check" }
);
const processItems = Runnable.init({ name: "items:chain" }).loop({
  key: "items",
  chain: (chain: Runnable) =>
    chain.parallel([setItemTitle, setItemDescription], {
      name: "set:title:and:description"
    })
});
const processBlocks = Runnable.init({ name: "blocks:chain" }).loop({
  key: "blocks",
  chain: (chain: Runnable) =>
    chain.parallel([processBlock, processItems], {
      name: "process:block:and:items"
    })
});

const main = Runnable.init({ name: "loop:seq" }).push(processBlocks);

const res = res = await main
    .run({
      blocks: [
        { id: 1, items: [{ id: 1 }, { id: 2 }, { id: 3 }] },
        { id: 2, items: [{ id: 1 }, { id: 2 }, { id: 3 }] }
      ]
    })
```

### <a id="streaming"></a>Streaming

```javascript
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";

interface State {
  a: number;
  b?: number;
}

const read: Readable = Readable.from(
  Array.from({ length: 10 }, (_, a) => ({ a }))
);

const main = Runnable.init({ name: "stream:main:seq" }).assign({
  b: async (state: State) => state.a + 1
});

// get the transform stream from chain
const transform = main.stream();

const risultati: State[] = [];

const write = new Writable({
  objectMode: true,
  write: (state: State, _, next) => {
    risultati.push(state);
    next();
  }
});

await pipeline(read, transform, write);

```

### <a id="circuit"></a>Retry, Cache, Fallback and Timeout

```typescript
let errors: number;

// Retry
const r = Runnable.init({
  name: "wrap:main:seq",
  circuit: { retry: 3 }
}).push(function throwError(): never {
  throw new Error(`Error ${++errors}`);
});

// Retry + Timeout
const r = Runnable.init({
  name: "wrap:main:seq"
}).push(
  function throwError() {
    throw new Error(`Error ${++errors}`);
  },
  { circuit: { retry: 3, timeout: 100000 } }
);

// Retry + Circuit Breaker
const r = Runnable.init({
  name: "wrap:main:seq"
}).push(
  function throwError() {
    throw new Error(`Error ${++errors}`);
  },
  { circuit: { retry: 3, circuitBreaker: { consecutiveFaillures: 2 } } }
);

// Retry + Circuit Breaker + Fallback
const r = Runnable.init({
  name: "wrap:main:seq"
}).push(
  function throwError() {
    throw new Error(`Error ${++errors}`);
  },
  {
    circuit: {
      retry: 3,
      circuitBreaker: { consecutiveFaillures: 2 },
      fallback: async (params: any) => {
        await sleep(10);
        return { fallback: "hallo" };
      }
    }
  }
);
```


### <a id="goto"></a>Goto

```typescript
const seq = Runnable.init({ name: "operators:pipe:seq" })
    .pipe(
      (state: any) => {
        state.a = (state.a || 0) + 1;
        return state;
      },
      { name: "increment:a" }
    )
    .go({
      to: "increment:a",
      if: (state: any) => state.a < 10
    })
    .pipe((state: any) => {
      state.c = state.a / 2;
      return state;
    });

const state = await seq.run({ b: 0 });
```

### <a id="context"></a>External Context

```typescript
const ctx = {
  config: {
    get: async (key: string) => "value"
  },
  gRPC: {
    ingress: {
      get: async (key: string) => "ingress"
    }
  }
};

const main = Runnable.init({ name: "context:main:seq", ctx }).assign({
  conf: async function (state: any, params: RunFncParams) {
    return await params.ctx.config.get("key");
  },
  remote: async function (state: any, params: RunFncParams) {
    return await params.ctx.gRPC.ingress.get("key");
  }
});

const state = await main.run({});
```

### <a id="zod"></a>State Manipulation (Zod)

```typescript
import { z } from "zod";
const schema: z.ZodType = z.object({ name: z.string(), age: z.number() });


// Simple Pick (array of keys)
const simplePick = Runnable.init({ name: "zod:pick:pipe:seq" })
  .pick(["keyA","keyB"], { name: "pick:keysArray" })
  
// Zod Pick
const pickSeq = Runnable.init({ name: "zod:pick:seq" }).pick(schema);

// Zod Pipe
const pipeSeq = Runnable.init({ name: "zod:pipe:seq" }).push(
  (state: any) => {
    state.extra = state.extra;
    return state;
  },
  { schema, name: "pipe:pick" }
);

// Zod Pipe Pick
const pipeAndPickSeq = Runnable.init({ name: "zod:pipe:pick:seq" })
  .push((state: any) => state, { schema })
  .pick(schema, { name: "filter:egress" });
  
// Zod Pick Pipe
const pickAndPipeSeq = Runnable.init({ name: "zod:pick:pipe:seq" })
  .pick(schema, { name: "filter:ingress" })
  .push((state: any) => state);
```

### <a id="progressive"></a>Progressive Response (HTTP SSE)

```typescript
import Fastify from "fastify";
import { FastifySSEPlugin } from "fastify-sse-v2";
import cors from "@fastify/cors";
import { RunState, RunFncParams } from "../dist/types.js";

interface State extends RunState {
  a: number;
  done?: boolean;
}
const main = Runnable.init({ name: "progressive:seq" })
  .passThrough((state: State, params: RunFncParams) => {
    params.emit("progress", { a: 1 });
  })
  .passThrough((state: State, params: RunFncParams) => {
    params.emit("progress", { a: 2 });
  })
  .passThrough((state: State, params: RunFncParams) => {
    params.emit("progress", { a: 3, done: true });
  });

async function* getProgress() {
  const emitter = new EventEmitter();
  main.run({}, { emitter });

  for await (const [state] of on(emitter, "progress")) {
    yield state;
    if (state.done) break;
  }
}

const fastify = Fastify({
  logger: true
});
await fastify.register(cors, {
  origin: true
});
fastify.register(FastifySSEPlugin);

fastify.get("/progress", async function (req, res) {
  res.sse(getProgress());
});
```

### <a id="#steps"></a>Stream Steps

```typescript
interface State extends RunState {
  a: number;
  done?: boolean;
}
const main = Runnable.init({ name: "progressive:seq" })
  .passThrough((state: State, params: RunFncParams) => {
    params.emit("progress", { a: 1 });
  })
  .passThrough((state: State, params: RunFncParams) => {
    params.emit("progress", { a: 2 });
  })
  .passThrough((state: State, params: RunFncParams) => {
    params.emit("progress", { a: 3, done: true });
  });
  
 const states: string[] = [];

for await (const step of main.streamSteps()) {
	states.push(step.type);
	if (step.type === "end") break;
}
```

### <a id="opentelemetry"></a>OpenTelemetry

```javascript
// instrumentation.js
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-node";
import { Resource } from "@opentelemetry/resources";
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION
} from "@opentelemetry/semantic-conventions";

import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { JaegerExporter } from "@opentelemetry/exporter-jaeger";
import { PrometheusExporter } from "@opentelemetry/exporter-prometheus";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";

const sdk = new NodeSDK({
  resource: new Resource({
    [SEMRESATTRS_SERVICE_NAME]: "Runnify",
    [SEMRESATTRS_SERVICE_VERSION]: "1.0"
  }),
  spanProcessors: [
    new SimpleSpanProcessor(new JaegerExporter())
    //new SimpleSpanProcessor(new ConsoleSpanExporter())
  ],
  metricReader: new PrometheusExporter(),
  instrumentations: [getNodeAutoInstrumentations()]
});

sdk.start();
```


## License
Licensed under [MIT](./LICENSE).