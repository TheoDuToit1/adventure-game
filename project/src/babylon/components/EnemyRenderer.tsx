import React, { useRef, useEffect, useState } from 'react'
import { EnemyConfig } from '../../types/game'

interface EnemyRendererProps {
  enemies: EnemyConfig[]
  player: { 
    position: { x: number, y: number },
    size: number
  }
  tileSize: number
  canvasWidth: number
  canvasHeight: number
}

export const EnemyRenderer: React.FC<EnemyRendererProps> = ({
  enemies,
  player,
  tileSize,
  canvasWidth,
  canvasHeight
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const lastRenderTime = useRef<number>(0)
  
  // Cache enemy positions to reduce rendering overhead
  const enemyPositionCache = useRef<Map<string, { x: number, y: number }>>(new Map())

  // Cache MM enemy images to prevent flashing
  const mmImageCache = useRef<Map<string, HTMLImageElement>>(new Map())

  // At the top, add a cache for ghost images
  const ghostImageCache = useRef<(HTMLImageElement | null)[]>([null, null, null, null]);
  
  // Add a cache for grunt images (for each direction)
  const gruntImageCache = useRef<{
    Up: HTMLImageElement[],
    Down: HTMLImageElement[],
    Left: HTMLImageElement[],
    Right: HTMLImageElement[]
  }>({
    Up: [],
    Down: [],
    Left: [],
    Right: []
  });

  // Add a state to track bubble effects
  const [bubbleEffects, setBubbleEffects] = useState<{x: number, y: number, start: number, id: string}[]>([]);

  // Preload MM enemy images
  useEffect(() => {
    // Common MM enemy image paths
    const mmImagePaths = [
      '/src/public/mm1.png',
      '/src/public/mm2.png'
    ];
    
    // Preload all images
    mmImagePaths.forEach(path => {
      if (!mmImageCache.current.has(path)) {
        const img = new window.Image();
        img.src = path;
        mmImageCache.current.set(path, img);
        console.log(`Preloaded MM enemy image: ${path}`);
      }
    });
    
    // Also preload any images from current enemies
    enemies.forEach(enemy => {
      if (enemy.type === 'mm' && enemy.mmData?.imageUrl) {
        const path = enemy.mmData.imageUrl;
        if (!mmImageCache.current.has(path)) {
          const img = new window.Image();
          img.src = path;
          mmImageCache.current.set(path, img);
          console.log(`Preloaded MM enemy image from current enemies: ${path}`);
        }
      }
    });
  }, []);

  // Preload ghost images on mount
  useEffect(() => {
    const framePaths = [
      '/public/enemies/Ghost/1.png',
      '/public/enemies/Ghost/2.png',
      '/public/enemies/Ghost/3.png',
      '/public/enemies/Ghost/4.png',
    ];
    framePaths.forEach((path, i) => {
      if (!ghostImageCache.current[i]) {
        const img = new window.Image();
        img.src = path;
        ghostImageCache.current[i] = img;
      }
    });
  }, []);
  
  // Preload grunt images on mount
  useEffect(() => {
    const directions = ['Up', 'Down', 'Left', 'Right'] as const;
    const fileNameMap = {
      'Down': ['08_grunt.png', '09_grunt.png', '10_grunt.png', '11_grunt.png'],
      'Up': ['00_grunt.png', '01_grunt.png', '02_grunt.png', '03_grunt.png'],
      'Left': ['12_grunt.png', '13_grunt.png', '14_grunt.png', '15_grunt.png'],
      'Right': ['04_grunt.png', '05_grunt.png', '06_grunt.png', '07_grunt.png']
    };
    
    directions.forEach(dir => {
      // Load 4 frames for each direction
      for (let i = 0; i < 4; i++) {
        const fileName = fileNameMap[dir][i];
        const path = `/enemies/Grunt/${dir}/${fileName}`;
        const img = new window.Image();
        img.src = path;
        img.onload = () => {
          console.log(`Loaded Grunt ${dir} frame ${i}: ${fileName}`);
        };
        img.onerror = (err) => {
          console.error(`Failed to load Grunt ${dir} frame ${i}: ${fileName}`, err);
        };
        gruntImageCache.current[dir][i] = img;
      }
    });
  }, []);

  // Listen for ghost deaths and add a bubble effect
  useEffect(() => {
    // Listen for ghost removals (could use a prop or event system, but for now, poll for missing ghosts)
    let prevGhostIds = new Set<string>();
    let animationFrame: number;
    function checkGhosts() {
      const now = Date.now();
      const currentGhostIds = new Set(enemies.filter(s => s.type === 'ghost').map(s => s.id));
      // Find ghosts that disappeared
      prevGhostIds.forEach(id => {
        if (!currentGhostIds.has(id)) {
          // Find last known position
          const last = enemyPositionCache.current.get(id);
          if (last) {
            setBubbleEffects(effects => [...effects, { x: last.x, y: last.y, start: now, id: id + '_' + now }]);
          }
        }
      });
      prevGhostIds = currentGhostIds;
      animationFrame = requestAnimationFrame(checkGhosts);
    }
    animationFrame = requestAnimationFrame(checkGhosts);
    return () => cancelAnimationFrame(animationFrame);
  }, [enemies]);

  // Clean up old bubble effects
  useEffect(() => {
    if (bubbleEffects.length === 0) return;
    const interval = setInterval(() => {
      const now = Date.now();
      setBubbleEffects(effects => effects.filter(e => now - e.start < 350));
    }, 100);
    return () => clearInterval(interval);
  }, [bubbleEffects]);

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Throttle rendering to improve performance
    const now = performance.now()
    if (now - lastRenderTime.current < 16) { // Cap at ~60fps for enemy rendering
      return
    }
    lastRenderTime.current = now

    // Clear canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight)

    // Combine player and enemies, sort by Y position
    const allSprites = enemies;
    allSprites.sort((a, b) => (a.position.y + (a.size || tileSize)/2) - (b.position.y + (b.size || tileSize)/2));

    allSprites.forEach(sprite => {
        // Update position cache
      enemyPositionCache.current.set(sprite.id, { x: sprite.position.x, y: sprite.position.y });
      
      // Apply hit flash effect if enemy was recently hit
      const timeSinceHit = sprite.hitFlash ? now - sprite.hitFlash : Infinity;
      const isFlashing = timeSinceHit < 500; // Flash for 500ms
      
      ctx.save();
      
      // Draw based on enemy type first
      if (sprite.type === 'ghost') {
        drawGhost(ctx, sprite, now);
      } else if (sprite.type === 'grunt') {
        drawGrunt(ctx, sprite, now);
      } else switch (sprite.type) {
        case 'skeleton':
          drawSkeleton(ctx, sprite, now);
          break;
        case 'mm':
          drawMMEnemy(ctx, sprite, now);
          break;
        default:
          drawDefaultEnemy(ctx, sprite);
      }
      
      // Then overlay the flash effect if needed
      if (isFlashing) {
        // Set global composite operation to overlay the red flash
        ctx.globalCompositeOperation = 'source-atop';
        
        // Flash with opacity that fades out over time
        const opacity = 0.7 * (1 - timeSinceHit / 500);
        ctx.fillStyle = `rgba(255, 0, 0, ${opacity})`;
        ctx.fillRect(
          sprite.position.x, 
          sprite.position.y, 
          sprite.size, 
          sprite.size
        );
      }
      
      ctx.restore();
    });

    // Draw bubble effects
    bubbleEffects.forEach(effect => {
      const age = now - effect.start;
      const progress = age / 350; // 0 to 1 over 350ms
      const size = tileSize * (0.5 + progress * 0.5);
      const opacity = 1 - progress;
      
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.fillStyle = 'rgba(200, 200, 255, 0.7)';
      ctx.beginPath();
      ctx.arc(effect.x + tileSize/2, effect.y + tileSize/2, size/2, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    });
  }, [enemies, canvasWidth, canvasHeight, bubbleEffects, tileSize])

  // Draw a skeleton enemy
  const drawSkeleton = (ctx: CanvasRenderingContext2D, enemy: EnemyConfig, time: number) => {
    const x = enemy.position.x
    const y = enemy.position.y
    const size = enemy.size
    
    // Calculate center for rotation
    const centerX = size / 2
    const centerY = size / 2
    
    // Skeleton animation effects
    const bobAmount = Math.sin(time * 0.01) * 2 // Bobbing up and down
    const attackBob = enemy.aiState === 'attack' ? Math.sin(time * 0.02) * 4 : 0 // Extra bobbing when attacking

    ctx.save()
    // Translate to the enemy position first, then to center for rotation
    ctx.translate(x + centerX, y + centerY + bobAmount + attackBob)
    ctx.rotate(enemy.rotation)
    
    // Skeleton body - bone white
    ctx.fillStyle = '#E0E0E0'
    ctx.beginPath()
    ctx.ellipse(0, 0, size * 0.35, size * 0.4, 0, 0, 2 * Math.PI)
    ctx.fill()
    
    // Skeleton outline
    ctx.strokeStyle = '#AAAAAA'
    ctx.lineWidth = 2
    ctx.stroke()
    
    // Skeleton eyes - empty sockets
    ctx.fillStyle = '#333333'
    ctx.beginPath()
    ctx.ellipse(-size * 0.15, -size * 0.1, 4, 5, 0, 0, 2 * Math.PI)
    ctx.fill()
    
    ctx.beginPath()
    ctx.ellipse(size * 0.15, -size * 0.1, 4, 5, 0, 0, 2 * Math.PI)
    ctx.fill()
    
    // Skeleton teeth
    ctx.fillStyle = '#FFFFFF'
    const teethWidth = size * 0.3
    const teethHeight = size * 0.1
    const teethY = size * 0.15
    
    // Draw teeth as small rectangles
    for (let i = -2; i <= 2; i++) {
      const toothX = (i * teethWidth / 5)
      ctx.fillRect(
        toothX - teethWidth / 12,
        teethY - teethHeight / 2,
        teethWidth / 6,
        teethHeight
      )
    }
    
    // Arms/bones sticking out when attacking
    if (enemy.aiState === 'attack') {
      // Left arm
      ctx.strokeStyle = '#E0E0E0'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(-size * 0.3, 0)
      ctx.lineTo(-size * 0.5, -size * 0.2)
      ctx.stroke()
      
      // Right arm
      ctx.beginPath()
      ctx.moveTo(size * 0.3, 0)
      ctx.lineTo(size * 0.5, -size * 0.2)
      ctx.stroke()
    }
    
    ctx.restore()
  }

  const drawMMEnemy = (ctx: CanvasRenderingContext2D, enemy: EnemyConfig, time: number) => {
    // If this is the new Zombie MM enemy and has an image_url, draw the image
    if (enemy.type === 'mm' && enemy.mmData?.name === 'Zombie MM' && enemy.mmData?.imageUrl) {
      const imageUrl = enemy.mmData.imageUrl;
      const size = enemy.size;
      const centerX = size / 2;
      const centerY = size / 2;
      
      // Use cached image or create a new one
      let img: HTMLImageElement;
      if (mmImageCache.current.has(imageUrl)) {
        img = mmImageCache.current.get(imageUrl)!;
      } else {
        img = new window.Image();
        img.src = imageUrl;
        mmImageCache.current.set(imageUrl, img);
      }
      
      // Only draw the image if it's loaded
      if (img.complete && img.naturalWidth > 0) {
        ctx.save();
        // Translate to the enemy position first, then to center for rotation
        ctx.translate(enemy.position.x + centerX, enemy.position.y + centerY);
        // Apply rotation with an offset of -Math.PI/2 (90 degrees counterclockwise)
        // This adjusts for the fact that the original image faces downward
        ctx.rotate(enemy.rotation - Math.PI/2);
        ctx.globalAlpha = 1.0;
        // Draw image centered at rotation point
        ctx.drawImage(
          img,
          -centerX, // x offset from center
          -centerY, // y offset from center
          size,
          size
        );
        ctx.restore();
      }
      return;
    }

    // Get actual position from enemy object
    const x = enemy.position.x
    const y = enemy.position.y
    const size = enemy.size
    
    // Calculate center for rotation
    const centerX = size / 2
    const centerY = size / 2
    const shake = Math.sin(time * 0.01) * 2

    ctx.save()
    // Translate to the enemy position first, then to center for rotation
    ctx.translate(x + centerX + shake * 0.3, y + centerY)
    ctx.rotate(enemy.rotation)
    
    // MM enemy body (custom color with glow)
    const bodyGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size / 2)
    bodyGradient.addColorStop(0, '#FF9500')
    bodyGradient.addColorStop(0.7, '#FF5500')
    bodyGradient.addColorStop(1, '#FF3300')
    
    ctx.fillStyle = bodyGradient
    ctx.beginPath()
    ctx.ellipse(0, 0, size * 0.4, size * 0.45, 0, 0, 2 * Math.PI)
    ctx.fill()
    
    // Add glow effect
    ctx.shadowColor = '#FF5500'
    ctx.shadowBlur = 15
    ctx.strokeStyle = '#FFAA00'
    ctx.lineWidth = 2
    ctx.stroke()
    
    // Eyes (glowing)
    ctx.fillStyle = '#FFFFFF'
    ctx.shadowColor = '#FFFFFF'
    ctx.shadowBlur = 8
    ctx.beginPath()
    ctx.arc(-size * 0.15, -size * 0.1, 5, 0, 2 * Math.PI)
    ctx.fill()
    
    ctx.beginPath()
    ctx.arc(size * 0.15, -size * 0.1, 5, 0, 2 * Math.PI)
    ctx.fill()
    ctx.shadowBlur = 0
    
    // Mouth (angry)
    ctx.strokeStyle = '#FFFFFF'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(0, size * 0.1, size * 0.2, 0.1 * Math.PI, 0.9 * Math.PI, false)
    ctx.stroke()
    
    ctx.restore()
  }

  const drawDefaultEnemy = (ctx: CanvasRenderingContext2D, enemy: EnemyConfig) => {
    const x = enemy.position.x
    const y = enemy.position.y
    const size = enemy.size

    ctx.fillStyle = enemy.color || '#FF0000'
    ctx.beginPath()
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2)
    ctx.fill()
  }

  // Add drawGhost function
  const drawGhost = (ctx: CanvasRenderingContext2D, enemy: EnemyConfig, time: number) => {
    const x = enemy.position.x;
    const y = enemy.position.y;
    const size = enemy.size;
    const centerX = size / 2;
    const centerY = size / 2;

    // Determine direction (angle in radians, 0 = up)
    const angle = Math.atan2(enemy.direction.y, enemy.direction.x);
    // Gauntlet II ghosts always face their movement direction; default to up if not moving
    let rotation = -Math.PI / 2; // Up
    if (enemy.direction.x !== 0 || enemy.direction.y !== 0) {
      rotation = Math.atan2(enemy.direction.y, enemy.direction.x) + Math.PI / 2;
    }

    // Animation frame: cycle through 4 frames for walking
    const walkSpeed = 120; // ms per frame
    const frameIdx = Math.floor((time / walkSpeed) % 4);
    const img = ghostImageCache.current[frameIdx];
    if (!img || !img.complete) return;

    ctx.save();
    ctx.translate(x + centerX, y + centerY);
    ctx.rotate(rotation);
    ctx.globalAlpha = 0.92;
    ctx.drawImage(img, -centerX, -centerY, size, size);
    ctx.restore();
  };
  
  // Add drawGrunt function
  const drawGrunt = (ctx: CanvasRenderingContext2D, enemy: EnemyConfig, time: number) => {
    const x = enemy.position.x;
    const y = enemy.position.y;
    const size = enemy.size;
    const centerX = size / 2;
    const centerY = size / 2;
    
    // Determine direction based on enemy movement
    let direction: 'Up' | 'Down' | 'Left' | 'Right' = 'Down'; // Default direction
    
    // Get direction based on movement vector
    if (Math.abs(enemy.direction.x) > Math.abs(enemy.direction.y)) {
      // Moving horizontally
      direction = enemy.direction.x > 0 ? 'Right' : 'Left';
    } else {
      // Moving vertically
      direction = enemy.direction.y > 0 ? 'Down' : 'Up';
    }
    
    // Animation frame: cycle through frames for walking
    const walkSpeed = 150; // ms per frame
    const frameIdx = Math.floor((time / walkSpeed) % 4);
    
    try {
      // Get the appropriate image based on direction and frame
      const img = gruntImageCache.current[direction][frameIdx];
      
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.save();
        ctx.drawImage(img, x, y, size, size);
        ctx.restore();
        return;
      }
      
      // If we get here, the image wasn't successfully loaded
      renderFallbackGrunt(ctx, enemy, time);
    } catch (error) {
      console.error(`Error rendering Grunt (${direction}, frame ${frameIdx}):`, error);
      renderFallbackGrunt(ctx, enemy, time);
    }
  };
  
  // Fallback rendering for Grunts when images fail to load
  const renderFallbackGrunt = (ctx: CanvasRenderingContext2D, enemy: EnemyConfig, time: number) => {
    const x = enemy.position.x;
    const y = enemy.position.y;
    const size = enemy.size;
    
    ctx.save();
    
    // Draw a brown square as the body
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(x, y, size, size);
    
    // Add some details to make it look like a grunt
    ctx.fillStyle = '#654321';
    
    // Draw eyes
    const eyeSize = size / 8;
    const eyeOffset = size / 4;
    ctx.fillRect(x + eyeOffset, y + eyeOffset, eyeSize, eyeSize);
    ctx.fillRect(x + size - eyeOffset - eyeSize, y + eyeOffset, eyeSize, eyeSize);
    
    // Draw mouth
    ctx.fillRect(x + size/4, y + size - eyeOffset - eyeSize/2, size/2, eyeSize/2);
    
    // Draw a simple animation effect
    const bobAmount = Math.sin(time * 0.01) * 2;
    ctx.strokeStyle = '#654321';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y + bobAmount, size, size);
    
    ctx.restore();
  };

  return (
    <canvas
      ref={canvasRef}
      width={canvasWidth}
      height={canvasHeight}
      className="absolute top-0 left-0 z-10 pointer-events-none"
      style={{ imageRendering: 'pixelated' }}
    />
  )
}