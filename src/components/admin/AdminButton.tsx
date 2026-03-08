export function AdminButton({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-4 py-2 font-medium text-black hover:bg-emerald-400"
    >
      {children}
    </button>
  );
}