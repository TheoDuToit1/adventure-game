import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { GameState, LevelConfig, Vector2, EnemyConfig } from '../types/game'
import { AnimatedCharacter } from './components/AnimatedCharacter'
import { MageFireCharacter } from './components/MageFireCharacter'
import { GameHUD } from './components/GameHUD'
import { GameCanvas } from './components/GameCanvas'
import { EnemyAI } from './systems/EnemyAI'
import { EnemyAssetService } from '../services/EnemyAssetService'
import { AttackEffect } from './components/AttackEffect'
import { GameObjects } from './components/GameObjects' // Added import for GameObjects

// Use a direct path to the public assets folder
const DUNGEON_AUDIO_SRC = '/assets/atmosphere-dark-fantasy-dungeon-synthpiano-verse-248215.mp3';

// Track last attack time for each enemy
const enemyLastAttackTimes = new Map<string, number>()

// Gauntlet-style dungeon maps (36x36)
const LEVEL_MAPS = {
  S1: [
    // 36x36 Dungeon: rooms, corridors, doors, keys, spawners, exit
    '####################################',
    '#..K..........#....................#',
    '#..G.........#.....................#',
    '#.............#....................#',
    '#######D######.##########.#########',
    '#.............#...........#.......E#',
    '#.............#...........#........#',
    '#.............#...........#........#',
    '#####.#########.#####D#####.#######',
    '#...#.#.......#.#.....#...#.#.....#',
    '#...#.#..B....#.#.....#...#.#..G..#',
    '#...#.#.......#.#.....#...#.#.....#',
    '#...#.#########.#.....#####.#######',
    '#...#...........#...........#......#',
    '#...#...........#...........#......#',
    '#...#...........#...........#......#',
    '####################################',
    '#.............#....................#',
    '#.............#....................#',
    '#.............#....................#',
    '#######.######.##########.#########',
    '#.....#.......#...........#........#',
    '#.....#.......#...........#........#',
    '#.....#.......#...........#........#',
    '#####.#########.##########.#######',
    '#...#.#.......#.#.....#...#.#.....#',
    '#.K.#.#..G....#.#.....#...#.#..B..#',
    '#...#.#.......#.#.....#...#.#.....#',
    '#...#.#########.#.....#####.#######',
    '#...#...........#...........#......#',
    '#...#...........#...........#......#',
    '#...#...........#...........#......#',
    '####################################',
  ].map(row => row.split('')),
  
  S3: Array(36).fill(0).map((_, i) => {
    // Create full border walls
    if (i === 0 || i === 35) {
      return Array(36).fill('#')
    } else {
      const row = Array(36).fill('.')
      row[0] = '#'
      row[35] = '#'
      
      // Create a maze-like pattern
      if (i % 6 === 3) {
        for (let j = 3; j < 33; j++) {
          if (j % 6 !== 2 && j % 6 !== 3) row[j] = '#'
        }
      }
      
      if (i % 8 === 1) {
        for (let j = 2; j < 34; j += 4) {
          row[j] = '#'
        }
      }
      
      // Add doors
      if (i === 17 || i === 18) {
        row[17] = 'D'
        row[18] = 'D'
      }
      
      return row
    }
  }),
  
  S2: Array(36).fill(0).map((_, i) => {
    // Create full border walls
    if (i === 0 || i === 35) {
      return Array(36).fill('#')
    } else {
      const row = Array(36).fill('.')
      row[0] = '#'
      row[35] = '#'
      
      // Create a symmetrical pattern
      if (i === 8 || i === 27) {
        for (let j = 8; j <= 27; j++) {
          if (j !== 17 && j !== 18) row[j] = '#'
        }
      }
      
      // Create circular chamber
      const centerX = 17.5
      const centerY = 17.5
      const radius = 12
      
      if (i >= 5 && i <= 30) {
        for (let j = 5; j <= 30; j++) {
          const distance = Math.sqrt(Math.pow(j - centerX, 2) + Math.pow(i - centerY, 2))
          if (distance > radius && distance < radius + 1.5) {
            row[j] = '#'
          }
        }
      }
      
      // Add exit
      if (i === 17 || i === 18) {
        row[17] = 'E'
        row[18] = 'E'
      }
      
      return row
    }
  })
}

// Function to generate chest contents - moved outside component
function generateChestContents(): Map<number, 'food' | 'poison' | 'potion'> {
  const contents = new Map<number, 'food' | 'poison' | 'potion'>()
  
  // Assign contents to chests
  for (let i = 0; i < 7; i++) {
    // Gauntlet II style chest contents
    // Base probabilities: 40% food, 30% poison, 30% potion
    // These probabilities would improve with more players in Gauntlet II
    const roll = Math.random()
    if (roll < 0.4) {
      contents.set(i, 'food')
    } else if (roll < 0.7) {
      contents.set(i, 'poison')
    } else {
      contents.set(i, 'potion')
    }
  }
  
  return contents
}

// Update the GameProgress interface to include playerDead
interface GameProgress {
  currentRoom: 'S1' | 'S3' | 'S2'
  kills: number
  chestsOpened: Set<number>
  chestContents: Map<number, 'food' | 'poison' | 'potion'> // Removed 'key' as possible chest content
  potionsCollected: Set<string>
  powerUpActive: boolean
  powerUpEndTime: number | undefined // Allow undefined for powerUpEndTime
  gameWon: boolean
  playerDead: boolean // Added playerDead flag
  score: number
  powerUpType?: 'health_regen' | 'attack_buff' | 'speed_buff'
  keyCount?: number
}

// Utility: Bresenham's line algorithm for line of sight
function hasLineOfSight(from: {x: number, y: number}, to: {x: number, y: number}, map: string[][], tileSize: number) {
  let x0 = Math.floor((from.x + tileSize/2) / tileSize);
  let y0 = Math.floor((from.y + tileSize/2) / tileSize);
  let x1 = Math.floor((to.x + tileSize/2) / tileSize);
  let y1 = Math.floor((to.y + tileSize/2) / tileSize);
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, e2;
  while (true) {
    if (map[y0]?.[x0] === '#') return false;
    if (x0 === x1 && y0 === y1) break;
    e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return true;
}

const POWER_UP_DURATION = 15000; // 15 seconds

// Utility to find all 'K' tiles in the map and return key objects
function findKeysInMap(map: string[][], TILE_SIZE: number) {
  const keys = [];
  let id = 0;
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[y].length; x++) {
      if (map[y][x] === 'K') {
        keys.push({ id: id++, position: { x: x * TILE_SIZE, y: y * TILE_SIZE }, isCollected: false });
      }
    }
  }
  return keys;
}

// Utility to find all 'D' tiles in the map and return door objects
function findDoorsInMap(map: string[][], TILE_SIZE: number) {
  const doors = [];
  let id = 0;
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[y].length; x++) {
      if (map[y][x] === 'D') {
        doors.push({ id: id++, position: { x: x * TILE_SIZE, y: y * TILE_SIZE }, isOpen: false });
      }
    }
  }
  return doors;
}

export const BabylonMode: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>({
    player: {
      position: { x: 64, y: 64 },
      direction: 'south',
      health: 100,
      maxHealth: 100,
      isMoving: false,
      animation: 'idle',
      score: 0,
      hitFlash: undefined
    },
    enemies: [],
    level: {
      map: LEVEL_MAPS.S1
    },
    keys: findKeysInMap(LEVEL_MAPS.S1, 32),
    doors: findDoorsInMap(LEVEL_MAPS.S1, 32)
  });
  const [keyEquipped, setKeyEquipped] = useState(false);

  const [gameProgress, setGameProgress] = useState<GameProgress>({
    currentRoom: 'S1',
    kills: 0,
    chestsOpened: new Set(),
    chestContents: generateChestContents(),
    potionsCollected: new Set<string>(),
    powerUpActive: false,
    powerUpEndTime: undefined,
    gameWon: false,
    playerDead: false,
    score: 0
  })
  
  // Track active attack effects
  const [attackEffects, setAttackEffects] = useState<Array<{id: string, x: number, y: number}>>([])

  // Add state to toggle HUD visibility
  const [showHUD, setShowHUD] = useState(true)

  // Function to ensure chest contents have a key - no longer needed
  // const ensureKeyInChests = useCallback(() => {
  //   // Removed since keys are now on the map
  // }, []);

  // Camera/viewport state
  const [cameraPosition, setCameraPosition] = useState<Vector2>({ x: 0, y: 0 })
  const lastCameraUpdate = useRef<number>(0)
  const pendingCameraUpdate = useRef<Vector2 | null>(null)
  const cameraPositionRef = useRef<Vector2>({ x: 0, y: 0 }) // Reference for use in callbacks

  const TILE_SIZE = 32
  const MOVE_SPEED = 200 // Increased from 120 for faster hero movement
  const CANVAS_WIDTH = 1152  // Increased to accommodate 36 tiles (36 * 32 = 1152)
  const CANVAS_HEIGHT = 1152 // Increased to accommodate 36 tiles (36 * 32 = 1152)
  
  // Viewport dimensions (what's visible on screen)
  const VIEWPORT_WIDTH = 800
  const VIEWPORT_HEIGHT = 600

  // Movement and game loop refs
  const keysPressed = useRef<Set<string>>(new Set())
  const lastUpdateTime = useRef<number>(0)
  const animationFrameRef = useRef<number>()
  const enemySpawnTimer = useRef<number>(0)
  const lastEnemySpawn = useRef<number>(0)
  const enemyAI = useRef<EnemyAI>(EnemyAI.getInstance())
  const enemyAssetService = useRef<EnemyAssetService>(EnemyAssetService.getInstance())

  const lastPlayerAttackTimeRef = useRef(0)

  // Initialize AI system
  useEffect(() => {
    enemyAI.current.setDimensions(TILE_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT)
  }, [])

  // Initialize chests for current room - now returns empty array since we removed chests
  const initializeChests = useCallback((room: 'S1' | 'S3' | 'S2') => {
    // Gauntlet II style chest placement
    const chests = []
    // Place chests at specific positions based on the room
    if (room === 'S1') {
      // Main room chest placements
      chests.push({ id: 0, position: { x: 5 * TILE_SIZE, y: 5 * TILE_SIZE }, isOpen: false })
      chests.push({ id: 1, position: { x: 30 * TILE_SIZE, y: 5 * TILE_SIZE }, isOpen: false })
      chests.push({ id: 2, position: { x: 5 * TILE_SIZE, y: 30 * TILE_SIZE }, isOpen: false })
      chests.push({ id: 3, position: { x: 30 * TILE_SIZE, y: 30 * TILE_SIZE }, isOpen: false })
      chests.push({ id: 4, position: { x: 18 * TILE_SIZE, y: 18 * TILE_SIZE }, isOpen: false })
    } else if (room === 'S3') {
      chests.push({ id: 0, position: { x: 8 * TILE_SIZE, y: 8 * TILE_SIZE }, isOpen: false })
      chests.push({ id: 1, position: { x: 28 * TILE_SIZE, y: 8 * TILE_SIZE }, isOpen: false })
      chests.push({ id: 2, position: { x: 18 * TILE_SIZE, y: 22 * TILE_SIZE }, isOpen: false })
    } else if (room === 'S2') {
      // Final room chest placements - treasure room style with more chests
      for (let i = 0; i < 7; i++) {
        const x = 10 + i * 2
        const y = 15
        chests.push({ id: i, position: { x: x * TILE_SIZE, y: y * TILE_SIZE }, isOpen: false })
      }
    }
    return chests
  }, [TILE_SIZE])

  // Helper: Initialize food platters at Gauntlet-inspired locations
  const initializeFoodPlatters = useCallback((room: 'S1' | 'S3' | 'S2') => {
    // Example: Place food platters in corners and dead ends
    const positions = [
      { x: 2, y: 2 }, { x: 33, y: 2 }, { x: 2, y: 33 }, { x: 33, y: 33 }, // corners
      { x: 18, y: 2 }, { x: 2, y: 18 }, { x: 33, y: 18 }, { x: 18, y: 33 }, // center edges
      { x: 10, y: 10 }, { x: 25, y: 25 }, { x: 10, y: 25 }, { x: 25, y: 10 } // inner map
    ];
    return positions.map((pos, i) => ({
      id: i,
      position: { x: pos.x * TILE_SIZE, y: pos.y * TILE_SIZE },
      isEaten: false
    }));
  }, [TILE_SIZE]);

  // Check if position is walkable
  const isWalkablePosition = useCallback((x: number, y: number): boolean => {
    // Account for the 20% larger hero size
    const playerSize = TILE_SIZE * 1.2;
    
    // Check boundaries with the larger size
    if (x < 0 || y < 0 || x >= CANVAS_WIDTH - playerSize || y >= CANVAS_HEIGHT - playerSize) {
      return false
    }

    // Check all four corners of the player's hitbox
    const checkPoints = [
      { x: x + playerSize * 0.1, y: y + playerSize * 0.1 },             // Top-left
      { x: x + playerSize * 0.9, y: y + playerSize * 0.1 },             // Top-right
      { x: x + playerSize * 0.1, y: y + playerSize * 0.9 },             // Bottom-left
      { x: x + playerSize * 0.9, y: y + playerSize * 0.9 },             // Bottom-right
      { x: x + playerSize * 0.5, y: y + playerSize * 0.5 }              // Center
    ];
    
    // Check if any of the points would collide with a wall or spawner
    for (const point of checkPoints) {
      const tileX = Math.floor(point.x / TILE_SIZE);
      const tileY = Math.floor(point.y / TILE_SIZE);
      const tile = gameState.level.map[tileY] && gameState.level.map[tileY][tileX];
      if (tile === '#' || tile === 'B' || tile === 'G') {
        return false;
      }
    }

    // Block closed doors
    if (gameState.doors) {
      for (const door of gameState.doors) {
        if (!door.isOpen) {
          const doorRect = {
            x: door.position.x,
            y: door.position.y,
            w: TILE_SIZE,
            h: TILE_SIZE
          };
          if (
            x + TILE_SIZE * 0.1 < doorRect.x + doorRect.w &&
            x + TILE_SIZE * 0.9 > doorRect.x &&
            y + TILE_SIZE * 0.1 < doorRect.y + doorRect.h &&
            y + TILE_SIZE * 0.9 > doorRect.y
          ) {
        return false;
          }
        }
      }
    }

    return true
  }, [gameState.level.map, CANVAS_WIDTH, CANVAS_HEIGHT, TILE_SIZE, gameState.doors])

  // Update camera position to follow player with throttling for better performance
  const updateCameraPosition = useCallback((playerX: number, playerY: number) => {
    const now = Date.now()
    const throttleTime = 33 // Limit to ~30fps for camera updates to reduce DOM operations
    
    // Calculate new camera position
    const newCameraX = Math.max(0, Math.min(playerX - VIEWPORT_WIDTH / 2, CANVAS_WIDTH - VIEWPORT_WIDTH))
    const newCameraY = Math.max(0, Math.min(playerY - VIEWPORT_HEIGHT / 2, CANVAS_HEIGHT - VIEWPORT_HEIGHT))
    const newPosition = { x: newCameraX, y: newCameraY }
    
    // Always update the ref for immediate access in other functions
    cameraPositionRef.current = newPosition
    
    // Store pending update
    pendingCameraUpdate.current = newPosition
    
    // If we're within throttle time, don't update the state yet (reduces React renders)
    if (now - lastCameraUpdate.current < throttleTime) {
      return
    }
    
    // Apply the camera update to state (triggers render)
    setCameraPosition(pendingCameraUpdate.current)
    lastCameraUpdate.current = now
    pendingCameraUpdate.current = null
  }, [VIEWPORT_WIDTH, VIEWPORT_HEIGHT, CANVAS_WIDTH, CANVAS_HEIGHT])

  // Helper function to calculate repulsion forces between enemies to avoid clustering
  const calculateRepulsionForce = useCallback((enemy: EnemyConfig, allEnemies: EnemyConfig[], gameState: GameState): {x: number, y: number} => {
    let repulsionX = 0;
    let repulsionY = 0;
    
    // Constants for repulsion behavior
    const repulsionRadius = TILE_SIZE * 1.5; // Increased distance at which repulsion begins
    const maxRepulsionForce = 0.8; // Increased maximum strength of repulsion
    const wallRepulsionDistance = TILE_SIZE * 0.8; // Distance at which walls start repelling
    const wallRepulsionForce = 1.2; // Strong repulsion from walls
    
    // Check against all other enemies
    allEnemies.forEach(otherEnemy => {
      if (otherEnemy.id === enemy.id) return; // Skip self
      
      // Calculate distance and direction to other enemy
      const dx = enemy.position.x - otherEnemy.position.x;
      const dy = enemy.position.y - otherEnemy.position.y;
      const distanceSquared = dx * dx + dy * dy;
      const distance = Math.sqrt(distanceSquared);
      
      // Only apply repulsion within the radius
      if (distance < repulsionRadius) {
        // Calculate repulsion force (stronger when closer)
        const repulsionStrength = maxRepulsionForce * (1 - distance / repulsionRadius);
        
        // Normalize direction vector
        if (distance > 0) {
          const dirX = dx / distance;
          const dirY = dy / distance;
          
          // Add to total repulsion force
          repulsionX += dirX * repulsionStrength;
          repulsionY += dirY * repulsionStrength;
        } else {
          // If exactly on top (very unlikely), repel in random direction
          const randomAngle = Math.random() * Math.PI * 2;
          repulsionX += Math.cos(randomAngle) * maxRepulsionForce;
          repulsionY += Math.sin(randomAngle) * maxRepulsionForce;
        }
      }
    });
    
    // Check for nearby walls and generate repulsion from them
    const checkWallRepulsion = (posX: number, posY: number) => {
      const tileX = Math.floor(posX / TILE_SIZE);
      const tileY = Math.floor(posY / TILE_SIZE);
      
      // Check surrounding 8 tiles for walls
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue; // Skip self tile
          
          const checkTileX = tileX + dx;
          const checkTileY = tileY + dy;
          
          // Skip if outside map boundaries
          if (checkTileX < 0 || checkTileX >= gameState.level.map[0].length || 
              checkTileY < 0 || checkTileY >= gameState.level.map.length) {
            continue;
          }
          
          const tileType = gameState.level.map[checkTileY][checkTileX];
          
          // If it's a wall or spawner, add repulsion
          if (tileType === '#' || tileType === 'B' || tileType === 'G') {
            // Calculate center of the wall tile
            const wallCenterX = (checkTileX + 0.5) * TILE_SIZE;
            const wallCenterY = (checkTileY + 0.5) * TILE_SIZE;
            
            // Calculate distance and direction from wall
            const wallDx = enemy.position.x - wallCenterX;
            const wallDy = enemy.position.y - wallCenterY;
            const wallDistanceSquared = wallDx * wallDx + wallDy * wallDy;
            const wallDistance = Math.sqrt(wallDistanceSquared);
            
            // Only apply repulsion if close enough
            if (wallDistance < wallRepulsionDistance) {
              // Calculate repulsion strength (stronger when closer)
              const wallRepulsionStrength = wallRepulsionForce * (1 - wallDistance / wallRepulsionDistance);
              
              // Normalize direction vector
              if (wallDistance > 0) {
                const dirX = wallDx / wallDistance;
                const dirY = wallDy / wallDistance;
                
                // Add to total repulsion force
                repulsionX += dirX * wallRepulsionStrength;
                repulsionY += dirY * wallRepulsionStrength;
              }
            }
          }
        }
      }
    };
    
    // Check for wall repulsion from the enemy's current position
    checkWallRepulsion(enemy.position.x, enemy.position.y);
    
    return { x: repulsionX, y: repulsionY };
  }, [TILE_SIZE]);
  
  // Helper function to check if a position would cause enemy overlaps
  const wouldCauseCollision = useCallback((position: {x: number, y: number}, enemyId: string, allEnemies: EnemyConfig[], minDistance: number): boolean => {
    return allEnemies.some(otherEnemy => {
      if (otherEnemy.id === enemyId) return false; // Skip self
      
      const dx = position.x - otherEnemy.position.x;
      const dy = position.y - otherEnemy.position.y;
      const distanceSquared = dx * dx + dy * dy;
      
      return distanceSquared < minDistance * minDistance;
    });
  }, []);

  // Track last spawn times for each spawner to prevent multiple simultaneous spawns
  const lastGhostSpawnTimes = useRef<{[key: string]: number}>({});
  const lastGruntSpawnTimes = useRef<{[key: string]: number}>({});
  
  // Create a centralized spawner state tracker
  const spawnerState = useRef<{
    active: {[key: string]: boolean}, // Tracks if a spawner is still active
    lastUpdated: {[key: string]: number}, // Tracks when the spawner state was last updated
  }>({
    active: {},
    lastUpdated: {},
  });
  
  // Helper function to check if a spawner is active
  const isSpawnerActive = useCallback((x: number, y: number, type: 'B' | 'G'): boolean => {
    const key = getSpawnerKey(x, y);
    
    // If we don't have a record for this spawner yet, check the map
    if (spawnerState.current.active[key] === undefined) {
      const isActive = gameState.level.map[y]?.[x] === type;
      spawnerState.current.active[key] = isActive;
      spawnerState.current.lastUpdated[key] = Date.now();
      return isActive;
    }
    
    return spawnerState.current.active[key];
  }, [gameState.level.map]);
  
  // Helper function to mark a spawner as destroyed
  const markSpawnerDestroyed = useCallback((x: number, y: number) => {
    const key = getSpawnerKey(x, y);
    spawnerState.current.active[key] = false;
    spawnerState.current.lastUpdated[key] = Date.now();
    
    // Also clean up the spawn times
    delete lastGhostSpawnTimes.current[key];
    delete lastGruntSpawnTimes.current[key];
    
    console.log(`🚫 Spawner at ${x},${y} marked as destroyed in centralized tracker`);
  }, []);
  
  // Track enemy positions to detect when they're stuck
  const lastEnemyPositions = useRef<{[key: string]: {position: Vector2, timeStuck: number, randomDirection?: {x: number, y: number}}}>({});
  
  // Helper function to check if an enemy is stuck
  const checkAndHandleStuckEnemy = useCallback((enemy: EnemyConfig): {isStuck: boolean, escapeVector?: {x: number, y: number}} => {
    const lastPosition = lastEnemyPositions.current[enemy.id];
    const currentPosition = enemy.position;
    const now = Date.now();
    
    // If we don't have a previous position record, initialize it
    if (!lastPosition) {
      lastEnemyPositions.current[enemy.id] = {
        position: { ...currentPosition },
        timeStuck: now
      };
      return { isStuck: false };
    }
    
    // Check if position has changed significantly
    const dx = currentPosition.x - lastPosition.position.x;
    const dy = currentPosition.y - lastPosition.position.y;
    const distanceMoved = Math.sqrt(dx * dx + dy * dy);
    
    // If moved enough, reset stuck counter
    if (distanceMoved > TILE_SIZE * 0.1) {
      lastEnemyPositions.current[enemy.id] = {
        position: { ...currentPosition },
        timeStuck: now
      };
      return { isStuck: false };
    }
    
    // Calculate how long the enemy has been stuck
    const stuckDuration = now - lastPosition.timeStuck;
    
    // If stuck for more than 1 second, apply escape behavior
    if (stuckDuration > 1000) {
      // If we already have a random direction, use it
      if (lastPosition.randomDirection) {
        return { 
          isStuck: true, 
          escapeVector: { ...lastPosition.randomDirection } 
        };
      }
      
      // Generate a random escape direction
      const randomAngle = Math.random() * Math.PI * 2;
      const escapeVector = {
        x: Math.cos(randomAngle) * 1.5, // Stronger escape force
        y: Math.sin(randomAngle) * 1.5
      };
      
      // Update the record with the random direction
      lastEnemyPositions.current[enemy.id] = {
        position: { ...currentPosition },
        timeStuck: now - 800, // Keep some of the stuck time so it doesn't immediately reset
        randomDirection: escapeVector
      };
      
      // After 1.5 seconds, clear the random direction to allow normal behavior
      setTimeout(() => {
        if (lastEnemyPositions.current[enemy.id]) {
          lastEnemyPositions.current[enemy.id].randomDirection = undefined;
        }
      }, 1500);
      
      return { isStuck: true, escapeVector };
    }
    
    // Update the position record but keep the stuck time
    lastEnemyPositions.current[enemy.id] = {
      position: { ...currentPosition },
      timeStuck: lastPosition.timeStuck,
      randomDirection: lastPosition.randomDirection
    };
    
    return { isStuck: false };
  }, [TILE_SIZE]);
  
  // Clean up enemy positions when they're removed
  const cleanupEnemyData = useCallback((enemyId: string) => {
    delete lastEnemyPositions.current[enemyId];
  }, []);
  
  // Helper function to find a valid spawn position around a spawner
  const findValidSpawnPosition = useCallback((spawnerX: number, spawnerY: number, isGhost: boolean) => {
    // Define possible spawn directions around the spawner
    const spawnDirections = [
      { dx: 0, dy: -1 }, // North
      { dx: 1, dy: -1 }, // Northeast
      { dx: 1, dy: 0 },  // East
      { dx: 1, dy: 1 },  // Southeast
      { dx: 0, dy: 1 },  // South
      { dx: -1, dy: 1 }, // Southwest
      { dx: -1, dy: 0 }, // West
      { dx: -1, dy: -1 } // Northwest
    ];
    
    // Add additional directions for more options (further out)
    const extendedDirections = [
      ...spawnDirections,
      { dx: 0, dy: -2 }, // North x2
      { dx: 2, dy: 0 },  // East x2
      { dx: 0, dy: 2 },  // South x2
      { dx: -2, dy: 0 }, // West x2
      { dx: 1, dy: -2 }, // North-East extended
      { dx: 2, dy: -1 }, // East-North extended
      { dx: 2, dy: 1 },  // East-South extended
      { dx: 1, dy: 2 },  // South-East extended
      { dx: -1, dy: 2 }, // South-West extended
      { dx: -2, dy: 1 }, // West-South extended
      { dx: -2, dy: -1 },// West-North extended
      { dx: -1, dy: -2 } // North-West extended
    ];
    
    // Shuffle the directions array to try them in random order
    const shuffledDirections = [...extendedDirections].sort(() => Math.random() - 0.5);
    
    // Try to find a valid spawn position that's walkable
    let spawnX = 0, spawnY = 0;
    let validPositionFound = false;
    
    for (const direction of shuffledDirections) {
      // Calculate tile position
      const tileX = spawnerX + direction.dx;
      const tileY = spawnerY + direction.dy;
      
      // Skip if outside map boundaries
      if (tileX < 0 || tileX >= gameState.level.map[0].length || 
          tileY < 0 || tileY >= gameState.level.map.length) {
        continue;
      }
      
      const tileType = gameState.level.map[tileY][tileX];
      const pixelX = tileX * TILE_SIZE + (Math.random() * 0.4 + 0.3) * TILE_SIZE;
      const pixelY = tileY * TILE_SIZE + (Math.random() * 0.4 + 0.3) * TILE_SIZE;
      
      // For ghosts
      if (isGhost) {
        // Ghosts can be on any non-wall tile
        if (tileType !== '#') {
          spawnX = pixelX;
          spawnY = pixelY;
          validPositionFound = true;
          break;
        }
      } 
      // For grunts - use isWalkablePosition to ensure they can actually walk there
      else {
        if ((tileType === '.' || tileType === ' ') && isWalkablePosition(pixelX, pixelY)) {
          spawnX = pixelX;
          spawnY = pixelY;
          validPositionFound = true;
          break;
        }
      }
    }
    
    // If no valid position found, try a safe fallback
    if (!validPositionFound) {
      console.log(`⚠️ No valid spawn position found around spawner at ${spawnerX},${spawnerY}, searching for safe fallback`);
      
      // Find any walkable position within a larger search radius
      const safeRadius = 4;
      for (let dx = -safeRadius; dx <= safeRadius && !validPositionFound; dx++) {
        for (let dy = -safeRadius; dy <= safeRadius && !validPositionFound; dy++) {
          if (dx === 0 && dy === 0) continue; // Skip the spawner itself
          
          const tileX = spawnerX + dx;
          const tileY = spawnerY + dy;
          
          // Skip if outside map boundaries
          if (tileX < 0 || tileX >= gameState.level.map[0].length || 
              tileY < 0 || tileY >= gameState.level.map.length) {
            continue;
          }
          
          const tileType = gameState.level.map[tileY][tileX];
          const pixelX = tileX * TILE_SIZE + TILE_SIZE/2;
          const pixelY = tileY * TILE_SIZE + TILE_SIZE/2;
          
          if (isGhost) {
            if (tileType !== '#') {
              spawnX = pixelX;
              spawnY = pixelY;
              validPositionFound = true;
              break;
            }
          } else {
            if ((tileType === '.' || tileType === ' ') && isWalkablePosition(pixelX, pixelY)) {
              spawnX = pixelX;
              spawnY = pixelY;
              validPositionFound = true;
              break;
            }
          }
        }
      }
    }
    
    // Final fallback if absolutely nothing else works
    if (!validPositionFound) {
      console.log(`🚨 Critical failure finding spawn position for ${isGhost ? 'ghost' : 'grunt'} at ${spawnerX},${spawnerY}`);
      // Place in center of the spawner as last resort
      spawnX = spawnerX * TILE_SIZE + TILE_SIZE/2;
      spawnY = spawnerY * TILE_SIZE + TILE_SIZE/2;
    }
    
    return { x: spawnX, y: spawnY };
  }, [TILE_SIZE, gameState.level.map, isWalkablePosition]);

  // Spawn ghost from generator (bone pile)
  const spawnGhostFromGenerator = useCallback((generatorX: number, generatorY: number) => {
    const spawnerKey = `${generatorX},${generatorY}`;
    const now = Date.now();
    
    // Check if the spawner is still active using our centralized state
    if (!isSpawnerActive(generatorX, generatorY, 'B')) {
      console.log(`🚫 Ghost spawner at ${generatorX},${generatorY} is not active - cancelling spawn`);
      // Make sure it's properly cleaned up
      markSpawnerDestroyed(generatorX, generatorY);
      return;
    }
    
    // Double-check map state to ensure our tracker is in sync
    if (gameState.level.map[generatorY]?.[generatorX] !== 'B') {
      console.log(`🔄 Sync: Ghost spawner at ${generatorX},${generatorY} exists in our state but not in map - fixing and cancelling spawn`);
      markSpawnerDestroyed(generatorX, generatorY);
      return;
    }
    
    // Only spawn if enough time has passed since the last spawn from this spawner
    if (now - (lastGhostSpawnTimes.current[spawnerKey] || 0) < 2500) {
      console.log(`⏱️ Skipping ghost spawn at ${generatorX},${generatorY} - too soon`);
      
      // Schedule the next spawn attempt
      setTimeout(() => {
        // Check if the spawner is still active before calling the spawn function again
        if (isSpawnerActive(generatorX, generatorY, 'B')) {
          spawnGhostFromGenerator(generatorX, generatorY);
        } else {
          console.log(`🚫 Ghost spawner at ${generatorX},${generatorY} was destroyed during wait - cancelling spawn`);
        }
      }, 2500);
      
      return;
    }
    
    // Update last spawn time
    lastGhostSpawnTimes.current[spawnerKey] = now;
    
    // Find a valid spawn position near the spawner
    const spawnPosition = findValidSpawnPosition(generatorX, generatorY, true); // true for ghost
    
    // Re-enabled enemy spawning
    const newEnemy: EnemyConfig = {
      id: `ghost_${Date.now()}_${Math.random()}`,
      type: 'ghost',
      position: spawnPosition,
      health: 2,
      maxHealth: 2,
      speed: 1.5,
      damage: 1,
      size: TILE_SIZE,
      rotation: Math.random() * Math.PI * 2,
      direction: { x: 0, y: 0 },
      aiType: 'aggressive',
      aiState: 'chase',
      sightRange: 350,
      attackRange: 3, // Reduced from 50 to 3 pixels
      color: '#AAAAFF' // Light blue color for ghost
    }
        
    setGameState(prev => ({
      ...prev,
      enemies: [...prev.enemies, newEnemy]
    }))
    console.log(`👻 Spawned ghost at ${generatorX},${generatorY}`)
    
    // Set spawn delay to 2.5 seconds
    setTimeout(() => {
      // Check if the spawner is still active before calling the spawn function again
      if (isSpawnerActive(generatorX, generatorY, 'B')) {
        spawnGhostFromGenerator(generatorX, generatorY);
      } else {
        console.log(`🚫 Ghost spawner at ${generatorX},${generatorY} was destroyed after spawn - no more spawning`);
      }
    }, 2500); // 2.5 seconds spawn delay
  }, [TILE_SIZE, gameState.level.map, findValidSpawnPosition, isSpawnerActive, markSpawnerDestroyed])

  // Spawn grunt from generator (grunt spawner)
  const spawnGruntFromGenerator = useCallback((generatorX: number, generatorY: number) => {
    const spawnerKey = `${generatorX},${generatorY}`;
    const now = Date.now();
    
    // Check if the spawner is still active using our centralized state
    if (!isSpawnerActive(generatorX, generatorY, 'G')) {
      console.log(`🚫 Grunt spawner at ${generatorX},${generatorY} is not active - cancelling spawn`);
      // Make sure it's properly cleaned up
      markSpawnerDestroyed(generatorX, generatorY);
      return;
    }
    
    // Double-check map state to ensure our tracker is in sync
    if (gameState.level.map[generatorY]?.[generatorX] !== 'G') {
      console.log(`🔄 Sync: Grunt spawner at ${generatorX},${generatorY} exists in our state but not in map - fixing and cancelling spawn`);
      markSpawnerDestroyed(generatorX, generatorY);
      return;
    }
    
    // Only spawn if enough time has passed since the last spawn from this spawner
    if (now - (lastGruntSpawnTimes.current[spawnerKey] || 0) < 4000) {
      console.log(`⏱️ Skipping grunt spawn at ${generatorX},${generatorY} - too soon`);
      
      // Schedule the next spawn attempt
      setTimeout(() => {
        // Check if the spawner is still active before calling the spawn function again
        if (isSpawnerActive(generatorX, generatorY, 'G')) {
          spawnGruntFromGenerator(generatorX, generatorY);
        } else {
          console.log(`🚫 Grunt spawner at ${generatorX},${generatorY} was destroyed during wait - cancelling spawn`);
        }
      }, 4000);
      
      return;
    }
    
    // Update last spawn time
    lastGruntSpawnTimes.current[spawnerKey] = now;
    
    // Find a valid spawn position near the spawner
    const spawnPosition = findValidSpawnPosition(generatorX, generatorY, false); // false for grunt
    
    // Re-enabled enemy spawning
    const newEnemy: EnemyConfig = {
      id: `grunt_${Date.now()}_${Math.random()}`,
      type: 'grunt',
      position: spawnPosition,
      health: 3,
      maxHealth: 3,
      speed: 1.2,
      damage: 2,
      size: TILE_SIZE,
      rotation: Math.random() * Math.PI * 2,
      direction: { x: 0, y: 0 },
      aiType: 'aggressive',
      aiState: 'chase',
      sightRange: 350,
      attackRange: 3, // Reduced from 50 to 3 pixels
      color: '#8B4513' // Brown color for grunt
    }
    setGameState(prev => ({
      ...prev,
      enemies: [...prev.enemies, newEnemy]
    }))
    console.log(`🧌 Spawned grunt at ${generatorX},${generatorY}`)
    
    // Set spawn delay to 4 seconds
    setTimeout(() => {
      // Check if the spawner is still active before calling the spawn function again
      if (isSpawnerActive(generatorX, generatorY, 'G')) {
        spawnGruntFromGenerator(generatorX, generatorY);
      } else {
        console.log(`🚫 Grunt spawner at ${generatorX},${generatorY} was destroyed after spawn - no more spawning`);
      }
    }, 4000); // 4 seconds spawn delay
  }, [TILE_SIZE, gameState.level.map, findValidSpawnPosition, isSpawnerActive, markSpawnerDestroyed])

  // Handle chest opening
  const handleChestOpen = useCallback((chestIndex: number) => {
    if (gameProgress.chestsOpened.has(chestIndex)) return
    
    console.log(`📦 Opening chest ${chestIndex}`)
    
    // Add to opened chests
    setGameProgress(prev => {
      const newChestsOpened = new Set(prev.chestsOpened)
      newChestsOpened.add(chestIndex)
      
      return { ...prev, chestsOpened: newChestsOpened }
    })
    
    // Mark chest as opened in game state and apply effects based on Gauntlet II chest mechanics
    setGameState(prev => {
      let newHealth = prev.player.health
      const chestContent = gameProgress.chestContents.get(chestIndex)
      let newScore = prev.player.score + 100; // Base score for opening a chest
      let animation = prev.player.animation;
      
      // Play sound effect for chest opening
      const chestSound = new Audio();
      
      if (chestContent === 'food') {
        // Increase health for food (Gauntlet II gave significant health for food)
        const healthBoost = 25; // Gauntlet II food value
        newHealth = Math.min(prev.player.maxHealth, prev.player.health + healthBoost)
        newScore += 50; // Additional score for finding food
        console.log(`🍗 Found food! +${healthBoost} health`)
        // Food sound would play here
      } else if (chestContent === 'poison') {
        // Decrease health for poison (Gauntlet II poison damage)
        const poisonDamage = 10;
        newHealth = Math.max(0, prev.player.health - poisonDamage)
        animation = 'hurt';
        console.log(`☠️ Found poison! -${poisonDamage} health`)
        // Poison sound would play here
      } else if (chestContent === 'potion') {
        // Add potion to inventory (in Gauntlet II, potions were powerful items)
        setGameProgress(prev => {
          const newPotions = new Set(prev.potionsCollected)
          const potionId = `potion_${Date.now()}`
          newPotions.add(potionId)
          console.log('🧪 Found a potion!')
          return { ...prev, potionsCollected: newPotions }
        })
        newScore += 100; // Additional score for finding a potion
        // Potion sound would play here
      }
      
      // Update player state with new health, score, and animation
      return {
        ...prev,
        player: {
          ...prev.player,
          health: newHealth,
          score: newScore,
          animation: animation
        },
        // Update the chest in the game state to show it as opened
        chests: prev.chests?.map(chest => 
          chest.id === chestIndex ? { ...chest, isOpen: true } : chest
        ) || []
      }
    })
  }, [gameProgress.chestsOpened, gameProgress.chestContents])

  // Handle enemy death
  const handleEnemyKilled = useCallback((enemyId: string) => {
    // Find the enemy position before removing it from state
    const killedEnemy = gameState.enemies.find(e => e.id === enemyId)
    
    // Clean up enemy position tracking data
    cleanupEnemyData(enemyId);
    
    setGameState(prev => ({
      ...prev,
      enemies: prev.enemies.filter(enemy => enemy.id !== enemyId)
    }))

    setGameProgress(prev => {
      const newKills = prev.kills + 1
      // Find the killed enemy to determine score
      const killedEnemy = gameState.enemies.find(e => e.id === enemyId)
      let scoreAdd = 100
      if (killedEnemy && killedEnemy.type === 'big_monster') scoreAdd = 500
      const newScore = (prev.score || 0) + scoreAdd
      return { ...prev, kills: newKills, score: newScore }
    })
  }, [gameState.enemies, cleanupEnemyData])
  
  // Remove completed attack effect
  const handleEffectComplete = useCallback((effectId: string) => {
    setAttackEffects(prev => prev.filter(effect => effect.id !== effectId))
  }, [])

  // Handle room transitions
  const handleRoomTransition = useCallback((newRoom: 'S1' | 'S3' | 'S2') => {
    console.log(`🚪 Moving to room ${newRoom}`)
    
    setGameProgress(prev => {
      return { 
        ...prev, 
        currentRoom: newRoom,
        chestsOpened: new Set(), // Reset opened chests for the new room
        chestContents: generateChestContents()
      }
    })
    
    const newPlayerPosition = { x: 576, y: 1022 } // Start at bottom center of new room, moved 2 pixels up from y: 1024
    
    setGameState(prev => ({
      ...prev,
      player: {
        ...prev.player,
        position: newPlayerPosition
      },
      enemies: [],
      chests: initializeChests(newRoom),
      level: {
        ...prev.level,
        map: LEVEL_MAPS[newRoom]
      }
    }))
    
    // Update camera position for new room
    updateCameraPosition(newPlayerPosition.x, newPlayerPosition.y)
  }, [initializeChests, updateCameraPosition])

  // Handle game win
  const handleGameWin = useCallback(() => {
    setGameProgress(prev => ({ ...prev, gameWon: true }))
    console.log('🎉 YOU ESCAPED! GAME WON!')
  }, [])

  // Movement system
  const updateMovement = useCallback((deltaTime: number) => {
    if (keysPressed.current.size === 0) {
      setGameState(prev => ({
        ...prev,
        player: {
          ...prev.player,
          isMoving: false,
          animation: 'idle'
        }
      }))
      return
    }

    // Apply speed buff if active
    const speedMultiplier = gameProgress.powerUpActive && gameProgress.powerUpType === 'speed_buff' ? 1.5 : 1.0
    const moveDistance = MOVE_SPEED * deltaTime * speedMultiplier
    
    let newDirection: 'north' | 'south' | 'east' | 'west' = gameState.player.direction
    let deltaX = 0
    let deltaY = 0

    if (keysPressed.current.has('arrowup')) {
      deltaY = -moveDistance
      newDirection = 'north'
    }
    if (keysPressed.current.has('arrowdown')) {
      deltaY = moveDistance
      newDirection = 'south'
    }
    if (keysPressed.current.has('arrowleft')) {
      deltaX = -moveDistance
      newDirection = 'west'
    }
    if (keysPressed.current.has('arrowright')) {
      deltaX = moveDistance
      newDirection = 'east'
    }

    // Normalize diagonal movement
    if (deltaX !== 0 && deltaY !== 0) {
      const length = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
      deltaX = (deltaX / length) * moveDistance
      deltaY = (deltaY / length) * moveDistance
    }

    if (deltaX === 0 && deltaY === 0) return

    setGameState(prev => {
      const newPosition = {
        x: prev.player.position.x + deltaX,
        y: prev.player.position.y + deltaY
      }

      // Check if new position is walkable
      if (isWalkablePosition(newPosition.x, newPosition.y)) {
        // Update camera to follow player
        updateCameraPosition(newPosition.x, newPosition.y)
        
          return {
            ...prev,
            player: {
              ...prev.player,
            position: newPosition,
            direction: newDirection,
              isMoving: true,
              animation: 'walk'
            }
          }
        }

      // Try moving only horizontally if diagonal movement failed
      if (deltaX !== 0 && deltaY !== 0) {
        const newPositionX = {
          x: prev.player.position.x + deltaX,
          y: prev.player.position.y
        }

        if (isWalkablePosition(newPositionX.x, newPositionX.y)) {
          // Update camera to follow player
          updateCameraPosition(newPositionX.x, newPositionX.y)
          
          return {
            ...prev,
            player: {
              ...prev.player,
              position: newPositionX,
              direction: deltaX > 0 ? 'east' : 'west',
              isMoving: true,
              animation: 'walk'
            }
          }
        }

        const newPositionY = {
          x: prev.player.position.x,
          y: prev.player.position.y + deltaY
        }

        if (isWalkablePosition(newPositionY.x, newPositionY.y)) {
          // Update camera to follow player
          updateCameraPosition(newPositionY.x, newPositionY.y)

        return {
          ...prev,
          player: {
            ...prev.player,
              position: newPositionY,
              direction: deltaY > 0 ? 'south' : 'north',
              isMoving: true,
              animation: 'walk'
            }
          }
        }
      }

      return {
        ...prev,
        player: {
          ...prev.player,
          direction: newDirection,
          isMoving: false
        }
      }
    })
  }, [isWalkablePosition])
  
  // Filter enemies to only those visible in the viewport (with some margin)
  const visibleEnemies = useMemo(() => {
    // Use the most up-to-date camera position from the ref
    const camPos = cameraPositionRef.current
    
    // Add a larger margin to reduce pop-in during fast movement
    const margin = TILE_SIZE * 5
    
    return gameState.enemies.filter(enemy => {
      return (
        enemy.position.x >= camPos.x - margin &&
        enemy.position.x <= camPos.x + VIEWPORT_WIDTH + margin &&
        enemy.position.y >= camPos.y - margin &&
        enemy.position.y <= camPos.y + VIEWPORT_HEIGHT + margin
      )
    })
  }, [gameState.enemies, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, TILE_SIZE])

  // Helper: Check if player is colliding with a chest
  const checkChestCollision = useCallback(() => {
    if (!gameState.chests) return;
    const player = gameState.player;
    const playerSize = TILE_SIZE * 1.2;
    const playerCenter = {
      x: player.position.x + playerSize / 2,
      y: player.position.y + playerSize / 2
    };
    for (const chest of gameState.chests) {
      if (gameProgress.chestsOpened.has(chest.id)) continue;
      const chestCenter = {
        x: chest.position.x + TILE_SIZE / 2,
        y: chest.position.y + TILE_SIZE / 2
      };
      const dist = Math.hypot(playerCenter.x - chestCenter.x, playerCenter.y - chestCenter.y);
      if (dist < TILE_SIZE * 0.8) { // Allow some overlap for collection
        handleChestOpen(chest.id);
        break;
      }
    }
  }, [gameState.chests, gameState.player, gameProgress.chestsOpened, handleChestOpen, TILE_SIZE]);

  // Game loop with more frequent enemy spawning
  const gameLoop = useCallback((timestamp: number) => {
    if (lastUpdateTime.current === 0) {
      lastUpdateTime.current = timestamp
    }

    const deltaTime = (timestamp - lastUpdateTime.current) / 1000
    lastUpdateTime.current = timestamp

    updateMovement(deltaTime)
    checkChestCollision();
    
    // Only update enemies that are near the viewport
    const visibleEnemiesOnly = true // Set to false to update all enemies regardless of visibility
    if (visibleEnemiesOnly) {
      // Only process AI for enemies near the viewport
      const margin = TILE_SIZE * 10 // Larger margin for AI processing
      const camPos = cameraPositionRef.current
      
      setGameState(prev => {
        const playerPos = prev.player.position
        
        // First, update only visible enemies
        const updatedEnemies = prev.enemies.map(enemy => {
          // Check if enemy is near viewport
          const isNearViewport = (
            enemy.position.x >= camPos.x - margin &&
            enemy.position.x <= camPos.x + VIEWPORT_WIDTH + margin &&
            enemy.position.y >= camPos.y - margin &&
            enemy.position.y <= camPos.y + VIEWPORT_HEIGHT + margin
          )
          
          // Only update AI for visible enemies
          if (isNearViewport) {
            return updateSingleEnemy(enemy, playerPos, prev, deltaTime)
          }
          
          // Return unchanged for off-screen enemies
          return enemy
        })
        
        // Check if player is dead
        if (prev.player.health <= 0 && !gameProgress.playerDead) {
          // We'll handle this outside the state update to avoid the error
          setTimeout(() => {
            setGameProgress(prevProgress => ({
              ...prevProgress,
              playerDead: true
            }));
            console.log('💀 YOU DIED!');
          }, 0);
        }
        
        return {
          ...prev,
          enemies: updatedEnemies
        }
      })
    } else {
      // Original method - update all enemies
    updateEnemies(deltaTime)

      // Check player health here too for the non-visible enemies case
      if (gameState.player.health <= 0 && !gameProgress.playerDead) {
        setTimeout(() => {
          setGameProgress(prevProgress => ({
            ...prevProgress,
            playerDead: true
          }));
          console.log('💀 YOU DIED!');
        }, 0);
      }
    }
    
    // Apply any pending camera updates
    if (pendingCameraUpdate.current && Date.now() - lastCameraUpdate.current >= 33) {
      setCameraPosition(pendingCameraUpdate.current)
      lastCameraUpdate.current = Date.now()
      pendingCameraUpdate.current = null
    }
    
    // Check if power-up has expired
    if (gameProgress.powerUpActive && gameProgress.powerUpEndTime && Date.now() > gameProgress.powerUpEndTime) {
      setGameProgress(prev => ({
        ...prev,
        powerUpActive: false
      }))
      console.log('🧪 Power-up effect has worn off!')
    }

    // Spawning is now handled by individual spawner timeouts rather than in the game loop
    // This is more efficient and allows for better control of spawn rates

    // Check for enemy attacks on player - more efficient collision detection
    // Only check enemies that are close to the player
    const playerPos = gameState.player.position
    const attackCheckRadius = TILE_SIZE * 2 // Only check enemies within this radius
    
    gameState.enemies.forEach(enemy => {
      const playerSize = TILE_SIZE * 1.2; // 20% larger hero size
      
      // Adjust player position to center of the larger character
      const adjustedPlayerPos = {
        x: playerPos.x + playerSize * 0.1,
        y: playerPos.y + playerSize * 0.1
      };
      
      const dx = enemy.position.x - adjustedPlayerPos.x
      const dy = enemy.position.y - adjustedPlayerPos.y
      const distanceToPlayer = Math.sqrt(dx * dx + dy * dy)
      
      // Only process nearby enemies - increased attack check radius for larger player
      if (distanceToPlayer <= attackCheckRadius) {
        const currentTime = timestamp
        const lastAttackTime = enemyLastAttackTimes.get(enemy.id) || 0
        const attackCooldown = 1100 // 1.1 seconds in milliseconds
        const canAttack = currentTime - lastAttackTime >= attackCooldown
        // Only attack if line of sight - adjusted for larger player
        if (distanceToPlayer <= TILE_SIZE * 1.0) {
          if (enemy.type === 'grunt') {
            // Grunts deal 1 HP, then are destroyed
            // Clean up enemy data
            cleanupEnemyData(enemy.id);
            
            setGameState(prev => ({
              ...prev,
              player: {
                ...prev.player,
                health: Math.max(0, prev.player.health - 1),
                animation: 'hurt',
                hitFlash: Date.now()
              },
              enemies: prev.enemies.filter(e => e.id !== enemy.id) // Remove grunt
            }))
            
            // Play grunt attack sound effect
            const gruntSound = new Audio('/assets/01._damage_grunt_male.wav');
            gruntSound.volume = 0.4;
            gruntSound.play().catch(err => console.error("Error playing grunt sound:", err));
            
            setTimeout(() => {
              setGameState(prev => ({
                ...prev,
                player: {
                  ...prev.player,
                  hitFlash: undefined,
                  animation: prev.player.isMoving ? 'walk' : 'idle'
                }
              }))
            }, 500)
          } else if (canAttack && hasLineOfSight(enemy.position, adjustedPlayerPos, gameState.level.map, TILE_SIZE)) {
            enemyLastAttackTimes.set(enemy.id, currentTime)
            setGameState(prev => ({
              ...prev,
              player: {
                ...prev.player,
                health: Math.max(0, prev.player.health - 0.25),
                animation: 'hurt',
                hitFlash: Date.now() // Set hitFlash timestamp for player
              }
            }))
            // Clear hitFlash and reset animation after 500ms
            setTimeout(() => {
              setGameState(prev => ({
                ...prev,
                player: {
                  ...prev.player,
                  hitFlash: undefined,
                  animation: prev.player.isMoving ? 'walk' : 'idle'
                }
              }))
            }, 500)
          }
        }
        else if (distanceToPlayer <= enemy.attackRange && canAttack && hasLineOfSight(enemy.position, adjustedPlayerPos, gameState.level.map, TILE_SIZE)) {
          if (Math.random() < 0.1) {
            enemyLastAttackTimes.set(enemy.id, currentTime)
          setGameState(prev => ({
            ...prev,
            player: {
              ...prev.player,
                health: Math.max(0, prev.player.health - enemy.damage),
                animation: 'hurt',
                hitFlash: Date.now() // Set hitFlash timestamp for player
              }
            }))
            
            // Clear hitFlash and reset animation after 500ms
            setTimeout(() => {
              setGameState(prev => ({
                ...prev,
                player: {
                  ...prev.player,
                  hitFlash: undefined,
                  animation: prev.player.isMoving ? 'walk' : 'idle'
            }
          }))
            }, 500)
          }
        }
      }
    })

    animationFrameRef.current = requestAnimationFrame(gameLoop)
  }, [updateMovement, checkChestCollision, spawnGruntFromGenerator, gameState.level.map, gameState.enemies.length, gameState.player.position, TILE_SIZE, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, gameProgress.playerDead, gameProgress.powerUpActive, gameProgress.powerUpEndTime]);

  // Helper function to update a single enemy
  const updateSingleEnemy = useCallback((enemy: EnemyConfig, playerPos: Vector2, gameState: GameState, deltaTime: number): EnemyConfig => {
    // Calculate direction to player
    const dx = playerPos.x - enemy.position.x
    const dy = playerPos.y - enemy.position.y
    const distanceToPlayer = Math.sqrt(dx * dx + dy * dy)
    
    // Always chase player if within sight range
    if (distanceToPlayer <= enemy.sightRange) {
      // Normalize direction vector
      const length = Math.max(0.1, Math.sqrt(dx * dx + dy * dy))
      const dirX = dx / length
      const dirY = dy / length
      
      // Check if the enemy is stuck
      const stuckStatus = checkAndHandleStuckEnemy(enemy);
      
      // Get repulsion forces from other enemies to avoid clustering
      const repulsion = calculateRepulsionForce(enemy, gameState.enemies, gameState);
      
      let combinedDirX = dirX + repulsion.x;
      let combinedDirY = dirY + repulsion.y;
      
      // If the enemy is stuck, apply the escape vector with high priority
      if (stuckStatus.isStuck && stuckStatus.escapeVector) {
        // Apply escape vector with high weight compared to normal movement
        combinedDirX = stuckStatus.escapeVector.x * 2.5 + dirX * 0.2 + repulsion.x * 0.5;
        combinedDirY = stuckStatus.escapeVector.y * 2.5 + dirY * 0.2 + repulsion.y * 0.5;
        
        // Add some jitter to help break out of stuck positions
        if (Math.random() < 0.3) {
          combinedDirX += (Math.random() - 0.5) * 0.8;
          combinedDirY += (Math.random() - 0.5) * 0.8;
        }
      }
      
      // Normalize the combined direction
      const combinedLength = Math.max(0.1, Math.sqrt(combinedDirX * combinedDirX + combinedDirY * combinedDirY));
      const normalizedDirX = combinedDirX / combinedLength;
      const normalizedDirY = combinedDirY / combinedLength;
      
      // Calculate new position with combined forces
      const newX = enemy.position.x + normalizedDirX * enemy.speed * deltaTime * 60
      const newY = enemy.position.y + normalizedDirY * enemy.speed * deltaTime * 60
      
      // Only ghosts can move through walls; grunts need to respect walls
      if (enemy.type === 'ghost') {
        // Check for collision with other enemies using our helper function
        const willCollide = wouldCauseCollision(
          { x: newX, y: newY }, 
          enemy.id, 
          gameState.enemies, 
          TILE_SIZE * 0.7 // Minimum distance between enemies
        );
        
        if (!willCollide) {
          // No collision with other enemies, proceed with movement
        return {
          ...enemy,
          position: { x: newX, y: newY },
            direction: { x: dirX, y: dirY },
            aiState: distanceToPlayer <= (enemy.attackRange || 32) ? 'attack' : 'chase',
            rotation: Math.atan2(dirY, dirX),
          }
        } else {
          // Collision would occur, try slight adjustments
          const adjustmentAngles = [Math.PI/6, -Math.PI/6, Math.PI/4, -Math.PI/4];
          for (const angle of adjustmentAngles) {
            const adjustedDirX = Math.cos(Math.atan2(dirY, dirX) + angle);
            const adjustedDirY = Math.sin(Math.atan2(dirY, dirX) + angle);
            
            const adjustedX = enemy.position.x + adjustedDirX * enemy.speed * deltaTime * 60 * 0.8;
            const adjustedY = enemy.position.y + adjustedDirY * enemy.speed * deltaTime * 60 * 0.8;
            
            const wouldStillCollide = gameState.enemies.some(otherEnemy => {
              if (otherEnemy.id === enemy.id) return false;
              
              const otherX = otherEnemy.position.x;
              const otherY = otherEnemy.position.y;
              const minDistance = TILE_SIZE * 0.7;
              
              const newDx = adjustedX - otherX;
              const newDy = adjustedY - otherY;
              const newDistance = Math.sqrt(newDx * newDx + newDy * newDy);
              
              return newDistance < minDistance;
            });
            
            if (!wouldStillCollide) {
              // Found a position without collision
              return {
                ...enemy,
                position: { x: adjustedX, y: adjustedY },
                direction: { x: adjustedDirX, y: adjustedDirY },
                aiState: distanceToPlayer <= (enemy.attackRange || 32) ? 'attack' : 'chase',
                rotation: Math.atan2(adjustedDirY, adjustedDirX),
              };
            }
          }
          
          // If all adjustments failed, just update direction and state but don't move
          return {
            ...enemy,
            direction: { x: dirX, y: dirY },
            aiState: distanceToPlayer <= (enemy.attackRange || 32) ? 'attack' : 'chase',
            rotation: Math.atan2(dirY, dirX),
          };
        }
      }
      
      // For grunts, we need to check if the position is walkable
      if (enemy.type === 'grunt') {
        // Check if the new position is walkable for grunts
        if (isWalkablePosition(newX, newY)) {
          // Check for collision with other enemies using our helper function
          const willCollide = wouldCauseCollision(
            { x: newX, y: newY }, 
            enemy.id, 
            gameState.enemies, 
            TILE_SIZE * 0.7 // Minimum distance between enemies
          );
          
          if (!willCollide) {
            // No collision, proceed with movement
            return {
              ...enemy,
              position: { x: newX, y: newY },
              direction: { x: dirX, y: dirY },
              aiState: distanceToPlayer <= (enemy.attackRange || 32) ? 'attack' : 'chase',
              rotation: Math.atan2(dirY, dirX),
            }
          } else {
            // Collision would occur, try slight adjustments
            const adjustmentAngles = [Math.PI/6, -Math.PI/6, Math.PI/4, -Math.PI/4];
            for (const angle of adjustmentAngles) {
              const adjustedDirX = Math.cos(Math.atan2(dirY, dirX) + angle);
              const adjustedDirY = Math.sin(Math.atan2(dirY, dirX) + angle);
              
              const adjustedX = enemy.position.x + adjustedDirX * enemy.speed * deltaTime * 60 * 0.8;
              const adjustedY = enemy.position.y + adjustedDirY * enemy.speed * deltaTime * 60 * 0.8;
              
              if (isWalkablePosition(adjustedX, adjustedY)) {
                const wouldStillCollide = wouldCauseCollision(
                  { x: adjustedX, y: adjustedY },
                  enemy.id,
                  gameState.enemies,
                  TILE_SIZE * 0.7
                );
                
                if (!wouldStillCollide) {
                  // Found a position without collision
                  return {
                    ...enemy,
                    position: { x: adjustedX, y: adjustedY },
                    direction: { x: adjustedDirX, y: adjustedDirY },
                    aiState: distanceToPlayer <= (enemy.attackRange || 32) ? 'attack' : 'chase',
                    rotation: Math.atan2(adjustedDirY, adjustedDirX),
                  };
                }
              }
            }
          }
        }
        
        // If not walkable or collision would occur, try moving only horizontally or vertically
        const newXOnly = { x: newX, y: enemy.position.y };
        if (isWalkablePosition(newXOnly.x, newXOnly.y)) {
          // Check for horizontal collision
          const willCollideHorizontally = wouldCauseCollision(
            newXOnly,
            enemy.id,
            gameState.enemies,
            TILE_SIZE * 0.7
          );
          
          if (!willCollideHorizontally) {
            return {
              ...enemy,
              position: newXOnly,
              direction: { x: dirX, y: 0 },
              aiState: distanceToPlayer <= (enemy.attackRange || 32) ? 'attack' : 'chase',
              rotation: Math.atan2(dirY, dirX),
            }
          }
        }
        
        const newYOnly = { x: enemy.position.x, y: newY };
        if (isWalkablePosition(newYOnly.x, newYOnly.y)) {
          // Check for vertical collision
          const willCollideVertically = wouldCauseCollision(
            newYOnly,
            enemy.id,
            gameState.enemies,
            TILE_SIZE * 0.7
          );
          
          if (!willCollideVertically) {
            return {
              ...enemy,
              position: newYOnly,
              direction: { x: 0, y: dirY },
              aiState: distanceToPlayer <= (enemy.attackRange || 32) ? 'attack' : 'chase',
              rotation: Math.atan2(dirY, dirX),
            }
          }
        }
        
        // If still not walkable or collision would occur, stay in place but update direction and state
        return {
          ...enemy,
          direction: { x: dirX, y: dirY },
          aiState: distanceToPlayer <= (enemy.attackRange || 32) ? 'attack' : 'chase',
          rotation: Math.atan2(dirY, dirX),
        }
      }
      // Check if new position is walkable (for non-ghosts)
      if (isWalkablePosition(newX, newY)) {
        // Check for collision with other enemies
        const willCollide = gameState.enemies.some(otherEnemy => {
          if (otherEnemy.id === enemy.id) return false; // Skip self
          
          const otherX = otherEnemy.position.x;
          const otherY = otherEnemy.position.y;
          const minDistance = TILE_SIZE * 0.7; // Minimum distance between enemies
          
          const newDx = newX - otherX;
          const newDy = newY - otherY;
          const newDistance = Math.sqrt(newDx * newDx + newDy * newDy);
          
          return newDistance < minDistance;
        });
        
        if (!willCollide) {
         if (enemy.type === 'mm') {
            return {
              ...enemy,
              position: { x: newX, y: newY },
              direction: { x: dirX, y: dirY },
              aiState: distanceToPlayer <= enemy.attackRange ? 'attack' : 'chase',
              rotation: Math.atan2(dirY, dirX),
            };
          }
          return {
            ...enemy,
            position: { x: newX, y: newY },
            direction: { x: dirX, y: dirY },
            aiState: distanceToPlayer <= enemy.attackRange ? 'attack' : 'chase'
          }
        }
        
        // If collision would occur, try slight adjustments
        const adjustmentAngles = [Math.PI/6, -Math.PI/6, Math.PI/4, -Math.PI/4];
        for (const angle of adjustmentAngles) {
          const adjustedDirX = Math.cos(Math.atan2(dirY, dirX) + angle);
          const adjustedDirY = Math.sin(Math.atan2(dirY, dirX) + angle);
          
          const adjustedX = enemy.position.x + adjustedDirX * enemy.speed * deltaTime * 60 * 0.8;
          const adjustedY = enemy.position.y + adjustedDirY * enemy.speed * deltaTime * 60 * 0.8;
          
          if (isWalkablePosition(adjustedX, adjustedY)) {
            const wouldCollide = wouldCauseCollision(
              { x: adjustedX, y: adjustedY },
              enemy.id,
              gameState.enemies,
              TILE_SIZE * 0.7
            );
            
            if (!wouldCollide) {
              if (enemy.type === 'mm') {
                return {
                  ...enemy,
                  position: { x: adjustedX, y: adjustedY },
                  direction: { x: adjustedDirX, y: adjustedDirY },
                  aiState: distanceToPlayer <= enemy.attackRange ? 'attack' : 'chase',
                  rotation: Math.atan2(adjustedDirY, adjustedDirX),
                };
              }
              return {
                ...enemy,
                position: { x: adjustedX, y: adjustedY },
                direction: { x: adjustedDirX, y: adjustedDirY },
                aiState: distanceToPlayer <= enemy.attackRange ? 'attack' : 'chase'
              }
            }
          }
        }
      }
      
      // If not walkable or all adjustments failed, try moving only horizontally or vertically
      const newXOnly = { x: newX, y: enemy.position.y }
      const newYOnly = { x: enemy.position.x, y: newY }
      
      if (isWalkablePosition(newXOnly.x, newXOnly.y)) {
        if (enemy.type === 'mm') {
          return {
            ...enemy,
            position: newXOnly,
            direction: { x: dirX, y: 0 },
            aiState: distanceToPlayer <= enemy.attackRange ? 'attack' : 'chase',
            rotation: Math.atan2(dirY, dirX),
          };
        }
        return {
          ...enemy,
          position: newXOnly,
          direction: { x: dirX, y: 0 },
          aiState: distanceToPlayer <= enemy.attackRange ? 'attack' : 'chase'
        }
      }
      
      if (isWalkablePosition(newYOnly.x, newYOnly.y)) {
        if (enemy.type === 'mm') {
          return {
            ...enemy,
            position: newYOnly,
            direction: { x: 0, y: dirY },
            aiState: distanceToPlayer <= enemy.attackRange ? 'attack' : 'chase',
            rotation: Math.atan2(dirY, dirX),
          };
        }
        return {
          ...enemy,
          position: newYOnly,
          direction: { x: 0, y: dirY },
          aiState: distanceToPlayer <= enemy.attackRange ? 'attack' : 'chase'
        }
      }
    }
    
    // Use the enemyAI system as fallback
    return enemyAI.current.updateEnemyAI(enemy, playerPos, gameState, deltaTime)
  }, [isWalkablePosition, calculateRepulsionForce, wouldCauseCollision, checkAndHandleStuckEnemy])

  // Update enemy AI - make them more aggressive
  const updateEnemies = useCallback((deltaTime: number) => {
    setGameState(prev => {
      const playerPos = prev.player.position
      
      return {
        ...prev,
        enemies: prev.enemies.map(enemy => updateSingleEnemy(enemy, playerPos, prev, deltaTime))
      }
    })
  }, [updateSingleEnemy])

  // Add spawner health state
  const [spawnerHealth, setSpawnerHealth] = useState<{ [key: string]: number }>({});

  // Helper: Get spawner key
  const getSpawnerKey = (x: number, y: number) => `${x},${y}`;

  // Helper: Flash spawner (for visual feedback)
  const [spawnerFlash, setSpawnerFlash] = useState<{ [key: string]: number }>({});

  // On room transition or map change, reset spawner health
  useEffect(() => {
    const newHealth: { [key: string]: number } = {};
    for (let y = 0; y < gameState.level.map.length; y++) {
      for (let x = 0; x < gameState.level.map[y].length; x++) {
        const t = gameState.level.map[y][x];
        if (t === 'B') {
          newHealth[getSpawnerKey(x, y)] = 20; // 20 health points for bone piles
        } else if (t === 'G') {
          newHealth[getSpawnerKey(x, y)] = 20; // 20 health points for grunt spawners
        }
      }
    }
    setSpawnerHealth(newHealth);
    setSpawnerFlash({});
  }, [gameState.level.map]);

  // Handle player attack (spacebar)
  const handlePlayerAttackSpawner = useCallback(() => {
    const player = gameState.player;
    let dx = 0, dy = 0;
    if (player.direction === 'north') dy = -1;
    if (player.direction === 'south') dy = 1;
    if (player.direction === 'east') dx = 1;
    if (player.direction === 'west') dx = -1;
    const tileX = Math.floor((player.position.x + TILE_SIZE / 2) / TILE_SIZE) + dx;
    const tileY = Math.floor((player.position.y + TILE_SIZE / 2) / TILE_SIZE) + dy;
    const t = gameState.level.map[tileY]?.[tileX];
    if (t === 'B' || t === 'G') {
      const key = getSpawnerKey(tileX, tileY);
      setSpawnerHealth(prev => {
        const newHealth = { ...prev };
        // Calculate damage amount - using same damage system as enemies
        const damageAmount = gameProgress.powerUpActive && gameProgress.powerUpType === 'attack_buff' ? 12 : 7;
        
        if (newHealth[key] > 0) {
          newHealth[key] = Math.max(0, newHealth[key] - damageAmount);
          // Flash effect
          setSpawnerFlash(flash => ({ ...flash, [key]: Date.now() }));
          // If destroyed, remove from map
          if (newHealth[key] <= 0) {
            // Spawner is destroyed
            console.log(`💥 Spawner at ${tileX},${tileY} (${t}) destroyed!`);
            
            // Mark the spawner as destroyed in our centralized tracker
            markSpawnerDestroyed(tileX, tileY);
            
            // Update the map to replace the spawner with a floor tile
            setGameState(prevState => {
              const newMap = prevState.level.map.map(row => [...row]);
              newMap[tileY][tileX] = '.';
              return {
                ...prevState,
                level: {
                  ...prevState.level,
                  map: newMap
                }
              };
            });
            
            // Add debugging to verify map was updated
            setTimeout(() => {
              const currentTile = gameState.level.map[tileY]?.[tileX];
              console.log(`Verification: Tile at ${tileX},${tileY} is now '${currentTile}'`);
              
              // Double-check our tracker state
              console.log(`Spawner state check: isActive=${isSpawnerActive(tileX, tileY, t)}`);
            }, 100);
          }
        }
        return newHealth;
      });
    }
  }, [gameState.player, gameState.level.map, gameProgress.powerUpActive, gameProgress.powerUpType, TILE_SIZE, markSpawnerDestroyed, isSpawnerActive]);

  // Handle key down
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const key = e.key.toLowerCase()
    keysPressed.current.add(key)
    
    // Handle spacebar for attack
    if (key === ' ') {
      e.preventDefault() // Prevent page scrolling
      
      // Only attack if not already attacking
      if (gameState.player.animation !== 'attack') {
        // Set player animation to attack
        setGameState(prev => ({
          ...prev,
          player: {
            ...prev.player,
            animation: 'attack'
          }
        }))
        
        // Call the spawner attack function
        handlePlayerAttackSpawner();
        
        // Calculate attack position based on player direction
        const player = gameState.player;
        const attackPosition = { x: player.position.x, y: player.position.y };
        const attackOffset = TILE_SIZE * 0.6; // Offset for attack effect
        
        // Position the attack effect based on player direction
        switch (player.direction) {
          case 'north':
            attackPosition.y -= attackOffset;
            break;
          case 'south':
            attackPosition.y += attackOffset;
            break;
          case 'east':
            attackPosition.x += attackOffset;
            break;
          case 'west':
            attackPosition.x -= attackOffset;
            break;
        }
        
        // Reset animation after attack duration
        setTimeout(() => {
          setGameState(prev => ({
            ...prev,
            player: {
              ...prev.player,
              animation: prev.player.isMoving ? 'walk' : 'idle'
            }
          }))
        }, 300) // Match this with the attack animation duration
        
        // Calculate adjusted player position for hit detection
        const playerPos = gameState.player.position;
        const playerSize = TILE_SIZE * 1.2; // 20% larger hero size
        const adjustedPlayerPos = {
          x: playerPos.x + playerSize * 0.1,
          y: playerPos.y + playerSize * 0.1
        };
        
        setGameState(prev => {
          const updatedEnemies = prev.enemies.map(enemy => {
            const distance = Math.sqrt(
              Math.pow(enemy.position.x - adjustedPlayerPos.x, 2) +
              Math.pow(enemy.position.y - adjustedPlayerPos.y, 2)
            )
            
            // Only attack if line of sight - increased attack range for larger hero
            if (distance < TILE_SIZE * 1.8 && hasLineOfSight(adjustedPlayerPos, enemy.position, gameState.level.map, TILE_SIZE)) {
              // Apply attack buff if active - base damage increased to 7
              const damageAmount = gameProgress.powerUpActive && gameProgress.powerUpType === 'attack_buff' ? 12 : 7
              const newHealth = enemy.health - damageAmount
              
              // Add attack effect at the enemy's position when hit
              const effectId = `attack_${Date.now()}_${Math.random()}`;
              setAttackEffects(prev => [...prev, {
                id: effectId,
                x: enemy.position.x + enemy.size / 2,
                y: enemy.position.y + enemy.size / 2
              }]);
              
              // Only kill if health reaches 0
              if (newHealth <= 0) {
                handleEnemyKilled(enemy.id)
                return null // Remove enemy
              }
              
              const hitEnemy = {
                ...enemy,
                health: newHealth,
                hitFlash: Date.now() // Set hitFlash timestamp for enemy
              };
              
              // Clear hitFlash after 500ms
              setTimeout(() => {
                setGameState(prevState => ({
                  ...prevState,
                  enemies: prevState.enemies.map(e => 
                    e.id === hitEnemy.id ? { ...e, hitFlash: undefined } : e
                  )
                }));
              }, 500);
              
              return hitEnemy;
            }
            return enemy
          }).filter(Boolean) as EnemyConfig[]
          
          return {
            ...prev,
            enemies: updatedEnemies
          }
        })
      }
    }
  }, [gameState.player.position, gameState.player.direction, gameState.level.map, gameProgress.powerUpActive, gameProgress.powerUpType, handleEnemyKilled, handlePlayerAttackSpawner, TILE_SIZE])

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    const key = e.key.toLowerCase()
    keysPressed.current.delete(key)
    e.preventDefault()
  }, [])

  // Check interactions
  useEffect(() => {
    const player = gameState.player
    
    // No more chest interactions
    
    // Check tile interactions (doors, etc.)
    const tileX = Math.floor((player.position.x + TILE_SIZE / 2) / TILE_SIZE)
    const tileY = Math.floor((player.position.y + TILE_SIZE / 2) / TILE_SIZE)
    const currentTile = gameState.level.map[tileY]?.[tileX]
    
    if (currentTile === 'D') {
      // Door logic
      if (gameProgress.currentRoom === 'S1' && gameProgress.kills >= 50) {
        handleRoomTransition('S3')
      } else if (currentTile === 'D' && gameProgress.currentRoom === 'S3' && gameProgress.kills >= 100) {
        handleRoomTransition('S2')
      }
    } else if (currentTile === 'E') {
      // Exit door - works when player reaches it
      handleGameWin();
    }
  }, [gameState.player.position, gameState.level.map, gameProgress, handleRoomTransition, handleGameWin, TILE_SIZE])

  // Initialize game
  useEffect(() => {
    setGameState(prev => ({
      ...prev,
      chests: initializeChests('S1'),
      foodPlatters: initializeFoodPlatters('S1')
    }))
    
    // Initialize camera position to center on player
    updateCameraPosition(gameState.player.position.x, gameState.player.position.y)

    // Add initial grunt enemies instead of ghosts
    setGameState(prev => {
      // Disabled initial enemies
      // const initialEnemies: EnemyConfig[] = [];
      // for (let i = 0; i < 4; i++) {
      //   const positions = [
      //     { x: 6 * TILE_SIZE, y: 6 * TILE_SIZE },
      //     { x: 30 * TILE_SIZE, y: 6 * TILE_SIZE },
      //     { x: 6 * TILE_SIZE, y: 30 * TILE_SIZE },
      //     { x: 30 * TILE_SIZE, y: 30 * TILE_SIZE }
      //   ];
      //   initialEnemies.push({
      //     id: `grunt_${Date.now()}_${i}`,
      //     type: 'grunt',
      //     position: positions[i],
      //     health: 3,
      //     maxHealth: 3,
      //     speed: 1.2,
      //     damage: 2,
      //     size: TILE_SIZE,
      //     rotation: Math.random() * Math.PI * 2,
      //     direction: { x: 0, y: 0 },
      //     aiType: 'aggressive',
      //     aiState: 'chase',
      //     sightRange: 350,
      //     attackRange: 50,
      //     color: '#8B4513' // Brown color for grunt
      //   });
      // }
      // return {
      //   ...prev,
      //   enemies: [...prev.enemies, ...initialEnemies]
      // };
      return prev;
    });
    
    // Staggered initial spawner setup
    const map = LEVEL_MAPS.S1;
    
    // First, collect all spawners from the CURRENT map (not from level maps)
    // This ensures we don't restart destroyed spawners
    const gruntSpawners = [];
    const ghostSpawners = [];
    
    for (let y = 0; y < gameState.level.map.length; y++) {
      for (let x = 0; x < gameState.level.map[y].length; x++) {
        if (gameState.level.map[y][x] === 'G') {
          gruntSpawners.push({x, y});
        }
        if (gameState.level.map[y][x] === 'B') {
          ghostSpawners.push({x, y});
        }
      }
    }
    
    console.log(`Found ${gruntSpawners.length} grunt spawners and ${ghostSpawners.length} ghost spawners`);
    
    // Initialize our spawner state tracker
    gruntSpawners.forEach(spawner => {
      const key = getSpawnerKey(spawner.x, spawner.y);
      spawnerState.current.active[key] = true;
      spawnerState.current.lastUpdated[key] = Date.now();
    });
    
    ghostSpawners.forEach(spawner => {
      const key = getSpawnerKey(spawner.x, spawner.y);
      spawnerState.current.active[key] = true;
      spawnerState.current.lastUpdated[key] = Date.now();
    });
    
    console.log('🧠 Initialized spawner state tracker with active spawners');
    
    // Now initialize each type with properly staggered timing
    gruntSpawners.forEach((spawner, index) => {
          setTimeout(() => {
        // Check if the spawner is still active before starting spawn cycle
        if (isSpawnerActive(spawner.x, spawner.y, 'G')) {
          spawnGruntFromGenerator(spawner.x, spawner.y);
        }
      }, 1000 + index * 1000); // Stagger grunt spawners by 1 second each
    });
        
    ghostSpawners.forEach((spawner, index) => {
          setTimeout(() => {
        // Check if the spawner is still active before starting spawn cycle
        if (isSpawnerActive(spawner.x, spawner.y, 'B')) {
          spawnGhostFromGenerator(spawner.x, spawner.y);
        }
      }, 2000 + index * 2500); // Stagger ghost spawners by 2.5 seconds each, starting after grunts
    });
  }, [TILE_SIZE, initializeChests, updateCameraPosition, spawnGruntFromGenerator, spawnGhostFromGenerator, initializeFoodPlatters, isSpawnerActive])

  // Start game loop
  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(gameLoop)
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [gameLoop])

  // Event listeners
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [handleKeyDown, handleKeyUp])

  // Add a useEffect for health drain over time
  useEffect(() => {
    if (gameProgress.playerDead) return;
    const interval = setInterval(() => {
      setGameState(prev => {
        if (prev.player.health > 0) {
          return {
            ...prev,
            player: {
              ...prev.player,
              health: Math.max(0, prev.player.health - 1),
              animation: prev.player.health > 1 ? prev.player.animation : 'hurt',
              hitFlash: prev.player.health > 1 ? prev.player.hitFlash : Date.now()
            }
          }
        }
        return prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [gameProgress.playerDead]);

  // 2. Add Shift shortcut to add +500 health
  useEffect(() => {
    function handleAddHealthShortcut(e: KeyboardEvent) {
      if (e.key === 'Shift' || e.key === 'ShiftLeft' || e.key === 'ShiftRight') {
        setGameState(prev => ({
          ...prev,
          player: {
            ...prev.player,
            health: Math.min(prev.player.maxHealth, prev.player.health + 500)
          }
        }));
      }
    }
    window.addEventListener('keydown', handleAddHealthShortcut);
    return () => window.removeEventListener('keydown', handleAddHealthShortcut);
  }, []);

  // Add state to track if music is playing or needs user interaction
  const [musicStarted, setMusicStarted] = useState(false);
  const [musicError, setMusicError] = useState(false);

  // Play dungeon background music on mount
  useEffect(() => {
    const audio = new window.Audio(DUNGEON_AUDIO_SRC);
    audio.loop = true;
    audio.volume = 0.15; // Low volume
    audio.play().then(() => {
      setMusicStarted(true);
    }).catch(() => {
      setMusicError(true);
    }); // Ignore autoplay errors
    return () => {
      audio.pause();
      audio.currentTime = 0;
    };
  }, []);

  // Handler to start music on user interaction
  const handleStartMusic = () => {
    const audio = new window.Audio(DUNGEON_AUDIO_SRC);
    audio.loop = true;
    audio.volume = 0.15;
    audio.play().then(() => {
      setMusicStarted(true);
      setMusicError(false);
    });
  };

  // Add a debug function to print the map layout
  const debugPrintMap = useCallback(() => {
    console.log("Map Layout with Spawners:");
    let spawnerCount = { B: 0, G: 0 };
    
    for (let y = 0; y < gameState.level.map.length; y++) {
      let row = '';
      for (let x = 0; x < gameState.level.map[y].length; x++) {
        const tile = gameState.level.map[y][x];
        row += tile;
        if (tile === 'B') spawnerCount.B++;
        if (tile === 'G') spawnerCount.G++;
      }
      console.log(row);
    }
    
    console.log(`Found ${spawnerCount.B} ghost spawners (B) and ${spawnerCount.G} grunt spawners (G) in the map.`);
  }, [gameState.level.map]);
  
  // Call the debug function once on mount
  useEffect(() => {
    debugPrintMap();
  }, [debugPrintMap]);

  // In game initialization (inside useEffect or similar):
  useEffect(() => {
    if (!gameState.foodPlatters) return;
    const player = gameState.player;
    const playerSize = TILE_SIZE * 1.2;
    const playerCenter = {
      x: player.position.x + playerSize / 2,
      y: player.position.y + playerSize / 2
    };
    for (const platter of gameState.foodPlatters) {
      if (platter.isEaten) continue;
      const platterCenter = {
        x: platter.position.x + TILE_SIZE / 2,
        y: platter.position.y + TILE_SIZE / 2
      };
      const dist = Math.hypot(playerCenter.x - platterCenter.x, playerCenter.y - platterCenter.y);
      if (dist < TILE_SIZE * 0.7) {
        // Eat the food platter
        setGameState(prev => ({
          ...prev,
          foodPlatters: prev.foodPlatters?.map(fp => fp.id === platter.id ? { ...fp, isEaten: true } : fp),
          player: {
            ...prev.player,
            health: Math.min(prev.player.health + 20, prev.player.maxHealth)
          }
        }));
        break;
      }
    }
  }, [gameState.player.position, gameState.foodPlatters, TILE_SIZE]);

  // Helper: Initialize keys and doors at Gauntlet-inspired locations
  const initializeKeys = useCallback((room: 'S1' | 'S3' | 'S2') => {
    // Place keys at specific, known open tiles
    const positions = [
      { x: 6, y: 6 },    // Top-left room
      { x: 24, y: 24 },  // Center room
      { x: 41, y: 41 }   // Bottom-right room
    ];
    return positions.map((pos, i) => ({
      id: i,
      position: { x: pos.x * TILE_SIZE, y: pos.y * TILE_SIZE },
      isCollected: false
    }));
  }, [TILE_SIZE]);

  const initializeDoors = useCallback((room: 'S1' | 'S3' | 'S2') => {
    const positions = [
      { x: 17, y: 0 }, { x: 0, y: 17 }, { x: 35, y: 17 }, { x: 17, y: 35 }
    ];
    return positions.map((pos, i) => ({
      id: i,
      position: { x: pos.x * TILE_SIZE, y: pos.y * TILE_SIZE },
      isOpen: false
    }));
  }, [TILE_SIZE]);

  // Key collection logic
  useEffect(() => {
    if (!gameState.keys) return;
    const player = gameState.player;
    const playerSize = TILE_SIZE * 1.2;
    const playerCenter = {
      x: player.position.x + playerSize / 2,
      y: player.position.y + playerSize / 2
    };
    for (const key of gameState.keys) {
      if (key.isCollected) continue;
      const keyCenter = {
        x: key.position.x + TILE_SIZE / 2,
        y: key.position.y + TILE_SIZE / 2
      };
      const dist = Math.hypot(playerCenter.x - keyCenter.x, playerCenter.y - keyCenter.y);
      if (dist < TILE_SIZE * 0.7) {
        setGameState(prev => ({
          ...prev,
          keys: prev.keys?.map(k => k.id === key.id ? { ...k, isCollected: true } : k)
        }));
        setGameProgress(prev => ({
          ...prev,
          keyCount: (prev.keyCount || 0) + 1
        }));
        break;
      }
    }
  }, [gameState.player.position, gameState.keys, TILE_SIZE]);

  // Door opening logic: only unlock the specific door the player collides with
  useEffect(() => {
    if (!gameState.doors) return;
    const player = gameState.player;
    const playerSize = TILE_SIZE * 1.2;
    const playerCenter = {
      x: player.position.x + playerSize / 2,
      y: player.position.y + playerSize / 2
    };
    let unlockedDoorIndex = -1;
    const newDoors = gameState.doors.map((door, idx) => {
      if (door.isOpen) return door;
      const doorCenter = {
        x: door.position.x + TILE_SIZE / 2,
        y: door.position.y + TILE_SIZE / 2
      };
      const dist = Math.hypot(playerCenter.x - doorCenter.x, playerCenter.y - doorCenter.y);
      if (unlockedDoorIndex === -1 && dist < TILE_SIZE * 0.7 && keyEquipped) {
        unlockedDoorIndex = idx;
        return { ...door, isOpen: true };
      }
      return door;
    });
    if (unlockedDoorIndex !== -1) {
      setGameState(prev => ({
        ...prev,
        doors: newDoors
      }));
      setGameProgress(prev => ({
        ...prev,
        keyCount: (prev.keyCount || 0) - 1
      }));
      setKeyEquipped(false);
    }
  }, [gameState.player.position, gameState.doors, keyEquipped, TILE_SIZE]);

  // After state initialization (update keys and doors based on map)
  useEffect(() => {
    setGameState(prev => ({
      ...prev,
      keys: findKeysInMap(prev.level.map, 32),
      doors: findDoorsInMap(prev.level.map, 32)
    }));
    setGameProgress(prev => ({
      ...prev,
      keyCount: 0
    }));
  }, []);

  // Add state for equipped key


  if (gameProgress.gameWon) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-6xl font-bold text-yellow-400 mb-4">🎉 YOU ESCAPED! 🎉</h1>
          <p className="text-2xl text-white mb-4">Total Kills: {gameProgress.kills}</p>
          <p className="text-lg text-gray-300">Great job, hero!</p>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-6 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Play Again
          </button>
        </div>
      </div>
    )
  }

  // Death screen
  if (gameProgress.playerDead) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        {/* Blood-red overlay with animation */}
        <div 
          className="absolute inset-0 bg-red-900/30 animate-pulse" 
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(220,38,38,0.2) 0%, rgba(127,29,29,0.4) 100%)',
            boxShadow: 'inset 0 0 100px rgba(127,29,29,0.6)'
          }}
        />
        
        <div className="text-center relative z-10">
          {/* Large skull icon */}
          <div className="text-9xl mb-4 animate-bounce">💀</div>
          
          <h1 className="text-6xl font-bold text-red-500 mb-6 animate-pulse">YOU DIED!</h1>
          
          <div className="bg-gray-900/80 backdrop-blur-sm p-6 rounded-lg border border-red-800 mb-8">
            <p className="text-2xl text-white mb-4">Total Kills: <span className="text-red-400">{gameProgress.kills}</span></p>
            <p className="text-lg text-gray-300 mb-2">The dungeon claims another victim...</p>
            <p className="text-sm text-gray-400 italic">Room: {gameProgress.currentRoom}</p>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={() => window.location.reload()} 
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 shadow-lg"
            >
              Try Again
            </button>
            <button 
              onClick={() => {
                // Reset player health and position but keep progress
                setGameState(prev => ({
                  ...prev,
                  player: {
                    ...prev.player,
                    health: prev.player.maxHealth,
                    position: { x: 64, y: 64 }
                  }
                }));
                setGameProgress(prev => ({
                  ...prev,
                  playerDead: false
                }));
              }} 
              className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors duration-200 shadow-lg"
            >
              Continue (Respawn)
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
      {/* Music start overlay if needed */}
      {musicError && !musicStarted && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80">
          <button
            className="px-8 py-4 text-xl font-bold text-yellow-200 bg-gray-800 rounded-lg shadow-lg border-2 border-yellow-400 hover:bg-gray-700"
            onClick={handleStartMusic}
          >
            Click to Start Dungeon Music
          </button>
        </div>
      )}
      <div className="relative">
        {/* Game HUD - unified, modern */}
              {showHUD && (
          <GameHUD
            health={gameState.player.health}
            maxHealth={gameState.player.maxHealth}
            score={gameState.player.score}
            potions={gameProgress.potionsCollected.size}
            kills={gameProgress.kills}
            room={gameProgress.currentRoom}
            enemies={gameState.enemies.length}
            powerUpActive={gameProgress.powerUpActive}
            powerUpType={gameProgress.powerUpType}
            powerUpEndTime={gameProgress.powerUpEndTime}
            currentTime={Date.now()}
            onClose={() => setShowHUD(false)}
            keyCount={gameProgress.keyCount || 0}
          />
        )}
        {!showHUD && (
              <button 
            className="absolute top-2 right-2 z-40 bg-gray-800 hover:bg-gray-700 text-white px-3 py-1 rounded shadow border border-gray-600"
            onClick={() => setShowHUD(true)}
            tabIndex={0}
              >
            Show HUD
              </button>
        )}
        
        <div className="relative border-4 border-gray-600 rounded-lg overflow-hidden bg-gray-800" 
             style={{ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT }}>
          <div className="absolute" style={{ 
            transform: `translate(${-cameraPosition.x}px, ${-cameraPosition.y}px)`,
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT,
            willChange: 'transform' // Hint to browser to optimize transforms
          }}>
          <GameCanvas
              gameState={{
                ...gameState,
                enemies: visibleEnemies // Only render enemies in viewport
              }}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            gameProgress={gameProgress}
            spawnerHealth={spawnerHealth}
            spawnerFlash={spawnerFlash}
          />
          
          {/* Character Layer */}
          <div
            style={{
              position: 'absolute',
              left: gameState.player.position.x - TILE_SIZE * 0.1, // Offset to center the bigger character
              top: gameState.player.position.y - TILE_SIZE * 0.1, // Offset to center the bigger character
              width: TILE_SIZE * 1.2, // 20% bigger
              height: TILE_SIZE * 1.2, // 20% bigger
              zIndex: 1000,
              transition: 'none'
            }}
          >
            <AnimatedCharacter
              direction={gameState.player.direction}
              state={(['idle', 'walk', 'attack'].includes(gameState.player.animation) ? gameState.player.animation : 'idle') as 'idle' | 'walk' | 'attack'}
              characterName="assasin-wolf"
              size={TILE_SIZE * 1.2}
              debug={false}
              hitFlash={gameState.player.hitFlash}
              useLocalAssets={true}
            />
            </div>
          </div>
        </div>

        {/* Attack Effects Layer */}
        {attackEffects.map(effect => (
          <AttackEffect
            key={effect.id}
            x={effect.x}
            y={effect.y}
            size={TILE_SIZE * 0.7}
            onComplete={() => handleEffectComplete(effect.id)}
          />
        ))}

        {/* Chests Layer */}
        {gameState.chests && gameState.chests.length > 0 && (
          <GameObjects 
            chests={gameState.chests} 
            tileSize={TILE_SIZE}
            chestsOpened={gameProgress.chestsOpened}
            cameraPosition={cameraPosition}
            width={VIEWPORT_WIDTH}
            height={VIEWPORT_HEIGHT}
            foodPlatters={gameState.foodPlatters}
            keys={gameState.keys}
            doors={gameState.doors}
          />
        )}

        {/* HUD overlay */}
        {/* REMOVE the old custom HUD block here (top-4 left-4 right-4 z-20) and its children */}

        {/* Game over screen */}
        {gameProgress.playerDead && (
          <div className="absolute inset-0 bg-black bg-opacity-80 flex flex-col items-center justify-center text-white">
            <h1 className="text-4xl mb-4">GAME OVER</h1>
            <p className="text-xl mb-8">Score: {gameProgress.score}</p>
            <button
              className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
              onClick={() => window.location.reload()}
            >
              Try Again
            </button>
          </div>
        )}

        {/* Victory screen */}
        {gameProgress.gameWon && (
          <div className="absolute inset-0 bg-black bg-opacity-80 flex flex-col items-center justify-center text-white">
            <h1 className="text-4xl mb-4">YOU ESCAPED!</h1>
            <p className="text-xl mb-2">Score: {gameProgress.score}</p>
            <p className="text-xl mb-8">Enemies defeated: {gameProgress.kills}</p>
            <button
              className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
              onClick={() => window.location.reload()}
            >
              Play Again
            </button>
          </div>
        )}

        <div className="mt-4 text-center text-gray-400 text-sm">
          <p>🎯 <strong>GOAL:</strong> Kill {gameProgress.currentRoom === 'S1' ? '50' : gameProgress.currentRoom === 'S3' ? '100' : 'all'} enemies to unlock doors</p>
          <p>⌨️ Arrow Keys = Move | SPACEBAR = Attack</p>
          <p>🧌 MM enemies have different sizes, speeds, and AI behaviors!</p>
        </div>
      </div>
    </div>
  )
}