"use client";
import { useState, useMemo } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

type Screen = "home" | "detail" | "post";
type Category = "All" | "Furniture" | "Tickets" | "Textbooks" | "Free";
type SortOption = "Newest first" | "Price: low to high" | "Price: high to low";
type Program = "Wharton MBA" | "All Penn";
type PostCategory = "Furniture" | "Tickets" | "Textbooks";
type PostProgram = "Wharton MBA" | "Penn Undergrad" | "Other Grad";
type ContactMethod = "WhatsApp" | "Email";

interface Listing {
  id: number;
  title: string;
  price: number;
  category: Exclude<Category, "All" | "Free">;
  timeAgo: string;
  minsAgo: number;
  program: string;
  color: string;
  isFree?: boolean;
  event?: string;
  description: string;
  sellerName: string;
  sellerInitials: string;
  sellerProgram: string;
  sellerContact: "WhatsApp" | "Email";
}

interface TrendingEvent {
  name: string;
  dates: string;
  ticketCount: number;
  accentBg: string;
  accentText: string;
}

// ── Data ───────────────────────────────────────────────────────────────────────

const LISTINGS: Listing[] = [
  {
    id: 1, title: "Standing desk", price: 75, category: "Furniture",
    timeAgo: "2h ago", minsAgo: 120, program: "Wharton MBA", color: "#E8D5B7", isFree: false,
    description: "Solid standing desk in great condition. Electric height adjustment, holds up to 2 monitors. Used for one semester. Pick up in Steinberg-Dietrich Hall.",
    sellerName: "Sarah R.", sellerInitials: "SR", sellerProgram: "Wharton MBA '26", sellerContact: "WhatsApp",
  },
  {
    id: 2, title: "FNCE 611 textbook", price: 25, category: "Textbooks",
    timeAgo: "1d ago", minsAgo: 1440, program: "Wharton MBA", color: "#BFDBFE", isFree: false,
    description: "Corporate Finance textbook for FNCE 611. Some highlights in chapters 4-6, otherwise clean. Includes all problem sets.",
    sellerName: "James K.", sellerInitials: "JK", sellerProgram: "Wharton MBA '25", sellerContact: "Email",
  },
  {
    id: 3, title: "Kitchen set (pots, pans)", price: 0, category: "Furniture",
    timeAgo: "2d ago", minsAgo: 2880, program: "Penn Undergrad", color: "#BBF7D0", isFree: true,
    description: "Full kitchen set — 3 pots, 2 frying pans, colander, and utensil set. All in good shape, just don't need them anymore. Free to whoever can pick up.",
    sellerName: "Maya P.", sellerInitials: "MP", sellerProgram: "Penn Undergrad '25", sellerContact: "WhatsApp",
  },
  {
    id: 4, title: "76ers vs Celtics tickets", price: 85, category: "Tickets",
    timeAgo: "4h ago", minsAgo: 240, program: "Wharton MBA", color: "#FBCFE8", isFree: false,
    description: "Two tickets to 76ers vs Celtics on March 22. Section 113, Row F. Great seats close to the action. Selling because I have a conflict.",
    sellerName: "Tom B.", sellerInitials: "TB", sellerProgram: "Wharton MBA '26", sellerContact: "WhatsApp",
  },
  {
    id: 5, title: "Fight Night ticket x2", price: 120, category: "Tickets",
    timeAgo: "1h ago", minsAgo: 60, program: "Wharton MBA", color: "#FECACA", event: "Fight Night",
    description: "Two tickets to Wharton Fight Night 2026 on March 28. General admission, includes open bar and dinner. Face value.",
    sellerName: "Alex G.", sellerInitials: "AG", sellerProgram: "Wharton MBA '26", sellerContact: "WhatsApp",
  },
  {
    id: 6, title: "Desk lamp", price: 15, category: "Furniture",
    timeAgo: "3h ago", minsAgo: 180, program: "Wharton MBA", color: "#FDE68A", isFree: false,
    description: "LED desk lamp with adjustable brightness and color temperature. USB-C charging port on the base. Like new.",
    sellerName: "Priya S.", sellerInitials: "PS", sellerProgram: "Wharton MBA '26", sellerContact: "Email",
  },
  {
    id: 7, title: "MGMT 611 textbook", price: 30, category: "Textbooks",
    timeAgo: "5h ago", minsAgo: 300, program: "Penn Undergrad", color: "#BFDBFE", isFree: false,
    description: "Strategic Management textbook, 4th edition. Light pencil markings in first few chapters, mostly clean. Required for MGMT 611.",
    sellerName: "Chris L.", sellerInitials: "CL", sellerProgram: "Penn Undergrad '26", sellerContact: "Email",
  },
  {
    id: 8, title: "WAAAM Vegas Ticket", price: 200, category: "Tickets",
    timeAgo: "30m ago", minsAgo: 30, program: "Wharton MBA", color: "#DDD6FE", event: "WAM Vegas",
    description: "One spot at a shared table for WAM Vegas (April 3-5). Includes hotel split and event entry. Great group already formed.",
    sellerName: "Dana W.", sellerInitials: "DW", sellerProgram: "Wharton MBA '26", sellerContact: "WhatsApp",
  },
];

const TRENDING_EVENTS: TrendingEvent[] = [
  { name: "Fight Night",     dates: "March 28",    ticketCount: 12, accentBg: "#fce7f3", accentText: "#9d174d" },
  { name: "WAM Vegas",       dates: "April 3–5",   ticketCount: 9,  accentBg: "#ede9fe", accentText: "#6d28d9" },
  { name: "Coachella Wk 1",  dates: "April 10–12", ticketCount: 6,  accentBg: "#fef3c7", accentText: "#92400e" },
];

const EVENT_OPTIONS = [
  "Fight Night 2026 (March 28)",
  "WAM Vegas (April 3–5)",
  "Coachella Wk 1 (April 10–12)",
  "Spring Formal (April 12)",
  "Other",
];

// ── App shell ──────────────────────────────────────────────────────────────────

export default function PennXchangePage() {
  const [screen, setScreen] = useState<Screen>("home");
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);

  function openDetail(l: Listing) { setSelectedListing(l); setScreen("detail"); }
  function goHome() { setScreen("home"); setSelectedListing(null); }
  function goPost() { setScreen("post"); }

  return (
    <div style={{ position: "fixed", inset: 0, background: "#f3f4f6", display: "flex", flexDirection: "column", borderTop: "1px solid #e5e5e5" }}>
      {screen === "home"   && <HomeScreen   onSelectListing={openDetail} onPost={goPost} />}
      {screen === "detail" && <DetailScreen listing={selectedListing!}  onBack={goHome} />}
      {screen === "post"   && <PostScreen   onBack={goHome} />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Screen 1 — Homepage Feed
// ══════════════════════════════════════════════════════════════════════════════

function HomeScreen({ onSelectListing, onPost }: { onSelectListing: (l: Listing) => void; onPost: () => void }) {
  const [search, setSearch]     = useState("");
  const [category, setCategory] = useState<Category>("All");
  const [scope, setScope]       = useState<Program>("Wharton MBA");
  const [sort, setSort]         = useState<SortOption>("Newest first");

  const filtered = useMemo(() => {
    let r = LISTINGS;
    if (scope === "Wharton MBA") r = r.filter((l) => l.program === "Wharton MBA");
    if (category === "Free")     r = r.filter((l) => l.isFree);
    else if (category !== "All") r = r.filter((l) => l.category === category);
    if (search.trim())           r = r.filter((l) => l.title.toLowerCase().includes(search.toLowerCase()));
    if (sort === "Newest first")          r = [...r].sort((a, b) => a.minsAgo - b.minsAgo);
    if (sort === "Price: low to high")    r = [...r].sort((a, b) => a.price - b.price);
    if (sort === "Price: high to low")    r = [...r].sort((a, b) => b.price - a.price);
    return r;
  }, [search, category, scope, sort]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ background: "#fff", padding: "16px 20px 0", flexShrink: 0, boxShadow: "0 1px 0 #e5e5e5" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: "#011F5B", letterSpacing: "-0.5px" }}>Penn</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: "#990000", letterSpacing: "-0.5px" }}>Xchange</span>
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 1 }}>Buy, sell &amp; trade at Penn</div>
          </div>
          <button
            onClick={onPost}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "#011F5B", color: "#fff", border: "none",
              borderRadius: 8, padding: "9px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer",
            }}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Post item
          </button>
        </div>

        {/* Search */}
        <div style={{ position: "relative", marginBottom: 12 }}>
          <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#9ca3af", fontSize: 15 }}>🔍</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search listings... e.g. 'standing desk'"
            style={{
              width: "100%", boxSizing: "border-box", padding: "9px 12px 9px 34px",
              borderRadius: 8, border: "1.5px solid #e5e5e5", fontSize: 14,
              outline: "none", fontFamily: "inherit", background: "#f9fafb", color: "#111",
            }}
          />
        </div>

        {/* Category pills */}
        <div style={{ display: "flex", gap: 7, marginBottom: 10, overflowX: "auto", paddingBottom: 2 }}>
          {(["All", "Furniture", "Tickets", "Textbooks", "Free"] as Category[]).map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              style={{
                flexShrink: 0, padding: "5px 14px", fontSize: 13, fontWeight: 600,
                borderRadius: 20, border: "none", cursor: "pointer", transition: "all 0.12s",
                background: category === cat ? "#011F5B" : "#f3f4f6",
                color: category === cat ? "#fff" : "#4b5563",
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Scope toggle + sort */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 14 }}>
          <div style={{ display: "flex", gap: 6 }}>
            {(["Wharton MBA", "All Penn"] as Program[]).map((p) => (
              <button
                key={p}
                onClick={() => setScope(p)}
                style={{
                  padding: "4px 13px", fontSize: 12, fontWeight: 600, borderRadius: 20,
                  border: `1.5px solid ${scope === p ? "#011F5B" : "#e5e5e5"}`,
                  cursor: "pointer", transition: "all 0.12s",
                  background: scope === p ? "#eff3ff" : "#fff",
                  color: scope === p ? "#011F5B" : "#6b7280",
                }}
              >
                {p}
              </button>
            ))}
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            style={{
              padding: "5px 10px", borderRadius: 7, border: "1.5px solid #e5e5e5",
              fontSize: 12, fontFamily: "inherit", color: "#374151", background: "#fff",
              cursor: "pointer", outline: "none", fontWeight: 500,
            }}
          >
            <option>Newest first</option>
            <option>Price: low to high</option>
            <option>Price: high to low</option>
          </select>
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 40px" }}>
        {/* Trending events */}
        <div style={{ marginBottom: 24 }}>
          <SectionLabel>Trending Events</SectionLabel>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
            {TRENDING_EVENTS.map((evt) => (
              <div
                key={evt.name}
                onClick={() => setCategory("Tickets")}
                style={{
                  flexShrink: 0, background: "#fff", border: "1.5px solid #e5e5e5",
                  borderRadius: 12, padding: "12px 14px", cursor: "pointer",
                  minWidth: 150, transition: "box-shadow 0.12s",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0d0d0d", marginBottom: 2 }}>{evt.name}</div>
                <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 8 }}>{evt.dates}</div>
                <span
                  style={{
                    display: "inline-block", fontSize: 11, fontWeight: 600,
                    padding: "2px 9px", borderRadius: 10,
                    background: evt.accentBg, color: evt.accentText,
                  }}
                >
                  {evt.ticketCount} tickets
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Listings grid */}
        <SectionLabel>Recent Listings</SectionLabel>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#9ca3af", fontSize: 14 }}>
            No listings match your filters.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {filtered.map((l) => (
              <ListingCard key={l.id} listing={l} onClick={() => onSelectListing(l)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Screen 2 — Item Detail
// ══════════════════════════════════════════════════════════════════════════════

function DetailScreen({ listing, onBack }: { listing: Listing; onBack: () => void }) {
  const [offerAmount, setOfferAmount] = useState("");
  const [offerSent, setOfferSent]     = useState(false);
  const [flagged, setFlagged]         = useState(false);

  function sendOffer() {
    if (!offerAmount.trim()) return;
    setOfferSent(true);
  }

  const catStyle = CATEGORY_TAG_STYLES[listing.category] ?? { bg: "#f3f4f6", text: "#374151" };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Nav bar */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e5e5", padding: "14px 20px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#374151", padding: "0 4px", lineHeight: 1 }}>
          ←
        </button>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#0d0d0d" }}>Listing detail</span>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 0 48px" }}>
        {/* Photo */}
        <div
          style={{
            height: 220, background: listing.color,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 64,
          }}
        >
          {CATEGORY_EMOJI[listing.category]}
        </div>

        <div style={{ padding: "20px 20px 0" }}>
          {/* Title + price */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0d0d0d", flex: 1, lineHeight: 1.3 }}>
              {listing.title}
            </h1>
            <div style={{ fontSize: 24, fontWeight: 800, color: listing.isFree ? "#059669" : "#011F5B", flexShrink: 0 }}>
              {listing.isFree ? "Free" : `$${listing.price}`}
            </div>
          </div>

          {/* Tags row */}
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 16 }}>
            <Pill bg={catStyle.bg} text={catStyle.text}>{listing.category}</Pill>
            <Pill bg="#ede9fe" text="#6d28d9">{listing.program === "Wharton MBA" ? "MBA" : "Undergrad"}</Pill>
            <Pill bg="#f3f4f6" text="#6b7280">{listing.timeAgo}</Pill>
            {listing.event && <Pill bg="#fce7f3" text="#9d174d">{listing.event}</Pill>}
          </div>

          {/* Description */}
          <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.65, margin: "0 0 20px" }}>
            {listing.description}
          </p>

          <Divider />

          {/* Seller */}
          <div style={{ padding: "16px 0" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9ca3af", marginBottom: 10 }}>
              Seller
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 44, height: 44, borderRadius: "50%", background: "#011F5B",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 15, fontWeight: 700, color: "#fff", flexShrink: 0,
                }}
              >
                {listing.sellerInitials}
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0d0d0d" }}>{listing.sellerName}</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>{listing.sellerProgram}</div>
              </div>
              <div style={{ marginLeft: "auto" }}>
                <Pill
                  bg={listing.sellerContact === "WhatsApp" ? "#dcfce7" : "#dbeafe"}
                  text={listing.sellerContact === "WhatsApp" ? "#166534" : "#1e40af"}
                >
                  {listing.sellerContact}
                </Pill>
              </div>
            </div>
          </div>

          <Divider />

          {/* Make an offer */}
          <div style={{ padding: "16px 0" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#0d0d0d", marginBottom: 12 }}>Make an offer</div>
            {offerSent ? (
              <div style={{ background: "#dcfce7", border: "1px solid #86efac", borderRadius: 10, padding: "14px 16px", fontSize: 14, color: "#166534", fontWeight: 600 }}>
                ✓ Offer sent! The seller will reach out via {listing.sellerContact}.
              </div>
            ) : (
              <>
                <div style={{ position: "relative", marginBottom: 10 }}>
                  <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", fontSize: 15, color: "#9ca3af", fontWeight: 600 }}>$</span>
                  <input
                    type="number"
                    value={offerAmount}
                    onChange={(e) => setOfferAmount(e.target.value)}
                    placeholder="Your offer"
                    style={{
                      width: "100%", boxSizing: "border-box", padding: "11px 12px 11px 28px",
                      borderRadius: 8, border: "1.5px solid #e5e5e5", fontSize: 15,
                      fontFamily: "inherit", outline: "none", color: "#111",
                    }}
                  />
                </div>
                <button
                  onClick={sendOffer}
                  disabled={!offerAmount.trim()}
                  style={{
                    width: "100%", padding: "12px", borderRadius: 8, border: "none",
                    background: offerAmount.trim() ? "#011F5B" : "#e5e5e5",
                    color: offerAmount.trim() ? "#fff" : "#9ca3af",
                    fontSize: 15, fontWeight: 700, cursor: offerAmount.trim() ? "pointer" : "not-allowed",
                    marginBottom: 8,
                  }}
                >
                  Send offer
                </button>
                <p style={{ fontSize: 12, color: "#9ca3af", margin: 0, textAlign: "center", lineHeight: 1.5 }}>
                  Sends your offer and contact info to the seller via {listing.sellerContact}. No payment required.
                </p>
              </>
            )}
          </div>

          {/* Message seller */}
          <button
            style={{
              width: "100%", padding: "12px", borderRadius: 8, background: "#fff",
              border: "1.5px solid #011F5B", color: "#011F5B",
              fontSize: 15, fontWeight: 600, cursor: "pointer", marginBottom: 16,
            }}
          >
            Message seller directly
          </button>

          {/* Flag */}
          <div style={{ display: "flex", justifyContent: "center", gap: 20, marginBottom: 10 }}>
            <button
              onClick={() => setFlagged(!flagged)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 12, color: flagged ? "#dc2626" : "#9ca3af", fontWeight: 500,
              }}
            >
              {flagged ? "🚩 Flagged" : "🏳️ Flag listing"}
            </button>
            <span style={{ fontSize: 12, color: "#9ca3af" }}>·</span>
            <button
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#9ca3af", fontWeight: 500 }}
            >
              Already sold? Let us know
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Screen 3 — Post a Listing
// ══════════════════════════════════════════════════════════════════════════════

function PostScreen({ onBack }: { onBack: () => void }) {
  const [title, setTitle]               = useState("");
  const [category, setCategory]         = useState<PostCategory | null>(null);
  const [event, setEvent]               = useState("");
  const [description, setDescription]  = useState("");
  const [price, setPrice]               = useState("");
  const [isFree, setIsFree]             = useState(false);
  const [name, setName]                 = useState("");
  const [program, setProgram]           = useState<PostProgram | null>(null);
  const [contact, setContact]           = useState<ContactMethod>("WhatsApp");
  const [contactInfo, setContactInfo]   = useState("");
  const [published, setPublished]       = useState(false);

  const canPublish = title.trim() && category && name.trim() && contactInfo.trim();

  function publish() {
    if (!canPublish) return;
    setPublished(true);
  }

  if (published) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, gap: 16 }}>
        <div style={{ fontSize: 56 }}>🎉</div>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0d0d0d" }}>Listing posted!</h2>
        <p style={{ margin: 0, fontSize: 14, color: "#6b7280", textAlign: "center", maxWidth: 280, lineHeight: 1.6 }}>
          Your listing <strong>{title}</strong> is now live on PennXchange.
        </p>
        <button
          onClick={onBack}
          style={{
            marginTop: 8, padding: "12px 32px", borderRadius: 8, border: "none",
            background: "#011F5B", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer",
          }}
        >
          Back to listings
        </button>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Nav */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e5e5", padding: "14px 20px", display: "flex", alignItems: "center", flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#374151", padding: "0 4px", lineHeight: 1 }}>
          ←
        </button>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#0d0d0d", flex: 1, textAlign: "center" }}>Post a listing</span>
        <button
          onClick={publish}
          disabled={!canPublish}
          style={{
            padding: "7px 16px", borderRadius: 8, border: "none",
            background: canPublish ? "#011F5B" : "#e5e5e5",
            color: canPublish ? "#fff" : "#9ca3af",
            fontSize: 14, fontWeight: 700, cursor: canPublish ? "pointer" : "not-allowed",
          }}
        >
          Publish
        </button>
      </div>

      {/* Scrollable form */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 48px" }}>
        {/* Photo upload */}
        <div
          style={{
            border: "2px dashed #d1d5db", borderRadius: 12,
            height: 140, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 6,
            cursor: "pointer", marginBottom: 20, background: "#fff",
          }}
        >
          <span style={{ fontSize: 28 }}>📷</span>
          <span style={{ fontSize: 13, color: "#9ca3af", fontWeight: 500 }}>Tap to add a photo</span>
        </div>

        <FormCard>
          {/* Title */}
          <FormLabel>Title</FormLabel>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Standing desk, Fight Night ticket"
            style={inputStyle}
          />

          {/* Category */}
          <FormLabel style={{ marginTop: 16 }}>Category</FormLabel>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(["Furniture", "Tickets", "Textbooks"] as PostCategory[]).map((cat) => (
              <button
                key={cat}
                onClick={() => { setCategory(cat); if (cat !== "Tickets") setEvent(""); }}
                style={{
                  padding: "6px 16px", fontSize: 13, fontWeight: 600, borderRadius: 20,
                  border: `1.5px solid ${category === cat ? "#011F5B" : "#e5e5e5"}`,
                  cursor: "pointer",
                  background: category === cat ? "#011F5B" : "#fff",
                  color: category === cat ? "#fff" : "#4b5563",
                }}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Event dropdown — only when Tickets selected */}
          {category === "Tickets" && (
            <div style={{ marginTop: 14, background: "#fdf2f8", borderRadius: 10, padding: "14px 16px", border: "1px solid #fbcfe8" }}>
              <FormLabel style={{ color: "#9d174d" }}>Which event?</FormLabel>
              <select
                value={event}
                onChange={(e) => setEvent(e.target.value)}
                style={{ ...inputStyle, background: "#fff" }}
              >
                <option value="">Select an event…</option>
                {EVENT_OPTIONS.map((o) => <option key={o}>{o}</option>)}
              </select>
              <p style={{ margin: "8px 0 0", fontSize: 11, color: "#be185d" }}>
                Your listing will be grouped under this event
              </p>
            </div>
          )}

          {/* Description */}
          <FormLabel style={{ marginTop: 16 }}>Description</FormLabel>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the item — condition, size, pickup location, etc."
            rows={3}
            style={{ ...inputStyle, resize: "vertical" }}
          />

          {/* Price */}
          <FormLabel style={{ marginTop: 16 }}>Price</FormLabel>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ position: "relative", flex: 1 }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9ca3af", fontWeight: 600 }}>$</span>
              <input
                type="number"
                value={isFree ? "" : price}
                onChange={(e) => setPrice(e.target.value)}
                disabled={isFree}
                placeholder="0"
                style={{ ...inputStyle, paddingLeft: 26, opacity: isFree ? 0.4 : 1 }}
              />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#374151", cursor: "pointer", flexShrink: 0 }}>
              <input
                type="checkbox"
                checked={isFree}
                onChange={(e) => setIsFree(e.target.checked)}
                style={{ width: 16, height: 16, cursor: "pointer" }}
              />
              Free
            </label>
          </div>
        </FormCard>

        {/* About You */}
        <FormCard style={{ marginTop: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#0d0d0d", marginBottom: 14 }}>About You</div>

          <FormLabel>Name</FormLabel>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="First name + last initial (e.g. Sarah R.)"
            style={inputStyle}
          />

          <FormLabel style={{ marginTop: 16 }}>Program</FormLabel>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(["Wharton MBA", "Penn Undergrad", "Other Grad"] as PostProgram[]).map((p) => (
              <button
                key={p}
                onClick={() => setProgram(p)}
                style={{
                  padding: "5px 14px", fontSize: 12, fontWeight: 600, borderRadius: 20,
                  border: `1.5px solid ${program === p ? "#6d28d9" : "#e5e5e5"}`,
                  cursor: "pointer",
                  background: program === p ? "#ede9fe" : "#fff",
                  color: program === p ? "#6d28d9" : "#4b5563",
                }}
              >
                {p}
              </button>
            ))}
          </div>

          <FormLabel style={{ marginTop: 16 }}>Contact via</FormLabel>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            {(["WhatsApp", "Email"] as ContactMethod[]).map((m) => (
              <button
                key={m}
                onClick={() => setContact(m)}
                style={{
                  padding: "5px 14px", fontSize: 12, fontWeight: 600, borderRadius: 20,
                  border: `1.5px solid ${contact === m ? (m === "WhatsApp" ? "#059669" : "#2563eb") : "#e5e5e5"}`,
                  cursor: "pointer",
                  background: contact === m ? (m === "WhatsApp" ? "#dcfce7" : "#dbeafe") : "#fff",
                  color: contact === m ? (m === "WhatsApp" ? "#166534" : "#1e40af") : "#4b5563",
                }}
              >
                {m === "WhatsApp" ? "💬 WhatsApp" : "✉️ Email"}
              </button>
            ))}
          </div>

          <FormLabel>{contact === "WhatsApp" ? "WhatsApp number" : "Email address"}</FormLabel>
          <input
            value={contactInfo}
            onChange={(e) => setContactInfo(e.target.value)}
            placeholder={contact === "WhatsApp" ? "+1 (215) 555-0100" : "you@wharton.upenn.edu"}
            style={inputStyle}
          />
        </FormCard>
      </div>
    </div>
  );
}

// ── Shared small components ────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "#9ca3af", marginBottom: 10 }}>
      {children}
    </div>
  );
}

function Pill({ bg, text, children }: { bg: string; text: string; children: React.ReactNode }) {
  return (
    <span style={{ display: "inline-block", fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 12, background: bg, color: text }}>
      {children}
    </span>
  );
}

function Divider() {
  return <hr style={{ border: "none", borderTop: "1px solid #f3f4f6", margin: 0 }} />;
}

function FormCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: "18px 16px", border: "1px solid #e5e5e5", ...style }}>
      {children}
    </div>
  );
}

function FormLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 6, ...style }}>
      {children}
    </div>
  );
}

// ── ListingCard ────────────────────────────────────────────────────────────────

function ListingCard({ listing, onClick }: { listing: Listing; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const isWharton = listing.program === "Wharton MBA";
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "#fff", borderRadius: 12, overflow: "hidden", cursor: "pointer",
        border: "1.5px solid #e5e5e5", transition: "all 0.12s",
        boxShadow: hovered ? "0 4px 14px rgba(0,0,0,0.08)" : "none",
        transform: hovered ? "translateY(-1px)" : "none",
      }}
    >
      {/* Photo */}
      <div style={{ height: 110, background: listing.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 38 }}>
        {CATEGORY_EMOJI[listing.category]}
      </div>
      {/* Info */}
      <div style={{ padding: "10px 11px 12px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0d0d0d", marginBottom: 4, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {listing.title}
        </div>
        <div style={{ fontSize: 16, fontWeight: 800, color: listing.isFree ? "#059669" : "#011F5B", marginBottom: 8 }}>
          {listing.isFree ? "Free" : `$${listing.price}`}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 11, color: "#9ca3af" }}>{listing.timeAgo}</span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 8,
            background: isWharton ? "#ede9fe" : "#f3f4f6",
            color: isWharton ? "#6d28d9" : "#6b7280",
          }}>
            {isWharton ? "MBA" : "Undergrad"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_EMOJI: Record<string, string> = {
  Furniture:   "🪑",
  Tickets:     "🎟️",
  Textbooks:   "📚",
  Electronics: "💻",
  Clothing:    "👗",
};

const CATEGORY_TAG_STYLES: Record<string, { bg: string; text: string }> = {
  Furniture:  { bg: "#fef3c7", text: "#92400e" },
  Tickets:    { bg: "#fce7f3", text: "#9d174d" },
  Textbooks:  { bg: "#dbeafe", text: "#1e40af" },
  Electronics:{ bg: "#f3f4f6", text: "#374151" },
  Clothing:   { bg: "#d1fae5", text: "#065f46" },
};

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "10px 12px",
  borderRadius: 8, border: "1.5px solid #e5e5e5", fontSize: 14,
  fontFamily: "inherit", outline: "none", color: "#111", background: "#fff",
};
