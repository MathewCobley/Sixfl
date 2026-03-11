export default function SiteFooter() {
  return (
    <footer className="border-t bg-white">
      <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-gray-600">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="font-medium text-gray-900">SIXFL</div>
            <div className="mt-1">Professional 6-a-side football leagues.</div>
          </div>

          <div className="flex gap-6">
            <a className="hover:underline" href="/leagues">Leagues</a>
            <a className="hover:underline" href="/venues">Venues</a>
            <a className="hover:underline" href="/pricing">Pricing</a>
            <a className="hover:underline" href="/contact">Register</a>

            {/* Facebook */}
            <a
              className="hover:underline"
              href="https://www.facebook.com/profile.php?id=61588172021259"
              target="_blank"
              rel="noopener noreferrer"
            >
              Facebook
            </a>
          </div>
        </div>

        <div className="mt-8 text-xs text-gray-500">
          © {new Date().getFullYear()} SIXFL. All rights reserved.
        </div>
      </div>
    </footer>
  );
}