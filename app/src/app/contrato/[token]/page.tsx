import { StandaloneContractSign } from '@/components/standalone-contract-sign';

export default async function ContratoTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <StandaloneContractSign token={token} />;
}

