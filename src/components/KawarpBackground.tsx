import { useEffect } from "react";
import {
  Kawarp,
  useKawarp,
} from "@kawarp/react";

interface Props {
  image?: string;
}

export default function KawarpBackground({
  image,
}: Props) {
  const {
    ref,
    loadImage,
  } = useKawarp();

  useEffect(() => {
    if (!image) {
      return;
    }

    const currentImage: string = image;

    let cancelled = false;

    async function changeImage() {
      try {
        await loadImage(currentImage);

        if (cancelled) {
          return;
        }

        console.log(
          "Kawarp",
          currentImage,
        );
      } catch (error) {
        if (cancelled) {
          return;
        }

        console.error(
          "Kawarp 图片加载失败:",
          error,
        );
      }
    }

    changeImage();

    return () => {
      cancelled = true;
    };
  }, [image, loadImage]);

  return (
    <div className="kawarp-background">
      <Kawarp
        ref={ref}
        warpIntensity={1}
        blurPasses={10}
        animationSpeed={0.7}
        transitionDuration={1500}
        saturation={2}
        tintIntensity={0.08}
        dithering={0.004}
        scale={1.33}
        style={{
          width: "100%",
          height: "100%",
        }}
      />

      <div className="kawarp-dark" />
    </div>
  );
}