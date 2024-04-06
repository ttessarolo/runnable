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
    new SimpleSpanProcessor(new JaegerExporter()),
    new SimpleSpanProcessor(new ConsoleSpanExporter())
  ],
  metricReader: new PrometheusExporter(),
  instrumentations: [getNodeAutoInstrumentations()]
});

sdk.start();

export default () => {
  console.log("\n🚀🚀🚀 Instrumentation started");
};
