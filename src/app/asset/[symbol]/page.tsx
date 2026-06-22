import AssetDetail from "@/components/AssetDetail";

export default async function AssetPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  return <AssetDetail symbol={symbol} />;
}
