// CGRF: SRS=SRS-BUILDANDDO-COMMUNITY-WEB-001, SRS-BUILDANDDO-PURPOSE-001 | CAPS=B | Seat=C-ONE
import { Helmet } from 'react-helmet';
import { useLocation } from 'react-router-dom';
import { PUBLIC_PAGES, SITE_ORIGIN } from '@/lib/publicPages';
import { SAME_AS } from '@/lib/communityLinks';
import { PURPOSE } from '@/lib/purpose';

export default function Seo({
    title,
    description,
    image,
    url,
    path,
    route,
    siteName = 'BuildAndDo',
    type = 'website',
    structuredData = [],
}) {
    const location = useLocation();
    const pathname =
        (path || route?.path || (url ? new URL(url, SITE_ORIGIN).pathname : location.pathname)).replace(
            /\/+$/,
            '',
        ) || '/';
    // A catalogued route takes its metadata from PUBLIC_PAGES. A route outside the catalogue - a
    // persona profile - passes its own `route` ({path, label, title, description, type}) so its
    // canonical URL is its own; without one, the home entry is used as before.
    const page =
        PUBLIC_PAGES.find((entry) => entry.path === pathname) ||
        (route?.path === pathname ? route : PUBLIC_PAGES[0]);
    const canonical = `${SITE_ORIGIN}${page.path}`;
    const pageTitle = title || page.title;
    const pageDescription = description || page.description;
    const socialImage = image || `${SITE_ORIGIN}/social-card.png`;
    const schema = [
        {
            '@context': 'https://schema.org',
            '@type': page.type,
            '@id': `${canonical}#page`,
            url: canonical,
            name: pageTitle,
            description: pageDescription,
            // The site's official public profiles, from the one list in communityLinks.js.
            isPartOf: { '@type': 'WebSite', name: siteName, url: SITE_ORIGIN, sameAs: [...SAME_AS] },
            publisher: {
                '@type': 'Organization',
                name: 'Citadel Nexus Inc.',
                url: 'https://citadel-nexus.com',
            },
        },
        ...(page.path === '/'
            ? []
            : [
                  {
                      '@context': 'https://schema.org',
                      '@type': 'BreadcrumbList',
                      itemListElement: [
                          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_ORIGIN },
                          { '@type': 'ListItem', position: 2, name: page.label, item: canonical },
                      ],
                  },
              ]),
        ...structuredData,
    ];
    return (
        <Helmet>
            <title>{pageTitle}</title>
            <meta name="description" content={pageDescription} />
            <meta name="robots" content="index,follow" />
            <link rel="canonical" href={canonical} />
            <meta property="og:url" content={canonical} />
            <meta property="og:type" content={type} />
            <meta property="og:locale" content="en_US" />
            <meta property="og:site_name" content={siteName} />
            <meta property="og:title" content={pageTitle} />
            <meta property="og:description" content={pageDescription} />
            <meta property="og:image" content={socialImage} />
            <meta property="og:image:alt" content={PURPOSE.shareImageAlt} />
            <meta property="og:image:width" content="1200" />
            <meta property="og:image:height" content="630" />
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content={pageTitle} />
            <meta name="twitter:description" content={pageDescription} />
            <meta name="twitter:image" content={socialImage} />
            <meta name="twitter:image:alt" content={PURPOSE.shareImageAlt} />
            <script id="page-schema" type="application/ld+json">
                {JSON.stringify(schema).replace(/</g, '\\u003c')}
            </script>
        </Helmet>
    );
}

export { Seo };
