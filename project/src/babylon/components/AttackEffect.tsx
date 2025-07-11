import React, { useEffect, useRef } from 'react';
import attackFrame1 from '../../assets/attack-effect/1.png';
import attackFrame2 from '../../assets/attack-effect/2.png';

interface AttackEffectProps {
  x: number;
  y: number;
  size: number;
  onComplete: () => void;
}

export const AttackEffect: React.FC<AttackEffectProps> = ({ x, y, size, onComplete }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);
  const animationRef = useRef<number>();
  const lastFrameTimeRef = useRef<number>(0);
  const framesRef = useRef<HTMLImageElement[]>([]);

  // Preload images
  useEffect(() => {
    const frames = [attackFrame1, attackFrame2];
    const loadedImages: HTMLImageElement[] = [];
    
    let loadedCount = 0;
    frames.forEach((src, index) => {
      const img = new Image();
      img.onload = () => {
        loadedCount++;
        loadedImages[index] = img;
        if (loadedCount === frames.length) {
          framesRef.current = loadedImages;
        }
      };
      img.src = src;
    });

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // Animation effect
  useEffect(() => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const animate = (timestamp: number) => {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Fast animation - 50ms per frame (20fps)
      const frameRate = 50;
      
      if (timestamp - lastFrameTimeRef.current >= frameRate) {
        frameRef.current++;
        lastFrameTimeRef.current = timestamp;
        
        // Complete animation after 2 frames
        if (frameRef.current >= 2) {
          if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
          }
          onComplete();
          return;
        }
      }
      
      // Draw current frame if images are loaded
      const currentFrame = frameRef.current;
      if (framesRef.current.length === 2 && currentFrame < 2) {
        const frameImg = framesRef.current[currentFrame];
        if (frameImg && frameImg.complete) {
          // Set reduced opacity
          ctx.globalAlpha = 0.6;
          ctx.drawImage(frameImg, 0, 0, frameImg.width, frameImg.height, 0, 0, size, size);
          // Reset opacity
          ctx.globalAlpha = 1.0;
        }
      }
      
      animationRef.current = requestAnimationFrame(animate);
    };
    
    // Start animation
    animationRef.current = requestAnimationFrame(animate);
    
  }, [size, onComplete]);
  
  return (
    <canvas 
      ref={canvasRef}
      width={size}
      height={size}
      className="absolute pointer-events-none"
      style={{
        left: x - size / 2,
        top: y - size / 2,
        zIndex: 1000,
      }}
    />
  );
}; 