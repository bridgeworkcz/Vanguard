import { createFileRoute } from "@tanstack/react-router";
import { CITIZENSHIPS, countrySlug, sameCountry } from "@/lib/vanguard/domain";
import { VISA_PRODUCTS } from "@/lib/vanguard/seed";

const PAGES = ["/", "/about", "/contact", "/filings", "/questions", "/privacy", "/terms", "/agents", "/login"];

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: () => {
        const origin = "https://www.vanguardmobility.site";
        const countries = Array.from(new Set(VISA_PRODUCTS.filter((item) => item.active && item.country).map((item) => item.country)));
        const countryPages = countries.map((name) => `/country/${countrySlug(name)}`);
        const fromPages = CITIZENSHIPS.flatMap((citizen) =>
          countries.filter((country) => !sameCountry(citizen, country)).map((country) => `/from/${countrySlug(citizen)}/${countrySlug(country)}`),
        );
        const urls = [...PAGES, ...countryPages, ...fromPages]
          .map((path) => `  <url><loc>${origin}${path}</loc></url>`)
          .join("\n");
        const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
        return new Response(body, { headers: { "content-type": "application/xml; charset=utf-8" } });
      },
    },
  },
});
