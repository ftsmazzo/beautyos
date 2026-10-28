import { couponLinkOpen } from "@/catalog/coupon-bridge";
import { AuthFrame } from "@/ui/auth-frame";
import { CouponPhone } from "@/ui/coupon-phone";

export const dynamic = "force-dynamic";

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function CouponPhonePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const open = await couponLinkOpen(token);
  return (
    <AuthFrame title="Cupom" lede={open ? "Aponte para o QR da NFC-e. O celular manda o link .gov.br ao balcão — não precisa aproximar até embacar." : "Esse código expirou. Gere outro no balcão."}>
      {open ? <CouponPhone token={token} /> : null}
    </AuthFrame>
  );
}
