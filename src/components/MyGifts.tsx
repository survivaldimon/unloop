import { GIFT_COPY } from "../lib/giftCopy";
import { formatGiftCode, type MyGift } from "../lib/gifts";
import type { Lang } from "../i18n";

/**
 * The gifts an account has bought, with the code of each — the place a code
 * comes back from when the buyer loses the tab it was minted in. Shown on the
 * gift page and in /account/, so it lives here rather than inside either.
 *
 * Codes are printed in full on purpose: this list is only ever the buyer's own
 * (looplore_my_gifts keys on auth.uid()), and a gift code you cannot read is
 * not a gift you can send.
 */
export default function MyGifts({
  gifts,
  lang,
  giveHref,
}: {
  gifts: MyGift[];
  lang: Lang;
  /** Adds the "give a gift" link under the list — /account/ wants it, the gift page doesn't. */
  giveHref?: string;
}) {
  const ui = GIFT_COPY[lang].mine;
  const tiersCopy = GIFT_COPY[lang].buy.tiers;

  const statusLine = (status: MyGift["status"]): string =>
    status === "redeemed"
      ? ui.statusRedeemed
      : status === "revoked"
        ? ui.statusRevoked
        : status === "expired"
          ? ui.statusExpired
          : ui.statusPaid;

  return (
    <section className="mt-8">
      <p className="font-display text-[16px] font-medium">{ui.title}</p>
      <hr className="hairline mt-2 mb-3" />
      {gifts.length === 0 ? (
        <p className="text-[13px] text-mist italic">{ui.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {gifts.map((g) => (
            <li key={g.code} className="flex items-baseline justify-between gap-2 text-[13px]">
              <span className="min-w-0 text-paper/90">
                {tiersCopy[g.tier].title}
                <span className="text-mist"> · {statusLine(g.status)}</span>
              </span>
              <span className="flex-none font-semibold tracking-[0.08em] text-brass-2">
                {formatGiftCode(g.code)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {giveHref && (
        <a
          href={giveHref}
          className="mt-3 inline-block text-[13px] text-brass-2 underline-offset-4 hover:underline"
        >
          {ui.giveCta} →
        </a>
      )}
    </section>
  );
}
