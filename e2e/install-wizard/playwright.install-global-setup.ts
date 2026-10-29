import { waitForStack } from '../helpers/wait-for-stack';

/*
  F6 — the wizard project's global setup is only „is the stack up already?“.

  The shared setup (`e2e/global-setup.ts`) calls `ensureInstall`, which completes
  the installation through the API before any spec runs — the one thing the wizard
  specs exist to prove through the UI. Reusing it would make them pass by
  construction and hide every regression in the flow they cover.
*/
export default async function globalSetup(): Promise<void> {
  await waitForStack();
}
