import { computed } from "vue";
import { useHead, useRoute, useRuntimeConfig, useSeoMeta } from "#imports";

const SITE_NAME = "Voxoban";
const PAGE_TITLE = "Voxoban - 3D Sokoban Puzzle Game";
const PAGE_DESCRIPTION =
  "Play Voxoban, a browser-based 3D Sokoban-style puzzle game.";
const LOGO_URL = "/voxoban-logo.png";
const SOCIAL_IMAGE_PATH = "/voxoban-social.png";
const SOCIAL_IMAGE_WIDTH = "2874";
const SOCIAL_IMAGE_HEIGHT = "1796";
const SOCIAL_IMAGE_ALT =
  "Voxoban gameplay preview showing voxel crates and goal tiles on a Sokoban board.";

export function useVoxobanSeo(): { logoUrl: string } {
  const route = useRoute();
  const runtimeConfig = useRuntimeConfig();
  const siteUrl = computed(() => {
    const raw =
      (runtimeConfig.public.siteUrl as string | undefined)?.trim() ?? "";
    return raw ? raw.replace(/\/+$/, "") : "";
  });
  const canonicalUrl = computed(() => {
    if (!siteUrl.value) {
      return undefined;
    }
    const path = route.path === "/" ? "" : route.path;
    return `${siteUrl.value}${path}`;
  });
  const socialImageUrl = computed(() => {
    if (!siteUrl.value) {
      return SOCIAL_IMAGE_PATH;
    }
    return `${siteUrl.value}${SOCIAL_IMAGE_PATH}`;
  });
  const jsonLd = computed(() => ({
    "@context": "https://schema.org",
    "@type": "VideoGame",
    "@id": `${
      canonicalUrl.value ?? siteUrl.value ?? "https://voxoban.com"
    }#game`,
    name: SITE_NAME,
    description: PAGE_DESCRIPTION,
    applicationCategory: "Game",
    genre: "Puzzle",
    gamePlatform: "Web Browser",
    operatingSystem: "Any",
    inLanguage: "en",
    isAccessibleForFree: true,
    image: socialImageUrl.value,
    ...(canonicalUrl.value ? { url: canonicalUrl.value } : {}),
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
    },
  }));
  const websiteJsonLd = computed(() => ({
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${
      canonicalUrl.value ?? siteUrl.value ?? "https://voxoban.com"
    }#website`,
    name: SITE_NAME,
    description: PAGE_DESCRIPTION,
    inLanguage: "en",
    ...(siteUrl.value ? { url: siteUrl.value } : {}),
  }));

  useSeoMeta({
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    applicationName: SITE_NAME,
    googlebot:
      "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1",
    robots:
      "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1",
    ogTitle: PAGE_TITLE,
    ogDescription: PAGE_DESCRIPTION,
    ogType: "website",
    ogSiteName: SITE_NAME,
    ogLocale: "en_US",
    ogUrl: () => canonicalUrl.value,
    ogImage: () => socialImageUrl.value,
    ogImageAlt: SOCIAL_IMAGE_ALT,
    ogImageWidth: SOCIAL_IMAGE_WIDTH,
    ogImageHeight: SOCIAL_IMAGE_HEIGHT,
    twitterCard: "summary_large_image",
    twitterTitle: PAGE_TITLE,
    twitterDescription: PAGE_DESCRIPTION,
    twitterImage: () => socialImageUrl.value,
    twitterImageAlt: SOCIAL_IMAGE_ALT,
  });

  useHead(() => ({
    link: canonicalUrl.value
      ? [
          { rel: "canonical", href: canonicalUrl.value },
          { rel: "alternate", hreflang: "en", href: canonicalUrl.value },
        ]
      : [],
    script: [
      {
        key: "voxoban-jsonld",
        type: "application/ld+json",
        children: JSON.stringify(jsonLd.value),
      },
      {
        key: "voxoban-website-jsonld",
        type: "application/ld+json",
        children: JSON.stringify(websiteJsonLd.value),
      },
    ],
  }));

  return {
    logoUrl: LOGO_URL,
  };
}
