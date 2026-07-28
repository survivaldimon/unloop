import { useEffect, useState } from "react";
import { fetchAccount } from "../lib/account";
import { ACCOUNT_COPY } from "../lib/accountCopy";
import { creditsEnabled } from "../lib/credits";
import { track } from "../lib/analytics";
import { useLang } from "../i18n";

/**
 * Offered after a read, never before one: the funnel keeps its silent account
 * so nothing stands between finishing and reading, and only once there is
 * something worth keeping do we suggest making it permanent. Shows up for a
 * signed-in visitor who has no password yet, and quietly disappears otherwise.
 */
export default function SaveAccessCard() {
  const ui = ACCOUNT_COPY[useLang()];
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!creditsEnabled) return;
    void fetchAccount().then((account) => {
      const needed = Boolean(account && !account.hasPassword);
      setShow(needed);
      if (needed) track("save_access_view");
    });
  }, []);

  if (!show) return null;

  return (
    <section className="mt-10 rounded-xl border border-paper/15 p-4">
      <p className="font-display text-[16px] font-medium italic">{ui.saveTitle}</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-mist">{ui.saveBody}</p>
      <a
        href="/account/"
        onClick={() => track("save_access_click")}
        className="mt-3 inline-block rounded-lg border border-brass/50 px-3.5 py-2 text-[13px] text-brass-2 no-underline transition hover:border-brass"
      >
        {ui.saveCta}
      </a>
    </section>
  );
}
