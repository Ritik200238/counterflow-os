import { notFound } from "next/navigation";
import AssetDetail from "@/components/AssetDetail";
import { ASSET_SYMBOLS } from "@/lib/types";

export default async function AssetPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  if (!(ASSET_SYMBOLS as string[]).includes(symbol)) notFound();
  return <AssetDetail symbol={symbol} />;
}
