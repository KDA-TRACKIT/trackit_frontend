"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { X } from "lucide-react";
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
      <dialog ref={dialog} className="home-policy-dialog" aria-labelledby="home-policy-title">
        <header>
          <h2 id="home-policy-title">{policy.title}</h2>
          <button type="button" aria-label="닫기" onClick={() => dialog.current?.close()}>
            <X aria-hidden="true" size={20} />
          </button>
        </header>
        <div key={policy.label} className="home-policy-body" tabIndex={0} role="region" aria-labelledby="home-policy-title">
          {policy.content}
        </div>
      </dialog>
    </>
  );
}
