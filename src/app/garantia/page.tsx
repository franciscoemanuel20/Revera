import { GarantiaContent, metadata, revalidate } from "./GarantiaContent";

export { metadata, revalidate };

export default async function GarantiaPage() {
  return <GarantiaContent />;
}
