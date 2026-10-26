export default function ErrorBanner({ error }) {
  if (!error) return null;
  return (
    <div role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
      <p>{error.message}</p>
      {error.errors?.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-xs">
          {error.errors.map((i) => (
            <li key={`${i.field}${i.message}`}>
              {i.field.replace(/^body\./, '')}: {i.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
