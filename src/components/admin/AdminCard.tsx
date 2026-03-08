export default function AdminCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-sm">
      <h1 className="text-xl font-semibold">{title}</h1>
      <div className="mt-4">{children}</div>
    </div>
  );
}