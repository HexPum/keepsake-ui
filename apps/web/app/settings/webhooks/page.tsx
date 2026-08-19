import type { Metadata } from "next";
import WebhookSettings from "@/components/settings/WebhookSettings";
import { useTranslation } from "@/lib/i18n/server";
import { getQueryClient, serverTrpc } from "@/server/api/trpc";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("settings.webhooks.webhooks")} | Karakeep`,
  };
}

export default async function WebhookSettingsPage() {
  // Prefetch server-side and hand the data to the client query cache via
  // hydration, instead of letting <WebhookSettings /> mount unpopulated and
  // fire its own client-side fetch. That extra client round-trip (mount →
  // fetch → render) was the cause of the ~1-2s loading-spinner flash inside
  // the content card reported in cycle-3 browser findings. Same pattern as
  // app/admin/users/page.tsx.
  const queryClient = getQueryClient();
  await queryClient.prefetchQuery(serverTrpc.webhooks.list.queryOptions());

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <WebhookSettings />
    </HydrationBoundary>
  );
}
