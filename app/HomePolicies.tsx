"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import PolicyDialog from "./PolicyDialog";
import { policies } from "./home-policy-content";

export default function HomePolicies() {
  const [policy, setPolicy] = useState(policies[0]);
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <>
      <nav className="home-policy-links" aria-label="서비스 정책">
        {policies.map((entry) => (
          <button key={entry.label} type="button" aria-haspopup="dialog" onClick={() => {
            flushSync(() => setPolicy(entry));
            dialog.current?.showModal();
          }}>
            {entry.label}
          </button>
        ))}
      </nav>
      <PolicyDialog ref={dialog} titleId="home-policy-title" title={policy.title} contentKey={policy.label}>
        {policy.content}
      </PolicyDialog>
    </>
  );
}
