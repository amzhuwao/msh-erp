export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function portalAsset(path: string) {
  return `${BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;
}

export function roomImage(name: string) {
  const n = name.toLowerCase();
  if (n.includes("deluxe")) return portalAsset("/portal/room-deluxe.jpg");
  if (n.includes("executive") || n.includes("suite")) return portalAsset("/portal/room-executive.jpg");
  if (n.includes("family")) return portalAsset("/portal/room-family.jpg");
  return portalAsset("/portal/room-standard.jpg");
}

export const ROOM_COLLECTION = [
  { name: "Standard Room", img: "/portal/room-standard.jpg" },
  { name: "Deluxe Room", img: "/portal/room-deluxe.jpg" },
  { name: "Executive Suite", img: "/portal/room-executive.jpg" },
  { name: "Family Room", img: "/portal/room-family.jpg" },
] as const;

export const WHY_GUESTS = [
  { title: "Comfortable rooms", desc: "Spacious, modern rooms with stunning views" },
  { title: "Exceptional service", desc: "Exceptional hospitality for every guest" },
  { title: "Convenient location", desc: "Located in the heart of Mutare" },
] as const;

export const STAY_TERMS = [
  "1. Check-in time is from 14:00 and check-out time is by 10:00 on the day of departure.",
  "2. A valid form of identification (ID or Passport) is required at check-in.",
  "3. Guests are responsible for any damage caused to hotel property during their stay.",
  "4. The hotel reserves the right to cancel a reservation if the guest fails to arrive by midnight on the check-in date without prior notice.",
  "5. Cancellations must be made at least 24 hours before the check-in date to avoid charges.",
  "6. Pets are not allowed on the premises unless prior arrangements have been made.",
  "7. The hotel is not liable for loss or theft of personal belongings.",
  "8. Smoking is only permitted in designated areas.",
];

export const HOTEL_PHONE = "+263 20 206 6101";
export const HOTEL_EMAIL = "info@manicaskyview.co.zw";
export const HOTEL_WEBSITE = "https://manicaskyview.co.zw/";

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysISO(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function nightsBetween(checkIn: string, checkOut: string) {
  const a = new Date(`${checkIn}T00:00:00Z`).getTime();
  const b = new Date(`${checkOut}T00:00:00Z`).getTime();
  return Math.max(1, Math.round((b - a) / 86_400_000));
}

export function formatMoney(value: number | string) {
  return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function formatLongDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
