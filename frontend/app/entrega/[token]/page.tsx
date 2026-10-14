import Driver from "@/components/driver";
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <Driver token={token} />;
}
