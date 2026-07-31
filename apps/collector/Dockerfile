FROM ghcr.io/open-telemetry/opentelemetry-collector-releases/opentelemetry-collector-contrib:0.157.0 AS collector

FROM python:3.13-slim-bookworm

COPY --from=collector /otelcol-contrib /otelcol-contrib

ENTRYPOINT []
