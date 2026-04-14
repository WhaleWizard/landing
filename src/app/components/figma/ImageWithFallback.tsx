import { useState } from 'react';

interface ImageWithFallbackProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  fallback?: string;
}

export function ImageWithFallback({ src, alt, fallback = '/placeholder.jpg', ...props }: ImageWithFallbackProps) {
  const [imgSrc, setImgSrc] = useState(src);
  const [error, setError] = useState(false);

  const handleError = () => {
    if (!error) {
      setImgSrc(fallback);
      setError(true);
    }
  };

  return <img src={imgSrc} alt={alt} onError={handleError} loading="lazy" decoding="async" {...props} />;
}