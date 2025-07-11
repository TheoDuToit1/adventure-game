import React, { useRef, useEffect, useState } from 'react';

interface MageFireCharacterProps {
  direction: 'north' | 'south' | 'east' | 'west';
  state: 'idle' | 'walk';
  size: number;
  debug?: boolean;
  hitFlash?: number; // Timestamp when the player was hit
}

// Map direction to folder names
const directionMap = {
  north: 'Up',
  south: 'Down',
  east: 'Right',
  west: 'Left'
};

export const MageFireCharacter: React.FC<MageFireCharacterProps> = ({
  direction,
  state,
  size,
  debug = false,
  hitFlash
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const animationRef = useRef<number>();
  const lastFrameTime = useRef(0);
  const [isLoading, setIsLoading] = useState(true);
  const [frameImages, setFrameImages] = useState<HTMLImageElement[]>([]);
  
  // Load the appropriate images based on direction and state
  useEffect(() => {
    const loadImages = async () => {
      setIsLoading(true);
      
      // Create a fallback image
      const fallbackImage = createFallbackImage(size, direction);
      const images: HTMLImageElement[] = [fallbackImage]; // Start with fallback
      
      setFrameImages(images);
      setIsLoading(false);
      
      // Log the paths we're trying to use
      console.log(`Using fallback images for mage-fire or assasin-wolf character`);
    };
    
    loadImages();
  }, [direction, state, size]);
  
  // Create a fallback image when loading fails
  const createFallbackImage = (size: number, direction: string): HTMLImageElement => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    
    // Draw a colored rectangle based on direction
    const colors: Record<string, string> = {
      north: '#FF5555',
      south: '#55FF55',
      east: '#5555FF',
      west: '#FFFF55'
    };
    
    ctx.fillStyle = colors[direction] || '#FF00FF';
    ctx.fillRect(0, 0, size, size);
    
    // Add an arrow to indicate direction
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    
    if (direction === 'north') {
      ctx.moveTo(size/2, size/4);
      ctx.lineTo(size/4, size*3/4);
      ctx.lineTo(size*3/4, size*3/4);
    } else if (direction === 'south') {
      ctx.moveTo(size/2, size*3/4);
      ctx.lineTo(size/4, size/4);
      ctx.lineTo(size*3/4, size/4);
    } else if (direction === 'east') {
      ctx.moveTo(size*3/4, size/2);
      ctx.lineTo(size/4, size/4);
      ctx.lineTo(size/4, size*3/4);
    } else {
      ctx.moveTo(size/4, size/2);
      ctx.lineTo(size*3/4, size/4);
      ctx.lineTo(size*3/4, size*3/4);
    }
    
    ctx.fill();
    
    // Convert canvas to image
    const image = new Image();
    image.src = canvas.toDataURL();
    return image;
  };
  
  // Animation loop
  useEffect(() => {
    const animate = (timestamp: number) => {
      if (!canvasRef.current) return;
      
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d')!;
      
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // If no frames are loaded, show a placeholder
      if (frameImages.length === 0) {
        if (!isLoading) {
          ctx.fillStyle = '#FF6B6B';
          ctx.fillRect(0, 0, size, size);
          ctx.fillStyle = '#FFFFFF';
          ctx.font = '8px monospace';
          ctx.fillText('NO', 2, 10);
          ctx.fillText('ANIM', 2, 20);
        }
        animationRef.current = requestAnimationFrame(animate);
        return;
      }
      
      // Animation timing
      const frameRate = state === 'walk' ? 150 : 500; // ms per frame
      if (timestamp - lastFrameTime.current >= frameRate) {
        if (state === 'walk') {
          setCurrentFrame(prev => (prev + 1) % frameImages.length);
        } else {
          setCurrentFrame(0); // Use first frame for idle
        }
        lastFrameTime.current = timestamp;
      }
      
      // Draw current frame
      const frame = frameImages[currentFrame % frameImages.length];
      if (frame && frame.complete && frame.naturalWidth > 0) {
        try {
          // Draw the character
          ctx.drawImage(
            frame,
            0, 0, frame.width, frame.height,
            0, 0, size, size
          );
          
          // Apply hit flash effect if player was recently hit
          const timeSinceHit = hitFlash ? timestamp - hitFlash : Infinity;
          if (timeSinceHit < 500) { // Flash for 500ms
            // Save context to restore after drawing the flashing effect
            ctx.save();
            
            // Set global composite operation to overlay the red flash
            ctx.globalCompositeOperation = 'source-atop';
            
            // Flash with opacity that fades out over time
            const opacity = 0.7 * (1 - timeSinceHit / 500);
            ctx.fillStyle = `rgba(255, 0, 0, ${opacity})`;
            ctx.fillRect(0, 0, size, size);
            
            ctx.restore();
          }
        } catch (drawError) {
          console.error('❌ Draw error:', drawError);
        }
      }
      
      animationRef.current = requestAnimationFrame(animate);
    };
    
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [frameImages, currentFrame, state, size, isLoading, hitFlash]);
  
  return (
    <div style={{ position: 'relative' }}>
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        style={{
          imageRendering: 'pixelated',
          display: 'block'
        }}
      />
      
      {debug && (
        <div style={{
          position: 'absolute',
          top: -25,
          left: 0,
          fontSize: '10px',
          backgroundColor: 'rgba(0,0,0,0.8)',
          color: 'white',
          padding: '2px 4px',
          borderRadius: '2px',
          whiteSpace: 'nowrap'
        }}>
          {direction}/{state} - Frame: {currentFrame}
          {isLoading && ' (Loading...)'}
        </div>
      )}
    </div>
  );
}; 