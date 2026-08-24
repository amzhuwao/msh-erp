"use client";

import Link from "next/link";
import {
  IconBed,
  IconChevron,
  IconMail,
  IconPhone,
  IconPin,
  IconSparkle,
} from "@/components/portal/Icons";
import { HOTEL_EMAIL, HOTEL_PHONE, ROOM_COLLECTION, WHY_GUESTS, portalAsset } from "@/lib/portal";

const whyIcons = [IconBed, IconSparkle, IconPin];

export default function GuestHomePage() {
  return (
    <div className="min-h-full bg-background">
      <section className="md:hidden px-4 pt-1">
        <div className="relative overflow-hidden rounded-[1.75rem] bg-muted shadow-[0_20px_50px_-20px_rgba(0,0,0,0.35)] ring-1 ring-black/[0.06]">
          <div className="aspect-[4/5] max-h-[min(52vh,420px)] w-full">
            <img src={portalAsset("/portal/hotel.png")} alt="Manica Skyview Hotel" className="h-full w-full object-cover" />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
            <h1 className="font-display text-2xl font-bold leading-tight">Welcome to Manica Skyview Hotel</h1>
            <p className="mt-1 text-sm text-white/80">Experience luxury and comfort in the heart of Manica.</p>
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-bold tracking-tight">Why guests choose us</h2>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 pr-4 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {WHY_GUESTS.map((item, i) => {
              const Icon = whyIcons[i]!;
              return (
                <div key={item.title} className="snap-start shrink-0 w-[220px] rounded-xl bg-card border p-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-display font-semibold text-sm">{item.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-bold tracking-tight">Room collection</h2>
            <Link href="/browse" className="text-xs font-semibold text-primary flex items-center gap-0.5">
              Book Now <IconChevron />
            </Link>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 pr-4 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {ROOM_COLLECTION.map((room) => (
              <Link key={room.name} href="/browse" className="snap-start shrink-0 w-[min(72vw,260px)] rounded-xl overflow-hidden bg-card border">
                <img src={portalAsset(room.img)} alt={room.name} className="h-36 w-full object-cover" />
                <p className="p-3 font-display font-semibold text-sm">{room.name}</p>
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-8 px-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Get in touch</p>
          <div className="mt-3 space-y-2.5 text-sm">
            <a href={`tel:${HOTEL_PHONE.replace(/\s/g, "")}`} className="flex items-center gap-2.5 rounded-xl bg-background/70 px-3 py-2.5 font-medium ring-1 ring-border/50">
              <IconPhone className="h-4 w-4 text-primary shrink-0" />
              {HOTEL_PHONE}
            </a>
            <a href={`mailto:${HOTEL_EMAIL}`} className="flex items-center gap-2.5 rounded-xl bg-background/70 px-3 py-2.5 font-medium ring-1 ring-border/50">
              <IconMail className="h-4 w-4 text-primary shrink-0" />
              {HOTEL_EMAIL}
            </a>
          </div>
        </div>

        <footer className="mt-10 pb-4 text-center">
          <div className="flex items-center justify-center gap-2 opacity-80">
            <img src={portalAsset("/portal/logo.jpg")} alt="" className="h-7 w-7 rounded-lg object-contain" />
            <span className="font-display text-sm font-semibold">Manica Skyview Hotel</span>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">© {new Date().getFullYear()} Manica Skyview. All rights reserved.</p>
        </footer>
      </section>

      <section className="hidden md:block relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${portalAsset("/portal/hotel.png")})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/80 to-background/40" />
        <div className="relative max-w-6xl mx-auto px-4 py-24 md:py-36">
          <div className="max-w-xl">
            <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground leading-tight">
              Welcome to
              <br />
              Manica Skyview Hotel
            </h1>
            <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
              Experience luxury and comfort in the heart of Manica. Book your perfect stay with us today.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/browse" className="inline-flex items-center gap-2 text-base px-8 py-3 rounded-[var(--radius)] bg-primary text-primary-foreground font-medium shadow-sm">
                <IconBed className="h-5 w-5" /> Book a Room
              </Link>
              <Link href="/my-bookings" className="inline-flex items-center text-base px-8 py-3 rounded-[var(--radius)] border bg-card font-medium">
                My Bookings
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="hidden md:block max-w-6xl mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {WHY_GUESTS.map((item, i) => {
            const Icon = whyIcons[i]!;
            return (
              <div key={item.title} className="flex items-start gap-4 p-6 rounded-xl bg-card border">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-foreground">{item.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{item.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="hidden md:block bg-muted/50 py-16">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-2xl font-display font-bold text-foreground mb-8 text-center">Our Rooms</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {ROOM_COLLECTION.map((room) => (
              <Link key={room.name} href="/browse" className="rounded-xl overflow-hidden bg-card border group">
                <div className="aspect-[16/10] overflow-hidden">
                  <img src={portalAsset(room.img)} alt={room.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                </div>
                <p className="p-4 font-display font-semibold">{room.name}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
