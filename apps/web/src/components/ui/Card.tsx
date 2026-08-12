export function Card({
  children,
  className = "",
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <section className={`msh-card p-4 md:p-5 ${className}`}>
      {title && (
        <h2 className="text-base font-semibold text-[hsl(var(--foreground))] mb-3" style={{ fontFamily: "Playfair Display, Georgia, serif" }}>
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}
