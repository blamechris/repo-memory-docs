import { QuartzConfig } from "./quartz/cfg"
import * as Plugin from "./quartz/plugins"

/**
 * Quartz 4 Configuration for Rah6 Documentation
 *
 * See https://quartz.jzhao.xyz/configuration for more information.
 */
const config: QuartzConfig = {
  configuration: {
    pageTitle: "Repo Memory Documentation",
    pageTitleSuffix: "",
    enableSPA: true,
    enablePopovers: true,
    analytics: {
      provider: "plausible",
    },
    locale: "en-US",
    baseUrl: "www.blamechris.com/repo-memory-docs",
    ignorePatterns: ["private", "templates", ".obsidian", "quartz", "node_modules", "archive", "package*.json", "tsconfig.json", "*.config.ts", "*.layout.ts"],
    defaultDateType: "modified",
    theme: {
      fontOrigin: "googleFonts",
      cdnCaching: true,
      typography: {
        header: "Orbitron",
        body: "Source Sans Pro",
        code: "IBM Plex Mono",
      },
      colors: {
        lightMode: {
          light: "#faf8f4",
          lightgray: "#e6e0d4",
          gray: "#9b8e74",
          darkgray: "#4a3f2f",
          dark: "#2b1d12",
          secondary: "#a8321f",
          tertiary: "#c9a227",
          highlight: "rgba(168, 50, 31, 0.12)",
          textHighlight: "#c9a22755",
        },
        darkMode: {
          light: "#13100c",
          lightgray: "#221b13",
          gray: "#6b5d45",
          darkgray: "#d8cbb0",
          dark: "#f1e8d6",
          secondary: "#e0573f",
          tertiary: "#e6c34a",
          highlight: "rgba(224, 87, 63, 0.15)",
          textHighlight: "#e6c34a44",
        },
      },
    },
  },
  plugins: {
    transformers: [
      Plugin.FrontMatter(),
      Plugin.CreatedModifiedDate({
        priority: ["frontmatter", "git", "filesystem"],
      }),
      Plugin.SyntaxHighlighting({
        theme: {
          light: "github-light",
          dark: "github-dark",
        },
        keepBackground: false,
      }),
      Plugin.ObsidianFlavoredMarkdown({ enableInHtmlEmbed: false }),
      Plugin.GitHubFlavoredMarkdown(),
      Plugin.TableOfContents(),
      Plugin.CrawlLinks({ markdownLinkResolution: "shortest" }),
      Plugin.Description(),
      Plugin.Latex({ renderEngine: "katex" }),
    ],
    filters: [Plugin.RemoveDrafts()],
    emitters: [
      Plugin.AliasRedirects(),
      Plugin.ComponentResources(),
      Plugin.ContentPage(),
      Plugin.FolderPage(),
      Plugin.TagPage(),
      Plugin.ContentIndex({
        enableSiteMap: true,
        enableRSS: true,
      }),
      Plugin.Assets(),
      Plugin.Static(),
      Plugin.Favicon(),
      Plugin.NotFoundPage(),
      Plugin.CustomOgImages(),
    ],
  },
}

export default config
