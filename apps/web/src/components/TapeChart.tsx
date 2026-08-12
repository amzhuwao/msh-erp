"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface Room {
  id: string;
  number: string;
  floor: number;
  status: string;
  roomType: { code: string; name: string };
}

interface Reservation {
  id: string;
  reservationNumber: string;
  roomId: string | null;
  checkInDate: string;
  checkOutDate: string;
  status: string;
  guest: { firstName: string; lastName: string };
}

const statusColors: Record<string, string> = {
  TENTATIVE: "bg-slate-300",
  CONFIRMED: "bg-blue-400",
  CHECKED_IN: "bg-emerald-500",
  CHECKED_OUT: "bg-slate-400",
  CANCELLED: "bg-red-300",
  NO_SHOW: "bg-orange-300",
};

export function TapeChart() {
  const [dates, setDates] = useState<string[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ dates: string[]; rooms: Room[]; reservations: Reservation[] }>(
      "/api/front-office/tape-chart?days=14",
    )
      .then((data) => {
        setDates(data.dates);
        setRooms(data.rooms);
        setReservations(data.reservations);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-slate-500 p-8 text-center">Loading tape chart…</div>;

  function getReservationForCell(roomId: string, date: string) {
    const day = new Date(date);
    return reservations.find((r) => {
      if (r.roomId !== roomId) return false;
      const checkIn = new Date(r.checkInDate);
      const checkOut = new Date(r.checkOutDate);
      return day >= checkIn && day < checkOut;
    });
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse min-w-[900px]">
        <thead>
          <tr>
            <th className="sticky left-0 bg-slate-50 border p-2 text-left w-24 z-10">Room</th>
            <th className="border p-2 text-left w-20 bg-slate-50">Type</th>
            <th className="border p-2 text-left w-24 bg-slate-50">HK Status</th>
            {dates.map((d) => (
              <th key={d} className="border p-2 bg-slate-50 min-w-[72px] text-center">
                {d.slice(5)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rooms.map((room) => (
            <tr key={room.id} className="hover:bg-slate-50/50">
              <td className="sticky left-0 bg-white border p-2 font-semibold z-10">
                {room.number}
              </td>
              <td className="border p-2 text-slate-600">{room.roomType.code}</td>
              <td className="border p-2">
                <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px]">
                  {room.status.replace(/_/g, " ")}
                </span>
              </td>
              {dates.map((date) => {
                const res = getReservationForCell(room.id, date);
                const isStart = res && res.checkInDate.slice(0, 10) === date;
                return (
                  <td key={date} className="border p-0.5 h-8">
                    {res && (
                      <div
                        className={`h-full rounded px-1 flex items-center text-white truncate ${statusColors[res.status] ?? "bg-blue-400"}`}
                        title={`${res.guest.firstName} ${res.guest.lastName} — ${res.reservationNumber}`}
                      >
                        {isStart && (
                          <span className="truncate font-medium">
                            {res.guest.lastName}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
