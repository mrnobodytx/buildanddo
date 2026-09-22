import { Helmet } from 'react-helmet';
import { useLocation } from 'react-router-dom';
import { PUBLIC_PAGES, SITE_ORIGIN } from '@/lib/publicPages';

export default function Seo({
    title,
    description,
    image,
    url,
    path,
    siteName = 'BuildAndDo',
    type = 'website',
    structuredData = [],
}) {
    const location = useLocation();
    const pathname =
        (path || (url ? new URL(url, SITE_ORIGIN).pathname : location.pathname)).replace(
            /\/+$/,
            '',
        ) || '/';
    const page = PUBLIC_PAGES.find((entry) => entry.path === pathname) || PUBLIC_PAGES[0];
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
            isPartOf: { '@type': 'WebSite', name: siteName, url: SITE_ORIGIN },
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
            <meta property="og:image:alt" content="BuildAndDo — learn by doing, together" />
            <meta property="og:image:width" content="1200" />
            <meta property="og:image:height" content="630" />
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content={pageTitle} />
            <meta name="twitter:description" content={pageDescription} />
            <meta name="twitter:image" content={socialImage} />
            <meta name="twitter:image:alt" content="BuildAndDo — learn by doing, together" />
            <script id="page-schema" type="application/ld+json">
                {JSON.stringify(schema).replace(/</g, '\\u003c')}
            </script>
        </Helmet>
    );
}

export { Seo };
