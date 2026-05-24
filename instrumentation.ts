import { registerOTel } from "@vercel/otel";
import { LangfuseExporter } from "langfuse-vercel";

export function register() {
  registerOTel({
    serviceName: "thoth",
    traceExporter: new LangfuseExporter({
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    }),
  });
}
