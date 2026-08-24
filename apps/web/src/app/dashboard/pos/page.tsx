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
  outlet: { name: string };
}

export default function PosPage() {
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [selectedOutlet, setSelectedOutlet] = useState<string>("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<PosOrder[]>([]);
  const [roomNumber, setRoomNumber] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD" | "BANK_TRANSFER" | "ECOCASH" | "ONEMONEY" | "ROOM_CHARGE">("CASH");
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
    apiFetch("/api/property/payment-instructions").then(setPayInfo).catch(() => undefined);
  }, []);

  const outlet = outlets.find((o) => o.id === selectedOutlet);
  const categories = outlet
    ? [...new Set(outlet.menuItems.map((m) => m.category))]
    : [];

  const subTotal = cart.reduce((s, c) => s + Number(c.menuItem.price) * c.quantity, 0);
  const taxAmount = cart.reduce((s, c) => s + Number(c.menuItem.price) * c.quantity * 0.15, 0);
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
    setLoading(true);
    try {
      const order = await apiFetch<{ id: string }>("/api/pos/orders", {
        method: "POST",
        body: JSON.stringify({
          outletId: selectedOutlet,
          items: cart.map((c) => ({ menuItemId: c.menuItem.id, quantity: c.quantity })),
        }),
      });
      setLastOrderId(order.id);
      setCart([]);
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
        }),
      });
      setLastOrderId(null);
      setRoomNumber("");
      loadMenu();
      alert("Payment processed");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setLoading(false);
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
              <div className="border-t pt-2 text-sm space-y-1">
                <div className="flex justify-between"><span>Subtotal</span><span>${subTotal.toFixed(2)}</span></div>
                <div className="flex justify-between text-slate-500"><span>VAT 15%</span><span>${taxAmount.toFixed(2)}</span></div>
                <div className="flex justify-between font-semibold text-[hsl(var(--primary))]"><span>Total</span><span>${total.toFixed(2)}</span></div>
              </div>
              <button
                onClick={submitOrder}
                disabled={loading}
                className="w-full mt-4 bg-[hsl(var(--primary))] text-white py-2 rounded-lg text-sm disabled:opacity-50"
              >
                Create Order
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
                <input
                  placeholder="Room number"
                  className="w-full border rounded-lg px-3 py-2 text-sm mb-2"
                  value={roomNumber}
                  onChange={(e) => setRoomNumber(e.target.value)}
                />
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
              </span>
            </li>
          ))}
          {orders.length === 0 && <li className="text-slate-400">No orders yet.</li>}
        </ul>
      </section>
    </div>
  );
}
