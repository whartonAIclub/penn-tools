// A short Markdown summary of a pilot report, for the owner. Everything in it comes from the report itself (counts, sums,
// durations, fixed words and event ids); the JSON has every figure and the full definitions.

import type { Duration, PilotReport, Waited } from "./types.js";

const NEW_YORK = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
/** Events listed in the summary's table; the JSON lists them all. */
const EVENTS_SHOWN = 10;

export function pilotReportMarkdown(r: PilotReport): string {
  const c = r.created;
  const q = r.quantities;
  const t = r.ticketExchanges;
  const g = r.goodsExchanges;
  const ced = r.cancellationsExpirationsDisputes;
  const x = ced.cancellations;
  const e = ced.expirations;
  const d = ced.disputes;
  const p = r.participants;
  const L: string[] = [];

  L.push("# Handoff pilot metrics: live market", "");
  L.push(
    `Generated ${et(r.generatedAt)} from the database's clock, read-only (${r.safety.readOnlyTransaction ? "READ ONLY" : "NOT read-only"} ` +
      `${r.safety.isolation} transaction). Window: ${r.window.from ? `all records since the live world's first write, ${et(r.window.from)},` : "all records (the live world has none yet)"} ` +
      `through generation. "Last 7 days" means since ${et(r.window.last7DaysFrom)}.`,
    "",
  );
  L.push(`**Scope.** ${r.scope.separation}${r.scope.liveWorldStored ? "" : " Nobody has written to the live world yet, so the market is empty."}`, "");

  L.push("## Activity", "");
  L.push("| | All time | Last 7 days |", "|---|---:|---:|");
  L.push(`| Participants: distinct accounts (a buyer who also sells counts once) | ${p.distinct} | – |`);
  L.push(`| Of whom selling (listed tickets or an item) / buying (offered, reserved or requested) / both, completed or not | ${p.sold} / ${p.bought} / ${p.boughtAndSold} | – |`);
  L.push(`| Of whom in a completed exchange (either side) | ${p.inCompletedExchanges} | – |`);
  L.push(`| Public requests posted | ${c.publicRequests.allTime} | ${c.publicRequests.last7Days} |`);
  L.push(`| Private alerts set (counts only) | ${c.alerts.allTime} | ${c.alerts.last7Days} |`);
  L.push(`| Events added | ${c.events.allTime} | ${c.events.last7Days} |`);
  // Forms round 2: how many were added by their date alone, and how many have no face value (no price cap), all time.
  L.push(`| Of which added by date only (close 11:59 PM that day) / with no face value (no price cap) | ${c.events.dateOnly} / ${c.events.noFaceValue} | – |`);
  L.push(`| Ticket listings (tickets listed) | ${c.ticketListings.allTime} (${c.ticketListings.units}) | ${c.ticketListings.last7Days} |`);
  L.push(`| Held replies to requests (tickets) | ${c.heldReplies.allTime} (${c.heldReplies.units}) | ${c.heldReplies.last7Days} |`);
  L.push(`| Goods items posted | ${c.items.allTime} | ${c.items.last7Days} |`);
  const f = r.funnel;
  const newFlow = f.requestsToBuy.exchanges + f.invitations.fromPublicRequest.exchanges;
  L.push(
    `| Ticket requests: legacy offers + "I'll take it" + held replies${newFlow ? " + invite to pay" : ""} | ${t.requests} (${t.offers} + ${t.takes} + ${t.heldReplies}${newFlow ? ` + ${newFlow}` : ""}) | ${t.last7Days.requests} |`,
  );
  L.push(`| Ticket reservations (tickets) | ${t.reservations.exchanges} (${t.reservations.units}) | ${t.last7Days.reservations} |`);
  L.push(`| Completed ticket exchanges (tickets) | ${t.completed.exchanges} (${t.completed.units}) | ${t.last7Days.completed} |`);
  L.push(`| Goods requests / holds / pickups | ${g.requests} / ${g.holds} / ${g.completed} | ${g.last7Days.requests} / ${g.last7Days.holds} / ${g.last7Days.completed} |`);
  L.push("");

  L.push(`## Now (${et(q.asOf)})`, "");
  const tk = q.tickets;
  const lo = r.scope.stockHeldByLeftOutAccounts; // the market as it stands: a known test account's hold or handover takes real stock
  L.push(
    `- **Tickets** (${tk.listings} public listings, ${tk.listedUnits} listed): ${tk.availableNow} available to take now, ${tk.reservedNow} reserved, ` +
      `${tk.completed} completed, ${tk.unsoldNotOpen} unsold and not open (withdrawn, paused or closed` +
      `${tk.pausedUnits ? `; ${tk.pausedUnits} of them paused by the seller on ${tk.pausedListings} listings` : ""}).` +
      (lo.ticketsReservedNow || lo.ticketsCompleted
        ? ` Known test accounts hold ${lo.ticketsReservedNow} of the reserved and were handed ${lo.ticketsCompleted} of the completed; their exchanges aren't counted as activity.`
        : ""),
  );
  const hr = q.heldReplies;
  if (hr.replies > 0) {
    L.push(`- **Held replies** (${hr.replies}, ${hr.units} tickets): ${hr.awaitingAnswer} awaiting the requester, ${hr.reservedNow} reserved, ${hr.completed} completed, ${hr.closedUnsold} closed unsold.`);
  }
  const it = q.items;
  L.push(
    `- **Goods** (${it.posted} posted): ${it.availableNow} on sale, ${it.onHoldNow} on hold, ${it.sold} sold, ${it.withdrawn} withdrawn, ` +
      `${it.pickupWindowOver} pickup window over, ${it.pausedNow} paused${it.notOpenOther ? `, ${it.notOpenOther} not open for another reason` : ""}.` +
      (lo.itemsOnHoldNow || lo.itemsSold
        ? ` Known test accounts hold ${lo.itemsOnHoldNow} of those on hold and bought ${lo.itemsSold} of those sold; their exchanges aren't counted as activity.`
        : ""),
  );
  const pr = q.publicRequests;
  L.push(
    `- **Public requests:** ${pr.liveNow} live (${pr.liveUnits} units still wanted), ${pr.openPastDeadline} open past their deadline, ` +
      `${pr.openEventClosed} on closed events, ${pr.fulfilled} fulfilled, ${pr.cancelled} cancelled, ${pr.closedOther} closed otherwise. ` +
      `**Alerts:** ${q.alerts.active} active, ${q.alerts.paused} paused, ${q.alerts.closed} removed.`,
    "",
  );

  L.push("## Reservations and exchanges", "");
  L.push(
    `- **Tickets:** ${t.reservations.exchanges} reservations (${t.reservations.units} tickets): ${t.completed.exchanges} completed (${t.completed.units}), ` +
      `${t.inProgress.exchanges} in progress (${t.inProgress.units}), ${t.endedWithoutCompletion.exchanges} ended without completion (${t.endedWithoutCompletion.units}). ` +
      `${t.neverReserved.total} offers, held replies, requests to buy or invitations never reserved (${t.neverReserved.open} still open).`,
  );
  const pay = t.payment;
  L.push(
    `- **Payment steps** (what people said in Handoff, which can't see payments): the buyer said "I've sent payment" on ${pay.buyerReported.exchanges} ` +
      `exchanges (${pay.buyerReported.units} tickets); the seller confirmed "Payment received" on ${pay.sellerConfirmed.exchanges} (${pay.sellerConfirmed.units} tickets).`,
  );
  // Invite to pay (format 4): each stage on its own, counted once. An invitation or a request to buy is never a hold or a sale.
  const u = (x: { exchanges: number; units: number }): string => `${x.exchanges} (${x.units} tickets)`;
  L.push(
    `- **Invite to pay** (new ticket requests; each stage counted once, and a request or an invitation holds nothing and is never a sale): ` +
      `requests to buy ${u(f.requestsToBuy)}; invitations to pay ${u(f.invitations.fromRequest)} answering a request to buy and ` +
      `${u(f.invitations.fromPublicRequest)} sent to a public request's owner; holds (the buyer reserved it) ${u(f.holds)}; ` +
      `buyer said "I've sent payment" ${u(f.buyerReported)}; seller confirmed "Payment received" ${u(f.sellerConfirmed)}; completed ${u(f.completed)}. ` +
      `The offers, "I'll take it" reservations and held replies above are legacy figures, from before invite to pay.`,
  );
  L.push(
    `- **Goods:** ${g.holds} holds: ${g.completed} picked up, ${g.onHoldNow} on hold now, ${g.holdsEndedWithoutPickup} ended without pickup. ` +
      `${g.neverHeld.total} requests never held (${g.neverHeld.open} still open).`,
    "",
  );

  L.push("## Cancellations, expirations, disputes", "");
  L.push(
    `- **Cancelled or ended by someone:** ticket reservations cancelled by the buyer ${x.ticketReservationsCancelledByBuyer}, released by the seller ` +
      `${x.ticketReservationsReleasedBySeller}; ticket offers or replies withdrawn ${x.ticketOffersAndRepliesWithdrawnByBuyer}, declined ` +
      `${x.ticketOffersAndRepliesDeclined}; goods holds cancelled by the buyer ${x.goodsHoldsCancelledByBuyer}, released by the seller ` +
      `${x.goodsHoldsReleasedBySeller}; goods requests cancelled ${x.goodsRequestsCancelledByBuyer}, declined ${x.goodsRequestsDeclined}; ` +
      `listings withdrawn ${x.listingsWithdrawn}; items withdrawn ${x.itemsWithdrawn}; public requests cancelled ${x.publicRequestsCancelled}; ` +
      `alerts removed ${x.alertsRemoved}${x.otherEndings ? `; other endings ${x.otherEndings}` : ""}.`,
  );
  const why = (k: PilotReport["cancellationsExpirationsDisputes"]["closures"]["listings"]): string =>
    `sold elsewhere ${k.soldElsewhere}, no longer selling ${k.noLongerSelling}, no reason ${k.noReason}`;
  L.push(`- **Closed by the seller, by the reason they gave** (a closure is never a sale): listings: ${why(ced.closures.listings)}; items: ${why(ced.closures.items)}.`);
  L.push(
    `- **Expired:** ticket reservations before payment ${e.ticketReservationsBeforePayment}, ticket offers or replies ${e.ticketOffersAndReplies}, ` +
      `goods holds ${e.goodsHolds}, goods requests ${e.goodsRequests}, items unsold when the pickup window ended ${e.itemsUnsoldPickupWindowOver}, ` +
      `public requests open past their deadline ${e.publicRequestsOpenPastDeadline} (${e.notYetRecordedBySweep} of the expiries not yet recorded by the server's sweep).`,
  );
  const pna = d.paymentNotArrived;
  const pb = d.problemReports;
  L.push(
    `- **Disputes:** "Payment hasn't arrived" ${pna.total} (confirmed later ${pna.laterConfirmed}, buyer cancelled ${pna.cancelledByBuyer}, ` +
      `seller released ${pna.releasedBySeller}, open ${pna.open}); problem reports ${pb.total} (${pb.open} open, ${pb.resolved} resolved; ` +
      `${pb.tickets} tickets, ${pb.goods} goods)${pb.byReason.length ? `: ${pb.byReason.map((b) => `${b.reason} ${b.count}`).join("; ")}` : ""}.`,
    "",
  );

  L.push("## Time to … (between stored timestamps)", "");
  L.push("| | Median | Range | n | Not reached |", "|---|---:|---:|---:|---:|");
  const tm = r.timing;
  L.push(row("Ticket listing → first offer or reservation", tm.ticketListingToFirstInterest));
  L.push(row("Ticket listing → first reservation", tm.ticketListingToFirstReservation));
  L.push(row("Ticket listing → first completed exchange", tm.ticketListingToFirstCompletion));
  L.push(row("Ticket reservation → completed", tm.ticketReservationToCompletion));
  L.push(row("Goods item → first request", tm.itemToFirstRequest));
  L.push(row("Goods item → first hold", tm.itemToFirstHold));
  L.push(row("Goods item → sold", tm.itemToSale));
  L.push(row("Goods hold → pickup", tm.goodsHoldToPickup));
  L.push(row("Public request → first seller response", tm.publicRequestToFirstSellerResponse));
  L.push("");

  const sd = r.supplyAndDemand;
  L.push(`## Supply and outstanding demand now`, "");
  if (sd.tickets.byCategory.length === 0 && sd.goods.byCategory.length === 0) {
    L.push("Nothing is open to take and no public request is live.", "");
  } else {
    if (sd.tickets.byCategory.length > 0) {
      L.push("| Category | Events | Available tickets | Open listings | Live requests | Requesters | Tickets wanted |", "|---|---:|---:|---:|---:|---:|---:|");
      for (const k of sd.tickets.byCategory) {
        L.push(`| ${k.category} | ${k.events} | ${k.availableUnits} | ${k.openListings} | ${k.openRequests} | ${k.requesters} | ${k.unitsWanted} |`);
      }
      L.push("");
      const top = [...sd.tickets.byEvent]
        .sort((a, b) => b.unitsWanted + b.availableUnits - (a.unitsWanted + a.availableUnits) || (a.startDate < b.startDate ? -1 : 1))
        .slice(0, EVENTS_SHOWN);
      L.push(
        `Events${sd.tickets.byEvent.length > top.length ? ` (the ${top.length} busiest of ${sd.tickets.byEvent.length}; all in the JSON)` : ""}, by id (open \`/tools/handoff#<id>\`):`,
        "",
      );
      L.push("| Event | Kind | Category | Starts | Open | Available | Requests | Wanted |", "|---|---|---|---|---|---:|---:|---:|");
      for (const v of top) {
        L.push(`| ${v.eventId} | ${v.kind} | ${v.category} | ${v.startDate} | ${v.openToTransfers ? "yes" : "no"} | ${v.availableUnits} | ${v.openRequests} | ${v.unitsWanted} |`);
      }
      L.push("");
    }
    if (sd.goods.byCategory.length > 0) {
      L.push("| Goods category | On sale | Live requests | Requesters |", "|---|---:|---:|---:|");
      for (const k of sd.goods.byCategory) L.push(`| ${k.category} | ${k.itemsAvailable} | ${k.openRequests} | ${k.requesters} |`);
      L.push("");
    }
  }

  const v = r.exchangeValue;
  L.push("## User-confirmed exchange value (not verified payments)", "");
  L.push(
    `Tickets ${USD.format(v.tickets.amount)} (${v.tickets.exchanges} exchanges, ${v.tickets.units} tickets) · goods ${USD.format(v.goods.amount)} ` +
      `(${v.goods.exchanges} pickups) · total ${USD.format(v.total)}. Agreed prices the two people confirmed in Handoff; payments happen outside Handoff and aren't checked.`,
    "",
  );

  const ra = r.recentActivity;
  L.push("## Actions log, last 7 days", "");
  L.push(
    `${ra.acceptedChanges} accepted changes by ${ra.accountsWithAcceptedChange} accounts; ${ra.refusedChanges} refused by the rules (never counted as activity); ` +
      `${ra.systemSweeps} expiry sweeps${ra.leftOut ? `; ${ra.leftOut} by known test accounts, left out` : ""}.` +
      (ra.byType.length ? ` By type: ${ra.byType.map((b) => `${b.type} ${b.accepted}${b.refused ? ` (+${b.refused} refused)` : ""}`).join(", ")}.` : ""),
    "",
  );

  const s = r.sources;
  L.push("## Data", "");
  L.push(
    `Live document: version ${s.liveDocument.version}, ${kb(s.liveDocument.bytes)} of the ${kb(s.liveDocument.limitBytes)} limit` +
      `${s.liveDocument.sweepDue ? " (a stored deadline has passed; the next signed-in visit records it)" : ""}. ` +
      `Profiles: ${s.profiles} (every account that opened Handoff signed in, in any world: not participants). Notifications kept: ` +
      `${s.notifications.retained} (${s.notifications.unread} unread). Actions log rows kept: ${s.actionsLog.retainedRows}. Snapshots: ${s.snapshots}. ` +
      `Test worlds not read: ${r.scope.testWorldsNotRead}. Records left out (known test accounts): ${r.scope.recordsLeftOut.total}. ` +
      `Integrity: ${r.integrity.storedDocumentIssues} stored-document issues, ${r.integrity.recordsNotEvaluated} records not evaluated.`,
    "",
  );

  L.push("## Coverage limits", "");
  for (const line of r.coverage) L.push(`- ${line}`);
  L.push("");
  L.push("## Not tracked (never recorded, so never reported)", "");
  for (const line of r.notTracked) L.push(`- ${line}`);
  L.push("");
  L.push("Definitions of every figure are in the JSON's `definitions`.");
  return L.join("\n") + "\n";
}

function et(isoTime: string): string {
  return `${NEW_YORK.format(new Date(isoTime))} ET`;
}

function kb(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
}

function span(minutes: number | null): string {
  if (minutes === null) return "–";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 48 * 60) return `${(minutes / 60).toFixed(1)} h`;
  return `${(minutes / (24 * 60)).toFixed(1)} days`;
}

function row(label: string, dur: Duration | Waited): string {
  const range = dur.n > 0 ? `${span(dur.minMinutes)} to ${span(dur.maxMinutes)}` : "–";
  const without = "without" in dur ? String(dur.without) : "–";
  return `| ${label} | ${span(dur.medianMinutes)} | ${range} | ${dur.n} | ${without} |`;
}
