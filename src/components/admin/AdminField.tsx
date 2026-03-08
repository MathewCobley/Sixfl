export function AdminField({
  label,
  name,
  placeholder,
  required,
  type = "text",
  defaultValue,
}: {
  label: string;
  name: string;
  placeholder?: string;
  required?: boolean;
  type?: string;
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm text-white/70">{label}</span>
      <input
        className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white outline-none focus:border-white/25"
        name={name}
        placeholder={placeholder}
        required={required}
        type={type}
        defaultValue={defaultValue}
      />
    </label>
  );
}