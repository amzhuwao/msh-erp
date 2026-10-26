"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";

interface Outlet {
  id: string;
  code: string;
  name: string;
  menuItems: MenuItem[];
}

interface MenuItem {
  id: string;
  code: string;
  name: string;
  category: string;
  price: string;
}

interface CartItem {
  menuItem: MenuItem;
  quantity: number;
}

interface PosOrder {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: string;
  paymentMethod: string | null;
  roomNumber: string | null;
  walkInGuestName?: string | null;
  groupReservation?: { groupName: string; groupCode: string } | null;
  outlet: { name: string };
}

export default function PosPage() {
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [selectedOutlet, setSelectedOutlet] = useState<string>("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<PosOrder[]>([]);
  const [roomNumber, setRoomNumber] = useState("");
  const [billTo, setBillTo] = useState<"ROOM" | "GROUP">("ROOM");
  const [walkInGuestName, setWalkInGuestName] = useState("");
  const [walkInGuestPhone, setWalkInGuestPhone] = useState("");
  const [chargeTarget, setChargeTarget] = useState<{ guestName: string; groupName?: string; groupCode?: string } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD" | "BANK_TRANSFER" | "ECOCASH" | "ONEMONEY" | "ROOM_CHARGE">("CASH");
  const [vatRate, setVatRate] = useState(0.15);
  const [orderBilling, setOrderBilling] = useState<"PAY_NOW" | "ROOM" | "GROUP">("PAY_NOW");
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [payInfo, setPayInfo] = useState<{
    bankTransfer: { bankName: string | null; accountName: string | null; accountNumber: string | null; branch: string | null; swiftCode: string | null };
    ecocash: { number: string | null; merchant: string | null };
    onemoney: { number: string | null };
  } | null>(null);

  function loadMenu() {
    apiFetch<{ outlets: Outlet[] }>("/api/pos/menu").then((data) => {
      setOutlets(data.outlets);
      if (data.outlets.length > 0 && !selectedOutlet) {
        setSelectedOutlet(data.outlets[0]!.id);
      }
    });
    apiFetch<{ items: PosOrder[] }>("/api/pos/orders").then((d) => setOrders(d.items));
  }

  useEffect(() => {
    loadMenu();
    apiFetch<{ vatRatePercent?: string | number }>("/api/property")
      .then((property) => setVatRate(Number(property.vatRatePercent ?? 15) / 100))
      .catch(() => undefined);
    apiFetch<typeof payInfo>("/api/property/payment-instructions").then(setPayInfo).catch(() => undefined);
  }, []);

  const outlet = outlets.find((o) => o.id === selectedOutlet);
  const categories = outlet
    ? [...new Set(outlet.menuItems.map((m) => m.category))].sort((a, b) =>
        a === "Breakfast" ? -1 : b === "Breakfast" ? 1 : 0,
      )
    : [];

  const subTotal = cart.reduce((s, c) => s + Number(c.menuItem.price) * c.quantity, 0);
  const taxAmount = cart.reduce((s, c) => s + Number(c.menuItem.price) * c.quantity * vatRate, 0);
  const total = subTotal + taxAmount;

  function addToCart(item: MenuItem) {
    setCart((prev) => {
      const existing = prev.find((c) => c.menuItem.id === item.id);
      if (existing) {
        return prev.map((c) =>
          c.menuItem.id === item.id ? { ...c, quantity: c.quantity + 1 } : c,
        );
      }
      return [...prev, { menuItem: item, quantity: 1 }];
    });
  }

  async function submitOrder() {
    if (cart.length === 0 || !selectedOutlet) return;
    const postsToRoom = orderBilling === "ROOM" || orderBilling === "GROUP";
    if (postsToRoom && !chargeTarget) {
      alert("Validate the checked-in room before creating this order.");
      return;
    }
    setLoading(true);
    try {
      const order = await apiFetch<{ id: string }>("/api/pos/orders", {
        method: "POST",
        body: JSON.stringify({
          outletId: selectedOutlet,
          walkInGuestName: walkInGuestName.trim() || undefined,
          walkInGuestPhone: walkInGuestPhone.trim() || undefined,
          items: cart.map((c) => ({ menuItemId: c.menuItem.id, quantity: c.quantity })),
        }),
      });
      setLastOrderId(order.id);
      setCart([]);
      if (postsToRoom) {
        setPaymentMethod("ROOM_CHARGE");
        try {
          await apiFetch(`/api/pos/orders/${order.id}/pay`, {
            method: "POST",
            body: JSON.stringify({ paymentMethod: "ROOM_CHARGE", roomNumber, billTo: orderBilling }),
          });
          setLastOrderId(null);
          setRoomNumber("");
          setChargeTarget(null);
          setOrderBilling("PAY_NOW");
          loadMenu();
          alert(orderBilling === "GROUP" ? "Order posted to group account" : "Order posted to guest folio");
        } catch (err) {
          alert(err instanceof Error ? `Order created, but room posting failed: ${err.message}` : "Order created, but room posting failed");
        }
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not create order");
    } finally {
      setLoading(false);
    }
  }

  async function payOrder() {
    if (!lastOrderId) return;
    setLoading(true);
    try {
      await apiFetch(`/api/pos/orders/${lastOrderId}/pay`, {
        method: "POST",
        body: JSON.stringify({
          paymentMethod,
          roomNumber: paymentMethod === "ROOM_CHARGE" ? roomNumber : undefined,
          billTo: paymentMethod === "ROOM_CHARGE" ? billTo : undefined,
        }),
      });
      setLastOrderId(null);
      setRoomNumber("");
      setChargeTarget(null);
      loadMenu();
      alert("Payment processed");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setLoading(false);
    }
  }

  async function validateChargeTarget() {
    setChargeTarget(null);
    try {
      const target = await apiFetch<{ guestName: string; groupName?: string; groupCode?: string }>("/api/pos/room-charge-validate", {
        method: "POST",
        body: JSON.stringify({ roomNumber: roomNumber.trim(), billTo }),
      });
      setChargeTarget(target);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not validate room");
    }
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Restaurant & Bar POS"
        description="Terrace Restaurant · Skyview Lounge"
      />

      <div className="flex gap-2 mb-4">
        {outlets.map((o) => (
          <button
            key={o.id}
            onClick={() => { setSelectedOutlet(o.id); setCart([]); setLastOrderId(null); }}
            className={`px-4 py-2 rounded-lg text-sm ${
              selectedOutlet === o.id ? "bg-[hsl(var(--primary))] text-white" : "bg-white border border-[hsl(var(--border))]"
            }`}
          >
            {o.name}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-[hsl(var(--border))] p-4">
          {categories.map((cat) => (
            <div key={cat} className="mb-6">
              <h2 className="text-sm font-semibold text-[hsl(var(--accent))] uppercase tracking-wide mb-2">{cat}</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {outlet?.menuItems.filter((m) => m.category === cat).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => addToCart(item)}
                    className="text-left border border-[hsl(var(--border))] rounded-lg p-3 hover:border-[#4a90a4] hover:bg-slate-50 transition"
                  >
                    <div className="font-medium text-sm">{item.name}</div>
                    <div className="text-[hsl(var(--primary))] font-semibold mt-1">${Number(item.price).toFixed(2)}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-[hsl(var(--border))] p-4">
          <h2 className="font-semibold text-[hsl(var(--primary))] mb-3">Current Bill</h2>
          {cart.length === 0 && !lastOrderId && (
            <p className="text-slate-400 text-sm">Select menu items to start an order.</p>
          )}
          <ul className="space-y-2 text-sm mb-4">
            {cart.map((c) => (
              <li key={c.menuItem.id} className="flex justify-between">
                <span>{c.quantity}× {c.menuItem.name}</span>
                <span>${(Number(c.menuItem.price) * c.quantity).toFixed(2)}</span>
              </li>
            ))}
          </ul>
          {cart.length > 0 && (
            <>
              <div className="border-t pt-3 mt-2 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Walk-in guest (optional)</p>
                <input aria-label="Walk-in guest name" placeholder="Guest name" className="w-full border rounded-lg px-3 py-2 text-sm" value={walkInGuestName} onChange={(e) => setWalkInGuestName(e.target.value)} />
                <input aria-label="Walk-in guest contact number" placeholder="Contact number" className="w-full border rounded-lg px-3 py-2 text-sm" value={walkInGuestPhone} onChange={(e) => setWalkInGuestPhone(e.target.value)} />
              </div>
              <div className="border-t pt-3 mt-3 space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="order-billing">Charge this order to</label>
                <select
                  id="order-billing"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={orderBilling}
                  onChange={(e) => {
                    const value = e.target.value as typeof orderBilling;
                    setOrderBilling(value);
                    if (value === "ROOM" || value === "GROUP") setBillTo(value);
                    setChargeTarget(null);
                  }}
                >
                  <option value="PAY_NOW">Pay at POS</option>
                  <option value="ROOM">Checked-in guest room folio</option>
                  <option value="GROUP">Group account via member room</option>
                </select>
                {(orderBilling === "ROOM" || orderBilling === "GROUP") && (
                  <>
                    <label className="block text-xs text-slate-600" htmlFor="new-order-room">
                      {orderBilling === "GROUP" ? "Checked-in group member room" : "Checked-in guest room"}
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="new-order-room"
                        placeholder="Room number"
                        className="min-w-0 flex-1 border rounded-lg px-3 py-2 text-sm"
                        value={roomNumber}
                        onChange={(e) => { setRoomNumber(e.target.value); setChargeTarget(null); }}
                      />
                      <button type="button" onClick={validateChargeTarget} disabled={!roomNumber.trim() || loading} className="border rounded-lg px-3 py-2 text-sm disabled:opacity-50">Validate</button>
                    </div>
                    {chargeTarget && <p className="text-xs text-emerald-700">{orderBilling === "GROUP" ? `Group ${chargeTarget.groupName} (${chargeTarget.groupCode}) · member: ${chargeTarget.guestName}` : `Guest: ${chargeTarget.guestName}`}</p>}
                  </>
                )}
              </div>
              <div className="border-t pt-2 text-sm space-y-1">
                <div className="flex justify-between"><span>Subtotal</span><span>${subTotal.toFixed(2)}</span></div>
                <div className="flex justify-between text-slate-500"><span>VAT {(vatRate * 100).toFixed(2).replace(/\.00$/, "")}%</span><span>${taxAmount.toFixed(2)}</span></div>
                <div className="flex justify-between font-semibold text-[hsl(var(--primary))]"><span>Total</span><span>${total.toFixed(2)}</span></div>
              </div>
              <button
                onClick={submitOrder}
                disabled={loading || ((orderBilling === "ROOM" || orderBilling === "GROUP") && !chargeTarget)}
                className="w-full mt-4 bg-[hsl(var(--primary))] text-white py-2 rounded-lg text-sm disabled:opacity-50"
              >
                {orderBilling === "ROOM" ? "Create & post to guest folio" : orderBilling === "GROUP" ? "Create & post to group account" : "Create Order"}
              </button>
            </>
          )}

          {lastOrderId && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm text-emerald-600 mb-3">Order created — ready to pay</p>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm mb-2"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
              >
                <option value="CASH">Cash</option>
                <option value="CARD">Card</option>
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="ECOCASH">EcoCash</option>
                <option value="ONEMONEY">NetOne OneMoney</option>
                <option value="ROOM_CHARGE">Room Charge</option>
              </select>
              {paymentMethod === "ROOM_CHARGE" && (
                <div className="space-y-2 mb-2">
                  <label className="block text-xs text-slate-600" htmlFor="pos-bill-to">Post bill to</label>
                  <select id="pos-bill-to" className="w-full border rounded-lg px-3 py-2 text-sm" value={billTo} onChange={(e) => { setBillTo(e.target.value as typeof billTo); setChargeTarget(null); }}>
                    <option value="ROOM">Checked-in guest room folio</option>
                    <option value="GROUP">Group account (use a checked-in member room)</option>
                  </select>
                  <label className="block text-xs text-slate-600" htmlFor="pos-charge-room">{billTo === "GROUP" ? "Checked-in group member room" : "Checked-in guest room"}</label>
                  <div className="flex gap-2">
                    <input id="pos-charge-room" placeholder="Room number" className="min-w-0 flex-1 border rounded-lg px-3 py-2 text-sm" value={roomNumber} onChange={(e) => { setRoomNumber(e.target.value); setChargeTarget(null); }} />
                    <button type="button" onClick={validateChargeTarget} disabled={!roomNumber.trim() || loading} className="border rounded-lg px-3 py-2 text-sm disabled:opacity-50">Validate</button>
                  </div>
                  {chargeTarget && <p className="text-xs text-emerald-700">{billTo === "GROUP" ? `Group ${chargeTarget.groupName} (${chargeTarget.groupCode}) · member: ${chargeTarget.guestName}` : `Guest: ${chargeTarget.guestName}`}</p>}
                </div>
              )}
              {payInfo && (paymentMethod === "BANK_TRANSFER" || paymentMethod === "ECOCASH" || paymentMethod === "ONEMONEY") && (
                <div className="text-xs bg-amber-50 border border-amber-100 rounded p-2 mb-2">
                  {paymentMethod === "BANK_TRANSFER" && (
                    <p>{payInfo.bankTransfer.bankName} {payInfo.bankTransfer.branch} · {payInfo.bankTransfer.accountName} · {payInfo.bankTransfer.accountNumber} · SWIFT {payInfo.bankTransfer.swiftCode}</p>
                  )}
                  {paymentMethod === "ECOCASH" && <p>EcoCash {payInfo.ecocash.number} · Merchant {payInfo.ecocash.merchant}</p>}
                  {paymentMethod === "ONEMONEY" && <p>NetOne / OneMoney {payInfo.onemoney.number}</p>}
                </div>
              )}
              <button
                onClick={payOrder}
                disabled={loading}
                className="w-full bg-emerald-600 text-white py-2 rounded-lg text-sm disabled:opacity-50"
              >
                Process Payment
              </button>
            </div>
          )}
        </div>
      </div>

      <section className="bg-white rounded-xl border border-[hsl(var(--border))] p-4 mt-6">
        <h2 className="font-semibold text-[hsl(var(--primary))] mb-3">Recent Orders</h2>
        <ul className="space-y-1 text-sm">
          {orders.map((o) => (
            <li key={o.id} className="flex justify-between py-1.5 border-b border-slate-50">
              <span>{o.orderNumber} — {o.outlet.name}</span>
              <span className="text-slate-500">
                ${Number(o.totalAmount).toFixed(2)} · {o.status}
                {o.roomNumber && ` · Room ${o.roomNumber}`}
                {o.groupReservation && ` · Group ${o.groupReservation.groupName}`}
                {o.walkInGuestName && ` · ${o.walkInGuestName}`}
              </span>
            </li>
          ))}
          {orders.length === 0 && <li className="text-slate-400">No orders yet.</li>}
        </ul>
      </section>
    </div>
  );
}
