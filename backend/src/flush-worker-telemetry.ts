async function flush(stream: NodeJS.WriteStream): Promise<void> {
  if (stream.writableNeedDrain) {
    await new Promise<void>((resolve) => stream.once('drain', resolve));
  }
}

/** Flush process log/telemetry sinks before container exit; exporters plug in here. */
export async function flushWorkerTelemetry(): Promise<void> {
  await Promise.all([flush(process.stdout), flush(process.stderr)]);
}
