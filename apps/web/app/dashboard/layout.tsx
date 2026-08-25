import { Suspense } from "react";
import { redirect } from "next/navigation";
import {
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  Inter,
  Source_Serif_4,
} from "next/font/google";
import ErrorFallback from "@/components/dashboard/ErrorFallback";
import DenseShortcutsHelp from "@/components/dashboard/dense/DenseShortcutsHelp";
import DenseSidebar from "@/components/dashboard/dense/DenseSidebar";
import { DenseScaleProvider } from "@/components/dashboard/dense/DenseScaleController";
import { DenseThemeProvider } from "@/components/dashboard/dense/DenseThemeController";
import { ForceDenseTheme } from "@/components/dashboard/dense/ForceDenseTheme";
import { MobileShell } from "@/components/dashboard/dense/mobile/MobileShell";
import LoadingSpinner from "@/components/ui/spinner";
import DemoModeBanner from "@/components/DemoModeBanner";
import ValidAccountCheck from "@/components/utils/ValidAccountCheck";
import { ReaderSettingsProvider } from "@/lib/readerSettings";
import { UserSettingsContextProvider } from "@/lib/userSettings";
import { api } from "@/server/api/client";
import { getServerAuthSession } from "@/server/auth";
import { TRPCError } from "@trpc/server";
import { ErrorBoundary } from "react-error-boundary";

import serverConfig from "@karakeep/shared/config";
import { PluginManager, PluginType } from "@karakeep/shared/plugins";
import { tryCatch } from "@karakeep/shared/tryCatch";

import "./dense-theme.css";

// Four self-hosted candidates for the runtime-switchable "Font" preset (see
// lib/dense/theme.ts's FONT_PAIRINGS + DenseFilesView's picker) — all loaded
// up front so every choice's CSS variable exists no matter which is active;
// switching just repoints --font-k-sans at one of these (or, for "system", a
// literal OS stack with nothing to load). Each keeps its own `--font-k-sans-*`
// variable name rather than claiming the shared `--font-k-sans` directly, so
// none of them fight over that name — dense-theme.css's own default points
// it at -plex, and useDenseTheme (lib/dense/theme.ts) overrides it from
// there. Mono stays a single fixed face (not part of the picker): it's only
// ever used for small structural labels/timestamps, not reading content.
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-k-sans-plex",
  fallback: ["sans-serif"],
});

const interSans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-k-sans-inter",
  fallback: ["sans-serif"],
});

const serifSans = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-k-sans-serif",
  fallback: ["serif"],
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-k-mono",
  fallback: ["monospace"],
});

const FONT_VARIABLES = `${plexSans.variable} ${interSans.variable} ${serifSans.variable} ${plexMono.variable}`;

export default async function Dashboard({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode;
  modal: React.ReactNode;
}>) {
  const session = await getServerAuthSession();
  if (!session) {
    redirect("/");
  }

  const searchEnabled = PluginManager.isRegistered(PluginType.Search);

  const [lists, userSettings, tags] = await Promise.all([
    tryCatch(api.lists.list()),
    tryCatch(api.users.settings()),
    tryCatch(api.tags.list({ limit: 10, sortBy: "usage" })),
  ]);

  if (userSettings.error) {
    if (userSettings.error instanceof TRPCError) {
      if (
        userSettings.error.code === "NOT_FOUND" ||
        userSettings.error.code === "UNAUTHORIZED"
      ) {
        redirect("/logout");
      }
    }
    throw userSettings.error;
  }

  if (lists.error) {
    throw lists.error;
  }

  return (
    <UserSettingsContextProvider userSettings={userSettings.data}>
      <ReaderSettingsProvider>
        <DenseScaleProvider>
          <DenseThemeProvider>
            <div
              className={`k-dense k-dense-zoom dark ${FONT_VARIABLES} sm:fixed sm:inset-0 sm:overflow-hidden`}
            >
              {/* Radix portals (dropdowns/dialogs) escape this wrapper in the
              DOM, so mirror its theme classes onto <html> too. */}
              <ForceDenseTheme fontClassNames={FONT_VARIABLES} />
              {/* h-full, not 100dvh: under `zoom` the wrapper above already
              resolves to exactly the viewport, whereas viewport units would
              be re-divided by the zoom factor and overflow. */}
              <div className="flex min-h-[100dvh] w-full flex-col sm:h-full sm:min-h-0 sm:flex-row sm:overflow-hidden">
                <ValidAccountCheck />
                <div className="hidden flex-none sm:flex">
                  <DenseSidebar
                    initialLists={lists.data.lists}
                    initialTags={tags.error ? [] : tags.data.tags}
                    serverVersion={serverConfig.serverVersion}
                  />
                </div>
                <main className="bg-k-bg flex-1 sm:min-h-0 sm:overflow-y-auto">
                  {serverConfig.demoMode && <DemoModeBanner />}
                  {modal}
                  {/* pb-20: clears the fixed mobile tab bar (~64px) plus its
                      own safe-area padding, so the last row in any list
                      isn't hidden behind it. sm:pb-0 — the tab bar is
                      sm:hidden, nothing to clear on desktop.
                      sm:flex sm:min-h-full sm:flex-col: bridges the height
                      chain down to `children` on desktop — `<main>` above
                      has a real, definite height (flex-1 + min-h-0), but
                      this div previously only had `min-h-30`, so anything
                      inside sized itself to its own content instead of
                      filling `<main>`'s visible height. Additive/floor-only
                      (min-height, not height), so every other page's
                      natural content-height rendering is unaffected — only
                      a page that opts in with its own `sm:flex-1` (like
                      DenseChat) actually uses the extra room. */}
                  <div className="min-h-30 p-4 pb-20 sm:flex sm:min-h-full sm:flex-col sm:pb-4">
                    <ErrorBoundary fallback={<ErrorFallback />}>
                      <Suspense fallback={<LoadingSpinner />}>
                        {children}
                      </Suspense>
                    </ErrorBoundary>
                  </div>
                </main>
              </div>
              <MobileShell searchEnabled={searchEnabled} />
              <DenseShortcutsHelp />
            </div>
          </DenseThemeProvider>
        </DenseScaleProvider>
      </ReaderSettingsProvider>
    </UserSettingsContextProvider>
  );
}
