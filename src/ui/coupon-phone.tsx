"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { sendCouponPhoto } from "@/catalog/coupon-bridge";

function frameCode(video: HTMLVideoElement) {
  const canvas = document.createElement("canvas");
  const longest = Math.max(video.videoWidth, video.videoHeight);
  const scale = longest > 1400 ? 1400 / longest : 1;
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { jpeg: "", qr: "" };
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const found = jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" });
  return { jpeg: canvas.toDataURL("image/jpeg", 0.72), qr: found?.data ?? "" };
}

export function CouponPhone({ token }: { token: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sent = useRef(false);
  const [blocked, setBlocked] = useState(false);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let last = 0;
    let stopped = false;
    const tick = (now: number) => {
      if (stopped || sent.current) return;
      const video = videoRef.current;
      if (video && video.videoWidth > 0 && now - last > 280) {
        last = now;
        const shot = frameCode(video);
        if (shot.qr) {
          sent.current = true;
          stopped = true;
          void deliver(shot.jpeg, shot.qr);
          return;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then(async (next) => {
        stream = next;
        if (stopped) {
          next.getTracks().forEach((track) => track.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = next;
        await video.play();
        frame = requestAnimationFrame(tick);
      })
      .catch(() => {
        if (!stopped) setBlocked(true);
      });
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [token]);

  async function deliver(jpeg: string, qr: string) {
    const video = videoRef.current;
    const stream = video?.srcObject;
    if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
    const result = await sendCouponPhoto(token, jpeg, qr);
    if (!result.ok) {
      sent.current = false;
      setFailed(true);
      return;
    }
    setDone(true);
  }

  async function sendNow() {
    const video = videoRef.current;
    if (!video || sent.current || video.videoWidth === 0) return;
    sent.current = true;
    const shot = frameCode(video);
    await deliver(shot.jpeg, shot.qr);
  }

  if (done) {
    return <p className="ok banner">Foto no balcão. Pode fechar esta página.</p>;
  }

  return (
    <div className="coupon-phone">
      <video ref={videoRef} playsInline muted autoPlay />
      {blocked ? <p className="error">A câmera do celular não abriu. Libere o acesso e recarregue.</p> : null}
      {failed ? <p className="error">A foto não chegou. Gere outro código no balcão.</p> : null}
      <button className="btn teal" type="button" onClick={() => void sendNow()}>Enviar foto</button>
    </div>
  );
}
