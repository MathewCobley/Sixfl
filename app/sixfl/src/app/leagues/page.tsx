export default function LeaguesPage() {
  const leagues = [
    {
      name: "Leeds Monday League",
      location: "Leeds",
      night: "Monday",
      spots: 2,
    },
    {
      name: "York Wednesday League",
      location: "York",
      night: "Wednesday",
      spots: 0,
    },
    {
      name: "Harrogate Thursday League",
      location: "Harrogate",
      night: "Thursday",
      spots: 3,
    },
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold tracking-tight">Leagues</h1>

      <div className="grid gap-6 md:grid-cols-3">
        {leagues.map((league) => (
          <div
            key={league.name}
            className="rounded-xl border p-6 hover:shadow-md transition"
          >
            <h2 className="text-lg font-medium">{league.name}</h2>
            <p className="mt-2 text-sm text-gray-600">
              {league.location} • {league.night}
            </p>

            <div className="mt-4">
              {league.spots > 0 ? (
                <span className="text-sm font-medium text-green-600">
                  {league.spots} spots remaining
                </span>
              ) : (
                <span className="text-sm font-medium text-red-600">
                  Full
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}