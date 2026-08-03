import { Suspense } from "react";
import DomainSetupClient from "./DomainSetupClient";

export default function DomainSetupPage() {
  return (
    <Suspense
      fallback={
        <main className="setup">
          <h1>Connect your Google Calendar</h1>
        </main>
      }
    >
      <DomainSetupClient />
    </Suspense>
  );
}
