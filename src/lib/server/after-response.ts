import "server-only";

import { after } from "next/server";

export function runAfterResponse(
  label: string,
  task: () => Promise<void>,
) {
  after(async () => {
    try {
      await task();
    } catch (error) {
      console.error(`After-response task failed: ${label}`, error);
    }
  });
}
