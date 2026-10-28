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
    <AuthFrame title="Cupom" lede={open ? "Aponte para o QR da NFC-e. O celular lê o link e os itens do cupom e manda tudo ao balcão." : "Esse código expirou. Gere outro no balcão."}>
      {open ? <CouponPhone token={token} /> : null}
    </AuthFrame>
  );
}
