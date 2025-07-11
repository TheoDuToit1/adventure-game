import React, { useRef, useEffect, useMemo, useState } from 'react'
import { GameState } from '../../types/game'
import { EnemyRenderer } from './EnemyRenderer'

// At the top, import ObjectAssetService
import { ObjectAssetService } from '../../services/ObjectAssetService';

// Use ES module imports for images
import wizardImgSrc from '../../assets/wizard.png'

// Create Image objects
const wizardImg = new window.Image()
wizardImg.src = wizardImgSrc
const bonePileImg = new window.Image()
// Will be set in the useEffect
const gruntSpawnerImg = new window.Image()
// Will be set in the useEffect

// --- Fireball and Statue logic ---
const FIREBALL_SPEED = 6; // tiles per second
const FIREBALL_SIZE = 16;
const FIREBALL_INTERVAL = 1000; // ms (per tower)

interface GameCanvasProps {
  gameState: GameState
  width: number
  height: number
  gameProgress?: {
    currentRoom: 'S1' | 'S3' | 'S2'
    kills: number
    gameWon: boolean
    chestsOpened: Set<number>
    chestContents: Map<number, 'food' | 'poison' | 'potion'>
    potionsCollected?: Set<string>
    powerUpActive?: boolean
    powerUpEndTime?: number
    score?: number
    keyCount?: number
  }
  spawnerHealth?: { [key: string]: number }
  spawnerFlash?: { [key: string]: number }
}

export const GameCanvas: React.FC<GameCanvasProps> = ({
  gameState,
  width,
  height,
  gameProgress,
  spawnerHealth = {},
  spawnerFlash = {}
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const lastRenderTime = useRef<number>(0)
  const TILE_SIZE = 32

  // --- Fireball system ---
  const fireballsRef = useRef<Array<{ x: number, y: number, dx: number, dy: number, ttl: number }>>([])

  // Calculate visible tile range based on camera position
  const visibleTileRange = useMemo(() => {
    if (!gameState.player || !gameState.player.position) return { startX: 0, endX: 36, startY: 0, endY: 36 }
    
    // Get camera position from player position
    const camX = Math.max(0, Math.min(gameState.player.position.x - 400, width - 800))
    const camY = Math.max(0, Math.min(gameState.player.position.y - 300, height - 600))
    
    // Convert to tile coordinates with a margin of 2 tiles
    const startX = Math.max(0, Math.floor(camX / TILE_SIZE) - 2)
    const startY = Math.max(0, Math.floor(camY / TILE_SIZE) - 2)
    const endX = Math.min(36, Math.ceil((camX + 800) / TILE_SIZE) + 2)
    const endY = Math.min(36, Math.ceil((camY + 600) / TILE_SIZE) + 2)
    
    return { startX, endX, startY, endY }
  }, [gameState.player.position.x, gameState.player.position.y, width, height])

  // Add state for the timed wizard tower
  const [timedWizardTower, setTimedWizardTower] = useState<null | { x: number, y: number, expiresAt: number, lastShot: number }>(null);

  // Add state for animated bone piles (ghost spawners)
  const [bonePiles, setBonePiles] = useState<Array<{ x: number, y: number, health: number }>>([]);

  // Add state for animated grunt spawners
  const [gruntSpawners, setGruntSpawners] = useState<Array<{ x: number, y: number, health: number }>>([]);

  // In the component, load images using ObjectAssetService
  const [objectImages, setObjectImages] = useState<{ [key: string]: HTMLImageElement | null }>({});

  useEffect(() => {
    const loadAssets = async () => {
      const service = ObjectAssetService.getInstance();
      
      // Create images for spawners with correct paths
      const ghostSpawnerImg = new Image();
      ghostSpawnerImg.src = '/enemies/Spawners/ghost-spawners.png';
      
      // Create grunt spawner image using direct path
      const gruntSpawnerImg = new Image();
      gruntSpawnerImg.src = '/enemies/Spawners/grunt-spawners.png';
      
      // Log image loading attempts
      console.log('Attempting to load spawner images:');
      console.log('Ghost spawner path:', ghostSpawnerImg.src);
      console.log('Grunt spawner path:', gruntSpawnerImg.src);
      
      // Wait for images to load
      const loadImage = (img: HTMLImageElement) => {
        return new Promise<HTMLImageElement | null>((resolve) => {
          if (img.complete) {
            const isLoaded = img.naturalWidth > 0;
            console.log(`Image ${img.src} complete check: ${isLoaded ? 'loaded' : 'failed'}`);
            resolve(isLoaded ? img : null);
          } else {
            img.onload = () => {
              console.log(`Image ${img.src} loaded successfully`);
              resolve(img);
            };
            img.onerror = (err) => {
              console.error(`Failed to load image: ${img.src}`, err);
              resolve(null);
            };
          }
        });
      };
      
      // Load bone pile image from database as fallback
      const bonePileObjs = await service.getObjectsByType('item');
      const bonePileObj = bonePileObjs.find(obj => obj.name.toLowerCase().includes('bonepile'));
      const bonePileDbImg = bonePileObj ? await service.loadObjectImage(bonePileObj.image_url) : null;
      
      // Try to load spawner images, use fallbacks if they fail
      const [loadedGhostSpawnerImg, loadedGruntSpawnerImg] = await Promise.all([
        loadImage(ghostSpawnerImg),
        loadImage(gruntSpawnerImg)
      ]);
      
      // Set object images with appropriate fallbacks
      setObjectImages({ 
        bonePile: loadedGhostSpawnerImg || bonePileDbImg,
        gruntSpawner: loadedGruntSpawnerImg
      });
      
      console.log('Loaded spawner images:', 
                  loadedGhostSpawnerImg ? 'Ghost spawner ✅' : 'Ghost spawner ❌', 
                  loadedGruntSpawnerImg ? 'Grunt spawner ✅' : 'Grunt spawner ❌');
    };
    
    loadAssets();
  }, []);

  // Helper: Find nearest wall tile to player
  function findNearestWallTile(px: number, py: number) {
    let minDist = Infinity;
    let best = { x: 0, y: 0 };
    for (let y = 0; y < gameState.level.map.length; y++) {
      for (let x = 0; x < gameState.level.map[y].length; x++) {
        if (gameState.level.map[y][x] === '#') {
          const dx = x * TILE_SIZE + TILE_SIZE / 2 - px;
          const dy = y * TILE_SIZE + TILE_SIZE / 2 - py;
          const dist = dx * dx + dy * dy;
          if (dist < minDist) {
            minDist = dist;
            best = { x, y };
          }
        }
      }
    }
    return best;
  }

  // Timer to spawn a wizard tower every 20 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      // Find nearest wall tile to player
      const px = gameState.player.position.x + TILE_SIZE / 2;
      const py = gameState.player.position.y + TILE_SIZE / 2;
      let minDist = Infinity;
      let nearest = null;
      for (let y = 0; y < gameState.level.map.length; y++) {
        for (let x = 0; x < gameState.level.map[y].length; x++) {
          if (gameState.level.map[y][x] === '#') {
            const cx = x * TILE_SIZE + TILE_SIZE / 2;
            const cy = y * TILE_SIZE + TILE_SIZE / 2;
            const dist = Math.hypot(cx - px, cy - py);
            if (dist < minDist) {
              minDist = dist;
              nearest = { x, y };
            }
          }
        }
      }
      if (nearest) {
        setTimedWizardTower({
          x: nearest.x,
          y: nearest.y,
          expiresAt: Date.now() + 5000,
          lastShot: Date.now()
        });
      }
    }, 20000);
    return () => clearInterval(interval);
  }, [gameState.level.map, gameState.player.position.x, gameState.player.position.y]);

  // Remove the timed wizard tower after 5 seconds
  useEffect(() => {
    if (!timedWizardTower) return;
    const timeout = setTimeout(() => setTimedWizardTower(null), timedWizardTower.expiresAt - Date.now());
    return () => clearTimeout(timeout);
  }, [timedWizardTower]);

  // Timed wizard tower shooting logic
  useEffect(() => {
    if (!timedWizardTower) return;
    const shoot = () => {
      const now = Date.now();
      if (now - timedWizardTower.lastShot >= 1000) {
        // Shoot fireball at player
        const cx = timedWizardTower.x * TILE_SIZE + TILE_SIZE / 2;
        const cy = timedWizardTower.y * TILE_SIZE + TILE_SIZE / 2;
        const px = gameState.player.position.x + TILE_SIZE / 2;
        const py = gameState.player.position.y + TILE_SIZE / 2;
        const angle = Math.atan2(py - cy, px - cx);
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        fireballsRef.current.push({
          x: cx - FIREBALL_SIZE / 2,
          y: cy - FIREBALL_SIZE / 2,
          dx,
          dy,
          ttl: 2000
        });
        setTimedWizardTower(t => t ? { ...t, lastShot: now } : null);
      }
    };
    const interval = setInterval(shoot, 100);
    return () => clearInterval(interval);
  }, [timedWizardTower, gameState.player.position.x, gameState.player.position.y]);

  // Fireball animation loop (move, collision, draw)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')!
    
    // Throttle rendering to improve performance
    const now = performance.now()
    if (now - lastRenderTime.current < 33) { // Cap at ~30fps for map rendering
      return
    }
    lastRenderTime.current = now
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height)

    // Draw background with subtle texture
    const bgGradient = ctx.createLinearGradient(0, 0, width, height)
    bgGradient.addColorStop(0, '#1a1a1a')
    bgGradient.addColorStop(0.5, '#2d2d2d')
    bgGradient.addColorStop(1, '#1a1a1a')
    ctx.fillStyle = bgGradient
    ctx.fillRect(0, 0, width, height)

    // --- Lighting effect: Dungeon darkness with player light ---
    // Draw a dark overlay with a circular gradient centered on the player
    const playerX = gameState.player.position.x + TILE_SIZE / 2;
    const playerY = gameState.player.position.y + TILE_SIZE / 2;
    const lightRadius = TILE_SIZE * 4.5; // How far the light reaches
    const darkness = ctx.createRadialGradient(
      playerX, playerY, TILE_SIZE * 1.2, // inner bright radius
      playerX, playerY, lightRadius      // outer dark radius
    );
    darkness.addColorStop(0, 'rgba(0,0,0,0)');
    darkness.addColorStop(0.5, 'rgba(0,0,0,0.3)');
    darkness.addColorStop(1, 'rgba(0,0,0,0.92)');
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = darkness;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';

    // Only draw visible tiles
    const { startX, endX, startY, endY } = visibleTileRange
    
    // Draw level map with enhanced visuals - only visible tiles
    for (let y = startY; y < endY; y++) {
      if (y < 0 || y >= gameState.level.map.length) continue
      
      const row = gameState.level.map[y]
      for (let x = startX; x < endX; x++) {
        if (x < 0 || x >= row.length) continue
        
        const tile = row[x]
        const tileX = x * TILE_SIZE
        const tileY = y * TILE_SIZE

        switch (tile) {
          case '#':
            // Enhanced wall rendering with depth
            const wallGradient = ctx.createLinearGradient(tileX, tileY, tileX + TILE_SIZE, tileY + TILE_SIZE)
            wallGradient.addColorStop(0, '#6B7280')
            wallGradient.addColorStop(0.3, '#4B5563')
            wallGradient.addColorStop(0.7, '#374151')
            wallGradient.addColorStop(1, '#1F2937')
            
            ctx.fillStyle = wallGradient
            ctx.fillRect(tileX, tileY, TILE_SIZE, TILE_SIZE)
            
            // Wall highlights and shadows for 3D effect
            ctx.fillStyle = '#9CA3AF'
            ctx.fillRect(tileX, tileY, TILE_SIZE, 2) // Top highlight
            ctx.fillRect(tileX, tileY, 2, TILE_SIZE) // Left highlight
            
            ctx.fillStyle = '#111827'
            ctx.fillRect(tileX, tileY + TILE_SIZE - 2, TILE_SIZE, 2) // Bottom shadow
            ctx.fillRect(tileX + TILE_SIZE - 2, tileY, 2, TILE_SIZE) // Right shadow
            
            // Stone texture lines - simplified for performance
            if (Math.random() < 0.5) { // Only draw texture on some walls to improve performance
            ctx.strokeStyle = '#374151'
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(tileX + TILE_SIZE * 0.3, tileY + 2)
            ctx.lineTo(tileX + TILE_SIZE * 0.7, tileY + TILE_SIZE - 2)
            ctx.stroke()
            }
            break
            
          case '.':
            // Enhanced floor with simplified pattern for better performance
            ctx.fillStyle = '#1F2937'
            ctx.fillRect(tileX, tileY, TILE_SIZE, TILE_SIZE)
            
            // Subtle floor pattern - only on some tiles for performance
            if ((x + y) % 5 === 0) {
              ctx.fillStyle = 'rgba(75, 85, 99, 0.3)'
              ctx.fillRect(tileX + 4, tileY + 4, TILE_SIZE - 8, TILE_SIZE - 8)
            }
            break
            
          case 'D':
            // Render door as emoji only, centered in the tile
            ctx.clearRect(tileX, tileY, TILE_SIZE, TILE_SIZE);
            ctx.font = '28px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🚪', tileX + TILE_SIZE/2, tileY + TILE_SIZE/2);
            // If locked, show lock above
            if (!(gameProgress && gameProgress.keyCount && gameProgress.keyCount > 0)) {
              ctx.font = '18px serif';
              ctx.fillText('🔒', tileX + TILE_SIZE/2, tileY + TILE_SIZE/2 - 18);
            }
            break;
            
          case 'E':
            // Enhanced exit door - always available
            const exitGradient = ctx.createLinearGradient(tileX, tileY, tileX, tileY + TILE_SIZE)
            exitGradient.addColorStop(0, '#FBBF24')
            exitGradient.addColorStop(0.5, '#F59E0B')
            exitGradient.addColorStop(1, '#D97706')
            
            ctx.fillStyle = exitGradient
            ctx.fillRect(tileX, tileY, TILE_SIZE, TILE_SIZE)
            
            // Magical glow effect for exit
            const glowTime = Date.now() * 0.003
            const glowIntensity = Math.sin(glowTime) * 0.3 + 0.7
            
            ctx.shadowColor = '#F59E0B'
            ctx.shadowBlur = 15 * glowIntensity
            ctx.strokeStyle = '#FBBF24'
            ctx.lineWidth = 2
            ctx.strokeRect(tileX, tileY, TILE_SIZE, TILE_SIZE)
            ctx.shadowBlur = 0
            
            // Exit symbol
            ctx.fillStyle = '#FFFFFF'
            ctx.font = 'bold 16px monospace'
            ctx.textAlign = 'center'
            ctx.shadowColor = '#F59E0B'
            ctx.shadowBlur = 8
            ctx.fillText('🚪', tileX + TILE_SIZE/2, tileY + TILE_SIZE/2 + 6)
            ctx.shadowBlur = 0
            
            ctx.fillStyle = '#FBBF24'
            ctx.font = 'bold 10px monospace'
            ctx.fillText('EXIT', tileX + TILE_SIZE/2, tileY + 8)
            break
            
          case 'P':
            // If 'P' is a buff potion, draw the light potion image
            if (objectImages.potion && objectImages.potion instanceof window.HTMLImageElement) {
              ctx.drawImage(objectImages.potion, tileX, tileY, TILE_SIZE, TILE_SIZE);
            } else {
              ctx.fillStyle = '#888';
              ctx.fillRect(tileX, tileY, TILE_SIZE, TILE_SIZE);
            }
            break
            
          case 'F':
            // Draw food image
            if (objectImages.food && objectImages.food instanceof window.HTMLImageElement) {
              ctx.drawImage(objectImages.food, tileX, tileY, TILE_SIZE, TILE_SIZE);
            } else {
              ctx.fillStyle = '#888';
              ctx.fillRect(tileX, tileY, TILE_SIZE, TILE_SIZE);
            }
            break
            
          case 'S':
            // Draw wizard tower image
            try {
              if (wizardImg && wizardImg.complete && wizardImg.naturalWidth > 0) {
                ctx.drawImage(wizardImg, tileX, tileY, TILE_SIZE, TILE_SIZE);
              } else {
                // Fallback if image isn't loaded
                ctx.fillStyle = '#AA5500';
                ctx.fillRect(tileX, tileY, TILE_SIZE, TILE_SIZE);
              }
            } catch (error) {
              console.error('Error rendering wizard tower:', error);
              ctx.fillStyle = '#AA5500';
              ctx.fillRect(tileX, tileY, TILE_SIZE, TILE_SIZE);
            }
            break;
            
          case 'B': {
            // Draw bone pile image (ghost spawner)
            const key = `${x},${y}`;
            const health = spawnerHealth[key] ?? 3;
            if (health <= 0) break; // Don't render destroyed spawner
            let flash = false;
            if (spawnerFlash[key] && Date.now() - spawnerFlash[key] < 120) flash = true;
            try {
              if (objectImages.bonePile && 
                  objectImages.bonePile instanceof window.HTMLImageElement &&
                  objectImages.bonePile.complete &&
                  objectImages.bonePile.naturalWidth > 0) {
                ctx.drawImage(objectImages.bonePile, tileX, tileY, TILE_SIZE, TILE_SIZE);
              } else {
                ctx.fillStyle = '#AAAAFF';
                ctx.fillRect(tileX, tileY, TILE_SIZE, TILE_SIZE);
                ctx.fillStyle = '#FFFFFF';
                ctx.beginPath();
                ctx.arc(tileX + TILE_SIZE/2, tileY + TILE_SIZE/2, TILE_SIZE/4, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#DDDDFF';
                ctx.beginPath();
                ctx.arc(tileX + TILE_SIZE/3, tileY + TILE_SIZE/3, TILE_SIZE/6, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(tileX + TILE_SIZE*2/3, tileY + TILE_SIZE*2/3, TILE_SIZE/6, 0, Math.PI * 2);
                ctx.fill();
              }
              // Draw flash overlay if hit
              if (flash) {
                ctx.save();
                ctx.globalAlpha = 0.7;
                ctx.fillStyle = '#fff';
                ctx.fillRect(tileX, tileY, TILE_SIZE, TILE_SIZE);
                ctx.restore();
              }
            } catch (error) {
              ctx.fillStyle = '#AAAAFF';
              ctx.fillRect(tileX, tileY, TILE_SIZE, TILE_SIZE);
            }
            break;
          }
          case 'G': {
            // Draw grunt spawner image directly from the map
            const key = `${x},${y}`;
            const health = spawnerHealth[key] ?? 3;
            if (health <= 0) break; // Don't render destroyed spawner
            let flash = false;
            if (spawnerFlash[key] && Date.now() - spawnerFlash[key] < 120) flash = true;
            try {
              if (objectImages.gruntSpawner && 
                  objectImages.gruntSpawner instanceof window.HTMLImageElement &&
                  objectImages.gruntSpawner.complete &&
                  objectImages.gruntSpawner.naturalWidth > 0) {
                ctx.drawImage(objectImages.gruntSpawner, tileX, tileY, TILE_SIZE, TILE_SIZE);
              } else {
                ctx.fillStyle = '#8B4513';
                ctx.fillRect(tileX, tileY, TILE_SIZE, TILE_SIZE);
                ctx.strokeStyle = '#FF6600';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(tileX + 8, tileY + 8);
                ctx.lineTo(tileX + TILE_SIZE - 8, tileY + TILE_SIZE - 8);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(tileX + TILE_SIZE - 8, tileY + 8);
                ctx.lineTo(tileX + 8, tileY + TILE_SIZE - 8);
                ctx.stroke();
              }
              // Draw flash overlay if hit
              if (flash) {
                ctx.save();
                ctx.globalAlpha = 0.7;
                ctx.fillStyle = '#fff';
                ctx.fillRect(tileX, tileY, TILE_SIZE, TILE_SIZE);
                ctx.restore();
              }
            } catch (error) {
              ctx.fillStyle = '#8B4513';
              ctx.fillRect(tileX, tileY, TILE_SIZE, TILE_SIZE);
            }
            break;
          }
            
          default:
            ctx.fillStyle = '#0F172A'
            ctx.fillRect(tileX, tileY, TILE_SIZE, TILE_SIZE)
        }

        // In the rendering logic, after drawing the wall, draw the wizard image if the timed wizard tower is present at this tile
        if (timedWizardTower && timedWizardTower.x === x && timedWizardTower.y === y) {
          const cx = x * TILE_SIZE + TILE_SIZE / 2;
          const cy = y * TILE_SIZE + TILE_SIZE / 2;
          const px = gameState.player.position.x + TILE_SIZE / 2;
          const py = gameState.player.position.y + TILE_SIZE / 2;
          const angle = Math.atan2(py - cy, px - cx);
          
          try {
            if (wizardImg && wizardImg.complete && wizardImg.naturalWidth > 0) {
              ctx.save();
              ctx.translate(cx, cy);
              ctx.rotate(angle + Math.PI / 2);
              ctx.drawImage(wizardImg, -TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
              ctx.restore();
            } else {
              // Fallback if image isn't loaded
              ctx.fillStyle = '#AA5500';
              ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            }
          } catch (error) {
            console.error('Error rendering timed wizard tower:', error);
            ctx.fillStyle = '#AA5500';
            ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          }
        }
      }
    }

    // Only draw grunt spawners that are within the visible area
    gruntSpawners.forEach(gruntSpawner => {
      // Check if grunt spawner is within visible area
      const gruntSpawnerTileX = Math.floor(gruntSpawner.x / TILE_SIZE)
      const gruntSpawnerTileY = Math.floor(gruntSpawner.y / TILE_SIZE)
      
      if (gruntSpawnerTileX < visibleTileRange.startX || 
          gruntSpawnerTileX >= visibleTileRange.endX || 
          gruntSpawnerTileY < visibleTileRange.startY || 
          gruntSpawnerTileY >= visibleTileRange.endY) {
        return // Skip rendering this grunt spawner
      }
      
      // Calculate pixel coordinates
      const pixelX = gruntSpawnerTileX * TILE_SIZE;
      const pixelY = gruntSpawnerTileY * TILE_SIZE;
      
      console.log(`Rendering grunt spawner at tile (${gruntSpawnerTileX}, ${gruntSpawnerTileY}), pixel (${pixelX}, ${pixelY})`);
      
      try {
        // Draw grunt spawner image
        if (objectImages.gruntSpawner && 
            objectImages.gruntSpawner instanceof window.HTMLImageElement &&
            objectImages.gruntSpawner.complete &&
            objectImages.gruntSpawner.naturalWidth > 0) {
          ctx.drawImage(objectImages.gruntSpawner, pixelX, pixelY, TILE_SIZE, TILE_SIZE);
        } else {
          // Draw a distinct visual for grunt spawner
          ctx.fillStyle = '#8B4513'; // Brown for grunt spawner
          ctx.fillRect(pixelX, pixelY, TILE_SIZE, TILE_SIZE);
          
          // Add some details to make it look like a grunt spawner
          ctx.fillStyle = '#654321';
          ctx.beginPath();
          ctx.arc(pixelX + TILE_SIZE/2, pixelY + TILE_SIZE/2, TILE_SIZE/4, 0, Math.PI * 2);
          ctx.fill();
          
          // Draw a cross pattern
          ctx.strokeStyle = '#FF6600';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(pixelX + TILE_SIZE/4, pixelY + TILE_SIZE/4);
          ctx.lineTo(pixelX + TILE_SIZE*3/4, pixelY + TILE_SIZE*3/4);
          ctx.stroke();
          
          ctx.beginPath();
          ctx.moveTo(pixelX + TILE_SIZE*3/4, pixelY + TILE_SIZE/4);
          ctx.lineTo(pixelX + TILE_SIZE/4, pixelY + TILE_SIZE*3/4);
          ctx.stroke();
        }
      } catch (error) {
        console.error('Error rendering grunt spawner object:', error);
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(pixelX, pixelY, TILE_SIZE, TILE_SIZE);
      }
    })
    
    // Only draw bone piles that are within the visible area
    bonePiles.forEach(bonePile => {
      // Check if bone pile is within visible area
      const bonePileTileX = Math.floor(bonePile.x / TILE_SIZE)
      const bonePileTileY = Math.floor(bonePile.y / TILE_SIZE)
      
      if (bonePileTileX < startX || bonePileTileX >= endX || bonePileTileY < startY || bonePileTileY >= endY) {
        return // Skip rendering this bone pile
      }
      
      try {
        // Draw bone pile image
        if (objectImages.bonePile && 
            objectImages.bonePile instanceof window.HTMLImageElement &&
            objectImages.bonePile.complete &&
            objectImages.bonePile.naturalWidth > 0) {
          ctx.drawImage(objectImages.bonePile, bonePile.x + 4, bonePile.y + 4, TILE_SIZE - 8, TILE_SIZE - 8);
        } else {
          // Draw a distinct visual for ghost spawner
          ctx.fillStyle = '#AAAAFF'; // Light blue for ghost spawner
          ctx.fillRect(bonePile.x + 4, bonePile.y + 4, TILE_SIZE - 8, TILE_SIZE - 8);
          
          // Add some details to make it look like a bone pile
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(bonePile.x + TILE_SIZE/2, bonePile.y + TILE_SIZE/2, TILE_SIZE/5, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.fillStyle = '#DDDDFF';
          ctx.beginPath();
          ctx.arc(bonePile.x + TILE_SIZE/3, bonePile.y + TILE_SIZE/3, TILE_SIZE/7, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.beginPath();
          ctx.arc(bonePile.x + TILE_SIZE*2/3, bonePile.y + TILE_SIZE*2/3, TILE_SIZE/7, 0, Math.PI * 2);
          ctx.fill();
          
          // Add ghostly glow animation
          const glowAmount = Math.sin(performance.now() * 0.005) * 0.3 + 0.7;
          ctx.fillStyle = `rgba(200, 200, 255, ${glowAmount * 0.3})`;
          ctx.beginPath();
          ctx.arc(bonePile.x + TILE_SIZE/2, bonePile.y + TILE_SIZE/2, TILE_SIZE/2, 0, Math.PI * 2);
          ctx.fill();
        }
      } catch (error) {
        console.error('Error rendering bone pile object:', error);
        ctx.fillStyle = '#AAAAFF';
        ctx.fillRect(bonePile.x + 4, bonePile.y + 4, TILE_SIZE - 8, TILE_SIZE - 8);
      }
    })
  }, [gameState.level.map, gameState.player.position, objectImages, timedWizardTower, gameProgress, gruntSpawners, bonePiles, spawnerHealth, spawnerFlash])

  // Debug function to check if spawners match map positions
  useEffect(() => {
    const checkSpawnerPositions = () => {
      if (!gameState || !gameState.level || !gameState.level.map) {
        console.log('Game state or map not available yet');
        return;
      }
      
      console.log('Checking grunt spawner positions against map...');
      
      // Find all grunt spawners in the map
      const mapSpawners: Array<{x: number, y: number}> = [];
      
      for (let y = 0; y < gameState.level.map.length; y++) {
        for (let x = 0; x < gameState.level.map[y].length; x++) {
          if (gameState.level.map[y][x] === 'G') {
            mapSpawners.push({x, y});
          }
        }
      }
      
      console.log('Grunt spawners in map:', mapSpawners);
      console.log('Grunt spawners in state:', gruntSpawners);
      
      // Check if our state matches the map
      const statePositions = gruntSpawners.map(s => ({x: s.x, y: s.y}));
      console.log('State positions match map?', 
        mapSpawners.length === statePositions.length && 
        mapSpawners.every(m => statePositions.some(s => s.x === m.x && s.y === m.y))
      );
    };
    
    // Run the check after a short delay to ensure map is loaded
    const timer = setTimeout(checkSpawnerPositions, 1000);
    return () => clearTimeout(timer);
  }, [gameState.level.map, gruntSpawners]);

  // Synchronize spawners with map positions
  useEffect(() => {
    const syncSpawnersWithMap = () => {
      if (!gameState || !gameState.level || !gameState.level.map) {
        console.log('Game state or map not available yet');
        return;
      }
      
      console.log('Synchronizing grunt spawners with map...');
      
      // Find all grunt spawners in the map
      const mapGruntSpawners: Array<{x: number, y: number}> = [];
      
      for (let y = 0; y < gameState.level.map.length; y++) {
        for (let x = 0; x < gameState.level.map[y].length; x++) {
          if (gameState.level.map[y][x] === 'G') {
            mapGruntSpawners.push({x, y});
          }
        }
      }
      
      console.log(`Found ${mapGruntSpawners.length} grunt spawners in map`);
      
      // Update the grunt spawners state to match the map
      setGruntSpawners(mapGruntSpawners.map(pos => ({
        x: pos.x,
        y: pos.y,
        health: 20
      })));
    };
    
    // Run the sync after a short delay to ensure map is loaded
    const timer = setTimeout(syncSpawnersWithMap, 500);
    return () => clearTimeout(timer);
  }, [gameState.level.map]);

  console.log('GameCanvas rendered');

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="border border-gray-600 bg-gray-900"
        style={{ imageRendering: 'pixelated' }}
        tabIndex={0}
      />
      {/* Enemy Renderer Layer */}
      <EnemyRenderer
        enemies={gameState.enemies}
        player={{
          position: gameState.player.position,
          size: TILE_SIZE
        }}
        tileSize={TILE_SIZE}
        canvasWidth={width}
        canvasHeight={height}
      />
    </div>
  )
}