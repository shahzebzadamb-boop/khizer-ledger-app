import { LETTERHEAD_SRC, type ReceiptView } from "@/lib/receipts";
import { formatPKR } from "@/lib/money";

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "baseline" }}>
      <span style={{ color: "#222", fontSize: 11.5, fontWeight: 400 }}>{label}</span>
      <span
        style={{
          fontSize: strong ? 12.5 : 11.5,
          fontWeight: strong ? 700 : 500,
          textAlign: "right",
          maxWidth: "62%",
          wordBreak: "break-word",
        }}
      >
        {value}
      </span>
    </div>
  );
}

export function ReceiptDocument({ view }: { view: ReceiptView }) {
  return (
    <article
      className="receipt-sheet"
      style={{
        position: "relative",
        width: "210mm",
        height: "297mm",
        background: "#ffffff",
        color: "#111111",
        overflow: "hidden",
        boxSizing: "border-box",
        fontFamily: 'Helvetica, Arial, "Segoe UI", sans-serif',
        colorScheme: "light",
      }}
    >
      <img
        src={LETTERHEAD_SRC}
        alt="Capital Lagoon Luxury Living letterhead"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "210mm",
          height: "auto",
          display: "block",
          pointerEvents: "none",
        }}
      />
      <section
        style={{
          position: "absolute",
          top: "90mm",
          left: "14mm",
          right: "14mm",
          bottom: "56mm",
          overflow: "hidden",
        }}
      >
        <p
          style={{
            margin: 0,
            textAlign: "center",
            fontSize: "13pt",
            fontWeight: 700,
            letterSpacing: "0.08em",
          }}
        >
          PAYMENT RECEIPT
        </p>
        {view.receipt.status === "VOID" ? (
          <p style={{ margin: "4px 0 0", textAlign: "center", fontSize: "10pt", fontWeight: 700, letterSpacing: "0.14em" }}>
            VOID
          </p>
        ) : null}
        <div style={{ display: "grid", gap: 7, marginTop: 18 }}>
          <Row label="Receipt No." value={view.receipt.receiptNumber} />
          <Row label="Client" value={view.clientName} />
          <Row label="Flat" value={view.flat} />
          <Row label="Check-in" value={view.checkInLabel} />
          <Row label="Check-out" value={view.checkOutLabel} />
          <Row label="Stay" value={`${view.nights} Night${view.nights === 1 ? "" : "s"}`} />
        </div>
        <div style={{ height: 1, background: "#111", opacity: 0.7, margin: "14px 0" }} />
        <div style={{ display: "grid", gap: 9 }}>
          <Row label="Total Stay Amount" value={formatPKR(view.totalStayAmount)} />
          <Row label="Amount Received" value={formatPKR(view.amountReceived)} strong />
          <Row label="Total Received To Date" value={formatPKR(view.totalReceivedToDate)} />
          {view.paidInFull ? (
            <Row label="Balance" value="PAID IN FULL" strong />
          ) : (
            <Row label="Remaining Balance" value={formatPKR(view.remaining)} />
          )}
        </div>
        <div style={{ height: 1, background: "#111", opacity: 0.7, margin: "14px 0" }} />
        <div style={{ display: "grid", gap: 7 }}>
          <Row label="Payment Method" value={view.paymentMethod} />
          <Row label="Received By" value={view.receivedBy} />
        </div>
        <p style={{ margin: "18px 0 0", fontSize: "10.5pt", lineHeight: 1.45, fontWeight: 400 }}>
          {view.confirmation}
        </p>
        <p style={{ margin: "10px 0 0", fontSize: "10.5pt", lineHeight: 1.45, fontWeight: 400 }}>
          {view.thankYou}
        </p>
      </section>
    </article>
  );
}
