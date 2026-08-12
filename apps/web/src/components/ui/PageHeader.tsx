export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className="page-header">
      <h1 className="page-title">{title}</h1>
      {description && <p className="page-description">{description}</p>}
    </header>
  );
}
